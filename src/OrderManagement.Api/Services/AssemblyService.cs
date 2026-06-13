using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class AssemblyService(
    AppDbContext db,
    WarehouseService warehouse,
    InventoryCostService inventoryCost,
    ArticleSequenceService sequences)
{
    public async Task<StockAssembly?> LoadAsync(Guid tenantId, Guid id, CancellationToken ct) =>
        await db.StockAssemblies
            .Include(a => a.OutputProduct)
            .Include(a => a.OutputWarehouse)
            .Include(a => a.Lines.OrderBy(l => l.SortOrder))
            .ThenInclude(l => l.Product)
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);

    public async Task<StockAssembly> CreateDraftAsync(
        Guid tenantId,
        CreateStockAssemblyRequest request,
        CancellationToken ct)
    {
        await ValidateOutputProductAsync(tenantId, request.OutputProductId, ct);
        await ValidateLinesAsync(tenantId, request.OutputProductId, request.Lines, ct);

        var outputProduct = await db.Products.FirstAsync(
            p => p.Id == request.OutputProductId && p.TenantId == tenantId, ct);
        var wh = await ResolveOutputWarehouseAsync(tenantId, outputProduct, request.OutputWarehouseId, ct);

        var number = await sequences.AllocateNextAsync(tenantId, "ASM", ct);
        var now = DateTime.UtcNow;

        var assembly = new StockAssembly
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssemblyNumber = number,
            AssemblyDate = UtcDate(request.AssemblyDate),
            OutputProductId = outputProduct.Id,
            OutputWarehouseId = wh.Id,
            OutputQuantity = StockQuantity.Normalize(request.OutputQuantity),
            AdditionalCostIls = InventoryCostService.RoundIls(Math.Max(0, request.AdditionalCostIls)),
            Notes = TrimOrNull(request.Notes),
            Status = StockAssemblyStatus.Draft,
            CreatedAt = now,
            UpdatedAt = now,
        };

        ApplyLines(assembly, request.Lines);
        db.StockAssemblies.Add(assembly);
        await db.SaveChangesAsync(ct);
        return (await LoadAsync(tenantId, assembly.Id, ct))!;
    }

    public async Task<StockAssembly> UpdateDraftAsync(
        Guid tenantId,
        Guid id,
        UpdateStockAssemblyRequest request,
        CancellationToken ct)
    {
        var assembly = await db.StockAssemblies
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Assembly not found.");

        if (assembly.Status != StockAssemblyStatus.Draft)
            throw new InvalidOperationException("Only draft assemblies can be edited.");

        if (assembly.Version != request.Version)
            throw new InvalidOperationException("VERSION_CONFLICT");

        await ValidateOutputProductAsync(tenantId, request.OutputProductId, ct);
        await ValidateLinesAsync(tenantId, request.OutputProductId, request.Lines, ct);

        var outputProduct = await db.Products.FirstAsync(
            p => p.Id == request.OutputProductId && p.TenantId == tenantId, ct);
        var wh = await ResolveOutputWarehouseAsync(tenantId, outputProduct, request.OutputWarehouseId, ct);

        assembly.AssemblyDate = UtcDate(request.AssemblyDate);
        assembly.OutputProductId = outputProduct.Id;
        assembly.OutputWarehouseId = wh.Id;
        assembly.OutputQuantity = StockQuantity.Normalize(request.OutputQuantity);
        assembly.AdditionalCostIls = InventoryCostService.RoundIls(Math.Max(0, request.AdditionalCostIls));
        assembly.Notes = TrimOrNull(request.Notes);
        assembly.Version++;
        assembly.UpdatedAt = DateTime.UtcNow;

        await db.StockAssemblyLines
            .Where(l => l.StockAssemblyId == assembly.Id)
            .ExecuteDeleteAsync(ct);

        foreach (var line in BuildLineEntities(assembly.Id, request.Lines))
            db.StockAssemblyLines.Add(line);

        await db.SaveChangesAsync(ct);
        return (await LoadAsync(tenantId, assembly.Id, ct))!;
    }

    public async Task<StockAssembly> PostAsync(Guid tenantId, Guid id, int version, CancellationToken ct)
    {
        var assembly = await LoadAsync(tenantId, id, ct)
            ?? throw new InvalidOperationException("Assembly not found.");

        if (assembly.Status != StockAssemblyStatus.Draft)
            throw new InvalidOperationException("Assembly is already posted.");

        if (assembly.Version != version)
            throw new InvalidOperationException("VERSION_CONFLICT");

        if (assembly.Lines.Count == 0)
            throw new InvalidOperationException("Assembly must have at least one component line.");

        if (assembly.OutputQuantity <= 0)
            throw new InvalidOperationException("Output quantity must be positive.");

        var outputQty = StockQuantity.Normalize(assembly.OutputQuantity);
        var noteBase = assembly.AssemblyNumber;
        var movementDate = assembly.AssemblyDate;
        decimal inputCostTotal = 0;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            foreach (var line in assembly.Lines.OrderBy(l => l.SortOrder))
            {
                var product = line.Product;
                if (!ProductInventoryHelper.TracksStock(product))
                    continue;

                var wh = await warehouse.GetForProductAsync(tenantId, product, ct);
                var issueQty = ComponentTotalQuantity(line.Quantity, outputQty);
                var movement = await inventoryCost.IssueAsync(
                    tenantId,
                    product.Id,
                    wh.Id,
                    issueQty,
                    $"{noteBase} (assembly input)",
                    movementDate,
                    ct);
                line.IssueMovementId = movement.Id;
                inputCostTotal += movement.TotalCost ?? InventoryCostService.RoundIls(
                    (movement.UnitCost ?? 0) * issueQty);
            }

            inputCostTotal = InventoryCostService.RoundIls(inputCostTotal);
            var batchCost = InventoryCostService.RoundIls(inputCostTotal + assembly.AdditionalCostIls);
            var unitCost = InventoryCostService.RoundIls(batchCost / outputQty);
            if (unitCost <= 0)
                throw new InvalidOperationException("Output unit cost must be positive.");

            var (lot, outputMovement) = await inventoryCost.ReceiveAsync(
                tenantId,
                assembly.OutputProductId,
                assembly.OutputWarehouseId,
                assembly.OutputQuantity,
                unitCost,
                movementDate,
                InventoryLotSource.Assembly,
                assembly.Id,
                noteBase,
                ct);

            assembly.OutputLotId = lot.Id;
            assembly.OutputMovementId = outputMovement.Id;
            assembly.Status = StockAssemblyStatus.Posted;
            assembly.PostedAt = DateTime.UtcNow;
            assembly.Version++;
            assembly.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }

        return (await LoadAsync(tenantId, assembly.Id, ct))!;
    }

    public async Task DeleteDraftAsync(Guid tenantId, Guid id, CancellationToken ct)
    {
        var assembly = await db.StockAssemblies
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Assembly not found.");

        if (assembly.Status != StockAssemblyStatus.Draft)
            throw new InvalidOperationException("Only draft assemblies can be deleted.");

        db.StockAssemblies.Remove(assembly);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Issues missing component stock for a posted assembly that used pre-fix issue logic (qty not × output).</summary>
    public async Task RepairUnderIssuedComponentsAsync(
        Guid tenantId,
        Guid assemblyId,
        CancellationToken ct)
    {
        var assembly = await LoadAsync(tenantId, assemblyId, ct)
            ?? throw new InvalidOperationException("Assembly not found.");

        if (assembly.Status != StockAssemblyStatus.Posted)
            throw new InvalidOperationException("Only posted assemblies can be repaired.");

        var outputQty = StockQuantity.Normalize(assembly.OutputQuantity);
        var noteBase = $"{assembly.AssemblyNumber} (assembly correction)";
        var movementDate = assembly.AssemblyDate;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            foreach (var line in assembly.Lines.OrderBy(l => l.SortOrder))
            {
                var product = line.Product;
                if (!ProductInventoryHelper.TracksStock(product))
                    continue;

                var expectedTotal = ComponentTotalQuantity(line.Quantity, outputQty);
                decimal alreadyIssued = 0;
                if (line.IssueMovementId is { } movementId)
                {
                    var existing = await db.StockMovements.AsNoTracking()
                        .FirstOrDefaultAsync(m => m.Id == movementId, ct);
                    alreadyIssued = existing?.Quantity ?? 0;
                }

                var delta = StockQuantity.Normalize(expectedTotal - alreadyIssued);
                if (delta <= 0) continue;

                var wh = await warehouse.GetForProductAsync(tenantId, product, ct);
                var available = await inventoryCost.GetAvailableIssueQuantityAsync(
                    tenantId, product.Id, wh.Id, ct);
                var toIssue = Math.Min(delta, available);
                if (toIssue <= 0) continue;

                await inventoryCost.IssueAsync(
                    tenantId,
                    product.Id,
                    wh.Id,
                    toIssue,
                    noteBase,
                    movementDate,
                    ct);
            }

            if (assembly.OutputLotId is { } lotId)
            {
                var lot = await db.InventoryLots.FirstOrDefaultAsync(l => l.Id == lotId, ct);
                if (lot is not null)
                {
                    var inputTotal = await SumAssemblyInputCostAsync(assembly.AssemblyNumber, ct);
                    var batchCost = InventoryCostService.RoundIls(inputTotal + assembly.AdditionalCostIls);
                    lot.UnitCostIls = InventoryCostService.RoundIls(batchCost / outputQty);
                }
            }

            assembly.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    /// <summary>Adds a component line to a posted assembly, issues stock (perUnit × output qty), updates output lot cost.</summary>
    public async Task<StockAssembly> AddPostedComponentLineAsync(
        Guid tenantId,
        Guid assemblyId,
        Guid componentProductId,
        decimal perUnitQuantity,
        CancellationToken ct)
    {
        var assembly = await LoadAsync(tenantId, assemblyId, ct)
            ?? throw new InvalidOperationException("Assembly not found.");

        if (assembly.Status != StockAssemblyStatus.Posted)
            throw new InvalidOperationException("Can only add components to posted assemblies.");

        if (componentProductId == assembly.OutputProductId)
            throw new InvalidOperationException("Output product cannot be its own component.");

        if (assembly.Lines.Any(l => l.ProductId == componentProductId))
            throw new InvalidOperationException("Component is already on this assembly.");

        perUnitQuantity = StockQuantity.Normalize(perUnitQuantity);
        if (perUnitQuantity <= 0)
            throw new InvalidOperationException("Component quantity must be positive.");

        var component = await db.Products.FirstAsync(
            p => p.Id == componentProductId && p.TenantId == tenantId, ct);

        if (!AssemblyRecipeRules.CanBeAssemblyComponent(component))
            throw new InvalidOperationException(
                $"Component {component.ArticleCode} must track warehouse stock.");

        var outputQty = StockQuantity.Normalize(assembly.OutputQuantity);
        var issueQty = ComponentTotalQuantity(perUnitQuantity, outputQty);
        var note = $"{assembly.AssemblyNumber} (assembly add-on)";
        var movementDate = assembly.AssemblyDate;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            var wh = await warehouse.GetForProductAsync(tenantId, component, ct);
            var available = await inventoryCost.GetAvailableIssueQuantityAsync(
                tenantId, component.Id, wh.Id, ct);
            if (available < issueQty)
            {
                throw new InvalidOperationException(
                    $"Insufficient stock for {component.ArticleCode} (need {issueQty}, available {available}).");
            }

            var movement = await inventoryCost.IssueAsync(
                tenantId,
                component.Id,
                wh.Id,
                issueQty,
                note,
                movementDate,
                ct);

            var sortOrder = assembly.Lines.Count > 0
                ? assembly.Lines.Max(l => l.SortOrder) + 1
                : 0;

            db.StockAssemblyLines.Add(new StockAssemblyLine
            {
                Id = Guid.NewGuid(),
                StockAssemblyId = assembly.Id,
                ProductId = componentProductId,
                Quantity = perUnitQuantity,
                SortOrder = sortOrder,
                IssueMovementId = movement.Id,
            });

            await db.SaveChangesAsync(ct);
            await SyncOutputProductRecipeFromAssemblyAsync(tenantId, assembly.Id, ct);

            if (assembly.OutputLotId is { } lotId)
            {
                var lot = await db.InventoryLots.FirstOrDefaultAsync(l => l.Id == lotId, ct);
                if (lot is not null)
                {
                    var inputTotal = await SumAssemblyInputCostAsync(assembly.AssemblyNumber, ct);
                    var batchCost = InventoryCostService.RoundIls(inputTotal + assembly.AdditionalCostIls);
                    lot.UnitCostIls = InventoryCostService.RoundIls(batchCost / outputQty);
                }
            }

            assembly.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }

        return (await LoadAsync(tenantId, assembly.Id, ct))!;
    }

    /// <summary>Replaces output product assembly recipe with lines from a posted assembly document.</summary>
    public async Task SyncOutputProductRecipeFromAssemblyAsync(
        Guid tenantId,
        Guid assemblyId,
        CancellationToken ct)
    {
        var assembly = await LoadAsync(tenantId, assemblyId, ct)
            ?? throw new InvalidOperationException("Assembly not found.");

        if (assembly.Status != StockAssemblyStatus.Posted)
            throw new InvalidOperationException("Recipe sync requires a posted assembly.");

        var outputProduct = await db.Products.FirstAsync(
            p => p.Id == assembly.OutputProductId && p.TenantId == tenantId, ct);

        var recipeInputs = assembly.Lines
            .OrderBy(l => l.SortOrder)
            .Select(l => new AssemblyRecipeLineInput(l.ProductId, l.Quantity))
            .ToList();

        var err = await AssemblyRecipeRules.ReplaceRecipeLinesAsync(
            db, outputProduct, recipeInputs, tenantId, ct);
        if (err is not null)
            throw new InvalidOperationException(err);

        await db.SaveChangesAsync(ct);
    }

    private async Task<decimal> SumAssemblyInputCostAsync(string assemblyNumber, CancellationToken ct)
    {
        var notesPattern = assemblyNumber + " (assembly";
        var issueCosts = await db.StockMovements.AsNoTracking()
            .Where(m => m.Notes != null && m.Notes.Contains(notesPattern) && m.MovementType == StockMovementType.Issue)
            .Select(m => m.TotalCost ?? (m.UnitCost ?? 0) * m.Quantity)
            .ToListAsync(ct);
        return InventoryCostService.RoundIls(issueCosts.Sum());
    }

    public static StockAssemblyListItemDto ToListItem(StockAssembly a) => new(
        a.Id,
        a.AssemblyNumber,
        a.AssemblyDate,
        a.Status.ToString(),
        a.OutputProduct.ArticleCode,
        a.OutputProduct.Name,
        a.OutputQuantity,
        a.AdditionalCostIls,
        a.Version,
        a.CreatedAt);

    public static StockAssemblyDto ToDto(StockAssembly a, decimal? outputUnitCostIls = null) => new(
        a.Id,
        a.AssemblyNumber,
        a.AssemblyDate,
        a.Status.ToString(),
        a.OutputProductId,
        a.OutputProduct.ArticleCode,
        a.OutputProduct.Name,
        a.OutputWarehouseId,
        a.OutputWarehouse.Name,
        a.OutputQuantity,
        a.AdditionalCostIls,
        a.Notes,
        a.PostedAt,
        outputUnitCostIls,
        a.Lines.OrderBy(l => l.SortOrder).Select(l => new StockAssemblyLineDto(
            l.Id,
            l.ProductId,
            l.Product.ArticleCode,
            l.Product.Name,
            l.Quantity,
            l.SortOrder)).ToList(),
        a.Version,
        a.CreatedAt,
        a.UpdatedAt);

    public static decimal ComponentTotalQuantity(decimal perUnitQuantity, decimal outputQuantity) =>
        StockQuantity.Normalize(perUnitQuantity * StockQuantity.Normalize(outputQuantity));

    public static IReadOnlyList<StockAssemblyLineInput> RecipeLinesPerUnit(
        IReadOnlyList<AssemblyRecipeLine> recipe) =>
        recipe
            .OrderBy(r => r.ComponentProductId)
            .Select(r => new StockAssemblyLineInput(
                r.ComponentProductId,
                StockQuantity.Normalize(decimal.Truncate(r.Quantity))))
            .ToList();

    [Obsolete("Use RecipeLinesPerUnit — line qty is per output unit; multiply at post time.")]
    public static IReadOnlyList<StockAssemblyLineInput> ScaleRecipeLines(
        IReadOnlyList<AssemblyRecipeLine> recipe,
        decimal outputQuantity)
    {
        var qty = StockQuantity.Normalize(outputQuantity);
        return recipe
            .OrderBy(r => r.ComponentProductId)
            .Select(r => new StockAssemblyLineInput(
                r.ComponentProductId,
                StockQuantity.Normalize(decimal.Truncate(r.Quantity) * qty)))
            .ToList();
    }

    private static void ApplyLines(StockAssembly assembly, IReadOnlyList<StockAssemblyLineInput> lines)
    {
        foreach (var line in BuildLineEntities(assembly.Id, lines))
            assembly.Lines.Add(line);
    }

    private static IEnumerable<StockAssemblyLine> BuildLineEntities(
        Guid assemblyId,
        IReadOnlyList<StockAssemblyLineInput> lines)
    {
        var sort = 0;
        foreach (var line in lines)
        {
            var qty = StockQuantity.Normalize(line.Quantity);
            if (qty <= 0) continue;

            yield return new StockAssemblyLine
            {
                Id = Guid.NewGuid(),
                StockAssemblyId = assemblyId,
                ProductId = line.ProductId,
                Quantity = qty,
                SortOrder = sort++,
            };
        }
    }

    private async Task ValidateOutputProductAsync(Guid tenantId, Guid productId, CancellationToken ct)
    {
        var product = await db.Products.FirstOrDefaultAsync(
            p => p.Id == productId && p.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Output product not found.");

        if (!ProductInventoryHelper.TracksStock(product))
            throw new InvalidOperationException(
                $"Output product {product.ArticleCode} must track warehouse stock.");
    }

    private async Task ValidateLinesAsync(
        Guid tenantId,
        Guid outputProductId,
        IReadOnlyList<StockAssemblyLineInput> lines,
        CancellationToken ct)
    {
        if (lines.Count == 0)
            throw new InvalidOperationException("At least one component line is required.");

        var seen = new HashSet<Guid>();
        foreach (var line in lines)
        {
            if (line.ProductId == Guid.Empty)
                throw new InvalidOperationException("Select a component for each line.");

            if (line.ProductId == outputProductId)
                throw new InvalidOperationException("Output product cannot be its own component.");

            if (!seen.Add(line.ProductId))
                throw new InvalidOperationException("Duplicate component in assembly lines.");

            var qty = StockQuantity.Normalize(line.Quantity);
            if (qty <= 0)
                throw new InvalidOperationException("Component quantity must be positive.");

            var component = await db.Products.FirstOrDefaultAsync(
                p => p.Id == line.ProductId && p.TenantId == tenantId, ct)
                ?? throw new InvalidOperationException("Component not found.");

            if (!AssemblyRecipeRules.CanBeAssemblyComponent(component))
                throw new InvalidOperationException(
                    $"Component {component.ArticleCode} cannot be used in assembly (must track stock).");
        }
    }

    private async Task<Warehouse> ResolveOutputWarehouseAsync(
        Guid tenantId,
        Product outputProduct,
        Guid? warehouseId,
        CancellationToken ct)
    {
        if (warehouseId is { } wid)
        {
            var wh = await db.Warehouses.FirstOrDefaultAsync(
                w => w.Id == wid && w.TenantId == tenantId, ct)
                ?? throw new InvalidOperationException("Warehouse not found.");
            return wh;
        }

        return await warehouse.GetForProductAsync(tenantId, outputProduct, ct);
    }

    private static DateTime UtcDate(DateTime value) =>
        DateTime.SpecifyKind(value.Date, DateTimeKind.Utc);

    private static string? TrimOrNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public static class AssemblyRecipeRules
{
    public static bool CanHaveAssemblyRecipe(Product product) =>
        ProductInventoryHelper.TracksStock(product);

    public static bool CanBeAssemblyComponent(Product product) =>
        ProductInventoryHelper.TracksStock(product);

    public static async Task<string?> ReplaceRecipeLinesAsync(
        AppDbContext db,
        Product parent,
        IReadOnlyList<AssemblyRecipeLineInput>? lines,
        Guid tenantId,
        CancellationToken ct)
    {
        if (lines is null) return null;

        if (lines.Count == 0)
        {
            await db.AssemblyRecipeLines
                .Where(r => r.ParentProductId == parent.Id)
                .ExecuteDeleteAsync(ct);
            return null;
        }

        if (!CanHaveAssemblyRecipe(parent))
            return "Рецепт сборки доступен только для товаров с учётом остатков на складе.";

        var seen = new HashSet<Guid>();
        foreach (var line in lines)
        {
            if (line.ComponentProductId == Guid.Empty)
                return "Select a component for each recipe line.";

            if (line.ComponentProductId == parent.Id)
                return "A product cannot include itself in its assembly recipe.";

            if (!seen.Add(line.ComponentProductId))
                return "Duplicate component in assembly recipe.";

            var qty = decimal.Truncate(line.Quantity);
            if (qty < 1)
                return "Recipe quantity must be a whole number of at least 1 per output unit.";

            var component = await db.Products.FirstOrDefaultAsync(
                p => p.Id == line.ComponentProductId && p.TenantId == tenantId, ct);
            if (component is null)
                return "Component not found.";

            if (!CanBeAssemblyComponent(component))
                return $"Component {component.ArticleCode} must track warehouse stock.";

            db.AssemblyRecipeLines.Add(new AssemblyRecipeLine
            {
                Id = Guid.NewGuid(),
                ParentProductId = parent.Id,
                ComponentProductId = line.ComponentProductId,
                Quantity = qty,
            });
        }

        return null;
    }
}
