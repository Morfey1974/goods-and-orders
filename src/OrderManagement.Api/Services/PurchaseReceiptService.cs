using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class PurchaseReceiptService(
    AppDbContext db,
    WarehouseService warehouse,
    InventoryCostService inventoryCost,
    ExchangeRateService exchangeRates,
    TenantFileService files,
    ArticleSequenceService sequences)
{
    public async Task<PurchaseReceipt> CreateDraftAsync(
        Guid tenantId,
        CreatePurchaseReceiptRequest request,
        CancellationToken ct)
    {
        await ValidateSupplierAsync(tenantId, request.SupplierId, ct);
        await ValidateDraftLinesAsync(tenantId, request.Lines, ct);

        var number = await sequences.AllocateNextAsync(tenantId, "GR", ct);
        var now = DateTime.UtcNow;

        var receipt = new PurchaseReceipt
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            SupplierId = request.SupplierId,
            ReceiptNumber = number,
            SupplierInvoiceNumber = TrimOrNull(request.SupplierInvoiceNumber),
            DocumentDate = UtcDate(request.DocumentDate),
            Currency = NormalizeCurrency(request.Currency),
            TotalAmount = request.TotalAmount,
            UsdIlsRate = NormalizeUsdIlsRate(request.UsdIlsRate),
            Notes = TrimOrNull(request.Notes),
            Status = PurchaseReceiptStatus.Draft,
            ApplyLandedCosts = request.ApplyLandedCosts,
            CreatedAt = now,
            UpdatedAt = now
        };

        ApplyLines(receipt, request.Lines);
        ApplyLandedCostLines(receipt, request.LandedCostLines);
        db.PurchaseReceipts.Add(receipt);
        await db.SaveChangesAsync(ct);
        return await LoadAsync(tenantId, receipt.Id, ct)
            ?? throw new InvalidOperationException("Failed to load purchase receipt.");
    }

    public async Task<PurchaseReceipt> UpdateDraftAsync(
        Guid tenantId,
        Guid id,
        UpdatePurchaseReceiptRequest request,
        CancellationToken ct)
    {
        var receipt = await db.PurchaseReceipts
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Purchase receipt not found.");

        if (receipt.Status != PurchaseReceiptStatus.Draft)
            throw new InvalidOperationException("Only draft receipts can be edited.");

        await ValidateSupplierAsync(tenantId, request.SupplierId, ct);
        await ValidateDraftLinesAsync(tenantId, request.Lines, ct);

        receipt.SupplierId = request.SupplierId;
        receipt.SupplierInvoiceNumber = TrimOrNull(request.SupplierInvoiceNumber);
        receipt.DocumentDate = UtcDate(request.DocumentDate);
        receipt.Currency = NormalizeCurrency(request.Currency);
        receipt.TotalAmount = request.TotalAmount;
        receipt.UsdIlsRate = NormalizeUsdIlsRate(request.UsdIlsRate);
        receipt.Notes = TrimOrNull(request.Notes);
        receipt.ApplyLandedCosts = request.ApplyLandedCosts;
        receipt.Version++;
        receipt.UpdatedAt = DateTime.UtcNow;

        await db.PurchaseReceiptLines
            .Where(l => l.PurchaseReceiptId == receipt.Id)
            .ExecuteDeleteAsync(ct);
        await db.PurchaseReceiptLandedCostLines
            .Where(l => l.PurchaseReceiptId == receipt.Id)
            .ExecuteDeleteAsync(ct);

        if (request.Lines is { Count: > 0 })
            db.PurchaseReceiptLines.AddRange(BuildLineEntities(receipt.Id, request.Lines));

        if (request.LandedCostLines is { Count: > 0 })
        {
            db.PurchaseReceiptLandedCostLines.AddRange(
                BuildLandedCostEntities(receipt.Id, request.LandedCostLines));
        }

        await db.SaveChangesAsync(ct);
        return await LoadAsync(tenantId, receipt.Id, ct)
            ?? throw new InvalidOperationException("Failed to load purchase receipt.");
    }

    public async Task<PurchaseReceipt> PostAsync(Guid tenantId, Guid id, int version, CancellationToken ct)
    {
        var receipt = await db.PurchaseReceipts
            .Include(r => r.Lines)
            .ThenInclude(l => l.Product)
            .Include(r => r.LandedCostLines)
            .Include(r => r.Supplier)
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Purchase receipt not found.");

        if (receipt.Status != PurchaseReceiptStatus.Draft)
            throw new InvalidOperationException("Receipt is already posted.");

        if (receipt.Version != version)
            throw new InvalidOperationException("Data was modified. Refresh and try again.");

        await ValidateReceiptForPostAsync(tenantId, receipt, ct);

        var stockLines = receipt.Lines
            .Where(l => ProductInventoryHelper.TracksStock(l.Product))
            .OrderBy(l => l.SortOrder)
            .ToList();

        foreach (var line in receipt.Lines.OrderBy(l => l.SortOrder))
        {
            var unitCostIls = InventoryCostService.ResolveLineUnitCostIls(
                receipt.Currency, line.UnitPrice, line.UnitCostIls);
            line.UnitCostIls = unitCostIls;
        }

        Dictionary<Guid, decimal>? finalUnitCosts = null;
        if (receipt.ApplyLandedCosts && receipt.LandedCostLines.Count > 0)
        {
            if (stockLines.Count == 0)
                throw new InvalidOperationException(
                    "Landed costs require at least one stock line to allocate into unit cost.");

            var needsUsdRate = receipt.LandedCostLines.Any(l =>
                !IsIlsCurrency(l.Currency));
            decimal usdIlsRate = 1m;
            if (needsUsdRate)
            {
                usdIlsRate = await ResolveUsdIlsRateAsync(receipt, ct);
            }

            decimal totalLandedIls = 0;
            foreach (var landed in receipt.LandedCostLines.OrderBy(l => l.SortOrder))
            {
                var amountIls = LandedCostAllocation.ResolveAmountIls(
                    landed.Amount, landed.Currency, usdIlsRate);
                landed.AmountIls = amountIls;
                totalLandedIls += amountIls;
            }

            if (totalLandedIls > 0)
                finalUnitCosts = LandedCostAllocation.ComputeFinalUnitCostsIls(stockLines, totalLandedIls);
        }

        var noteBase = BuildMovementNote(receipt);

        foreach (var line in receipt.Lines.OrderBy(l => l.SortOrder))
        {
            var product = line.Product;
            if (!ProductInventoryHelper.TracksStock(product))
                continue;

            Warehouse wh;
            if (line.WarehouseId is { } wid)
            {
                wh = await warehouse.GetByIdAsync(tenantId, wid, ct)
                    ?? throw new InvalidOperationException("Warehouse not found.");
                if (!wh.IsActive)
                    throw new InvalidOperationException("Warehouse is not active.");
            }
            else
            {
                wh = await warehouse.GetForProductAsync(tenantId, product, ct);
            }

            var qty = StockQuantity.Normalize(line.Quantity);
            if (qty <= 0)
                throw new InvalidOperationException("Line quantity must be positive.");

            var unitCostIls = finalUnitCosts?.GetValueOrDefault(line.Id)
                ?? line.UnitCostIls
                ?? InventoryCostService.ResolveLineUnitCostIls(
                    receipt.Currency, line.UnitPrice, line.UnitCostIls);

            line.UnitCostIls = unitCostIls;

            await inventoryCost.ReceiveAsync(
                tenantId,
                product.Id,
                wh.Id,
                qty,
                unitCostIls,
                receipt.DocumentDate,
                InventoryLotSource.PurchaseReceipt,
                line.Id,
                noteBase,
                ct);
        }

        receipt.Status = PurchaseReceiptStatus.Posted;
        receipt.PostedAt = DateTime.UtcNow;
        receipt.Version++;
        receipt.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return await LoadAsync(tenantId, receipt.Id, ct)
            ?? throw new InvalidOperationException("Failed to load purchase receipt.");
    }

    public async Task DeleteDraftAsync(Guid tenantId, Guid id, CancellationToken ct)
    {
        var receipt = await db.PurchaseReceipts
            .Include(r => r.Documents)
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Purchase receipt not found.");

        if (receipt.Status != PurchaseReceiptStatus.Draft)
            throw new InvalidOperationException("Only draft receipts can be deleted.");

        DeleteReceiptDocumentFiles(receipt);
        db.PurchaseReceipts.Remove(receipt);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Removes a posted receipt and reverses unconsumed FIFO layers / stock balance.</summary>
    public async Task DeletePostedWithReversalAsync(Guid tenantId, Guid id, CancellationToken ct)
    {
        var receipt = await db.PurchaseReceipts
            .Include(r => r.Lines)
            .ThenInclude(l => l.Product)
            .Include(r => r.Documents)
            .Include(r => r.Supplier)
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Purchase receipt not found.");

        if (receipt.Status != PurchaseReceiptStatus.Posted)
            throw new InvalidOperationException("Only posted receipts can be reversed with this method.");

        var noteMarker = $"GR {receipt.ReceiptNumber}";

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            foreach (var line in receipt.Lines)
            {
                if (!ProductInventoryHelper.TracksStock(line.Product))
                    continue;

                var lot = await db.InventoryLots.FirstOrDefaultAsync(
                    l => l.TenantId == tenantId &&
                         l.SourceType == InventoryLotSource.PurchaseReceipt &&
                         l.SourceId == line.Id,
                    ct);

                if (lot is null)
                    continue;

                var allocatedQty = await db.InventoryLotAllocations
                    .Where(a => a.InventoryLotId == lot.Id)
                    .SumAsync(a => a.Quantity, ct);

                var originalQty = StockQuantity.Normalize(line.Quantity);
                if (allocatedQty > 0 && lot.QuantityRemaining < originalQty)
                {
                    throw new InvalidOperationException(
                        $"Cannot delete {receipt.ReceiptNumber}: stock from line was already sold " +
                        $"(product {line.Product.ArticleCode}, remaining {lot.QuantityRemaining} of {originalQty}).");
                }

                if (lot.QuantityRemaining > 0)
                {
                    var balance = await warehouse.GetOrCreateBalanceAsync(lot.WarehouseId, lot.ProductId, ct);
                    balance.Quantity = StockQuantity.Normalize(balance.Quantity - lot.QuantityRemaining);
                    if (balance.Quantity < 0)
                    {
                        throw new InvalidOperationException(
                            $"Cannot delete {receipt.ReceiptNumber}: stock would go negative for {line.Product.ArticleCode}.");
                    }
                }

                await db.InventoryLotAllocations
                    .Where(a => a.InventoryLotId == lot.Id)
                    .ExecuteDeleteAsync(ct);
                db.InventoryLots.Remove(lot);
            }

            await db.StockMovements
                .Where(m => m.TenantId == tenantId && m.Notes != null && m.Notes.Contains(noteMarker))
                .ExecuteDeleteAsync(ct);

            var receiptId = receipt.Id;
            db.Entry(receipt).State = EntityState.Detached;
            foreach (var line in receipt.Lines)
                db.Entry(line).State = EntityState.Detached;

            await db.PurchaseReceiptLines
                .Where(l => l.PurchaseReceiptId == receiptId)
                .ExecuteDeleteAsync(ct);

            await db.PurchaseReceiptLandedCostLines
                .Where(l => l.PurchaseReceiptId == receiptId)
                .ExecuteDeleteAsync(ct);

            DeleteReceiptDocumentFiles(receipt);

            await db.PurchaseReceiptDocuments
                .Where(d => d.PurchaseReceiptId == receiptId)
                .ExecuteDeleteAsync(ct);

            await db.PurchaseReceipts
                .Where(r => r.Id == receiptId && r.TenantId == tenantId)
                .ExecuteDeleteAsync(ct);

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    public async Task<int> DeletePostedByNumbersAsync(
        Guid tenantId,
        IReadOnlyList<string> receiptNumbers,
        CancellationToken ct)
    {
        var numbers = receiptNumbers
            .Select(n => n.Trim())
            .Where(n => n.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var receipts = await db.PurchaseReceipts
            .Where(r => r.TenantId == tenantId && numbers.Contains(r.ReceiptNumber))
            .ToListAsync(ct);

        var deleted = 0;
        foreach (var number in numbers)
        {
            var receipt = receipts.FirstOrDefault(r =>
                string.Equals(r.ReceiptNumber, number, StringComparison.OrdinalIgnoreCase));
            if (receipt is null)
                throw new InvalidOperationException($"Purchase receipt not found: {number}.");

            await DeletePostedWithReversalAsync(tenantId, receipt.Id, ct);
            deleted++;
        }

        return deleted;
    }

    public async Task<PurchaseReceipt?> LoadAsync(Guid tenantId, Guid id, CancellationToken ct)
    {
        var receipt = await db.PurchaseReceipts
            .Include(r => r.Supplier)
            .Include(r => r.Lines)
            .ThenInclude(l => l.Product)
            .Include(r => r.LandedCostLines)
            .ThenInclude(l => l.Supplier)
            .Include(r => r.Documents)
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);

        if (receipt is null) return null;

        await SyncReceiptDocumentsAsync(receipt, ct);
        return receipt;
    }

    /// <summary>
    /// Migrates legacy single-document fields into Documents and clears stale header fields.
    /// </summary>
    public async Task SyncReceiptDocumentsAsync(PurchaseReceipt receipt, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(receipt.DocumentPath))
            return;

        var changed = false;

        if (receipt.Documents.Count > 0)
        {
            ClearLegacyDocumentFields(receipt);
            changed = true;
        }
        else
        {
            var absolute = files.GetAbsolutePath(receipt.DocumentPath);
            if (System.IO.File.Exists(absolute))
            {
                var doc = new PurchaseReceiptDocument
                {
                    Id = Guid.NewGuid(),
                    PurchaseReceiptId = receipt.Id,
                    FilePath = receipt.DocumentPath,
                    FileName = receipt.DocumentFileName ?? Path.GetFileName(receipt.DocumentPath),
                    ContentType = receipt.DocumentContentType ?? "application/octet-stream",
                    SortOrder = 0,
                    CreatedAt = DateTime.UtcNow
                };
                db.PurchaseReceiptDocuments.Add(doc);
                receipt.Documents.Add(doc);
            }

            ClearLegacyDocumentFields(receipt);
            changed = true;
        }

        if (!changed) return;

        receipt.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private static void ClearLegacyDocumentFields(PurchaseReceipt receipt)
    {
        receipt.DocumentPath = null;
        receipt.DocumentFileName = null;
        receipt.DocumentContentType = null;
    }

    private void DeleteReceiptDocumentFiles(PurchaseReceipt receipt)
    {
        foreach (var doc in receipt.Documents)
            files.DeleteFile(doc.FilePath);

        if (!string.IsNullOrEmpty(receipt.DocumentPath))
            files.DeleteFile(receipt.DocumentPath);
    }

    private static void ApplyLandedCostLines(
        PurchaseReceipt receipt,
        IReadOnlyList<PurchaseReceiptLandedCostLineInput>? lines)
    {
        if (lines is null || lines.Count == 0) return;

        foreach (var entity in BuildLandedCostEntities(receipt.Id, lines))
            receipt.LandedCostLines.Add(entity);
    }

    private static PurchaseReceiptLandedCostCategory ParseLandedCostCategory(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return PurchaseReceiptLandedCostCategory.Other;

        return Enum.TryParse<PurchaseReceiptLandedCostCategory>(value, true, out var cat)
            ? cat
            : PurchaseReceiptLandedCostCategory.Other;
    }

    private async Task ValidateDraftLinesAsync(
        Guid tenantId,
        IReadOnlyList<PurchaseReceiptLineInput>? lines,
        CancellationToken ct)
    {
        if (lines is null || lines.Count == 0) return;

        foreach (var line in lines)
        {
            var product = await db.Products.FirstOrDefaultAsync(
                p => p.Id == line.ProductId && p.TenantId == tenantId, ct);
            if (product is null)
                throw new InvalidOperationException("Product not found.");
        }
    }

    private async Task ValidateReceiptForPostAsync(
        Guid tenantId,
        PurchaseReceipt receipt,
        CancellationToken ct)
    {
        if (receipt.Lines.Count == 0)
            throw new InvalidOperationException("Add at least one line before posting.");

        await ValidateLinesAsync(tenantId, NormalizeCurrency(receipt.Currency), receipt.Lines
            .Select(l => new PurchaseReceiptLineInput(
                l.ProductId,
                l.WarehouseId,
                l.Quantity,
                l.LineTotal,
                l.UnitPrice,
                l.UnitCostIls,
                l.SupplierSku,
                l.Notes))
            .ToList(), ct);

        if (receipt.ApplyLandedCosts)
        {
            await ValidateLandedCostLinesAsync(
                tenantId,
                true,
                receipt.LandedCostLines
                    .Select(l => new PurchaseReceiptLandedCostLineInput(
                        l.SupplierId,
                        l.Category.ToString(),
                        l.Currency,
                        l.Amount,
                        l.Notes))
                    .ToList(),
                ct);
        }
    }

    private async Task ValidateLandedCostLinesAsync(
        Guid tenantId,
        bool applyLandedCosts,
        IReadOnlyList<PurchaseReceiptLandedCostLineInput>? lines,
        CancellationToken ct)
    {
        if (!applyLandedCosts) return;

        if (lines is null || lines.Count == 0)
            throw new InvalidOperationException("Add at least one landed cost line or disable the option.");

        foreach (var line in lines)
        {
            if (line.Amount <= 0)
                throw new InvalidOperationException("Landed cost amount must be positive.");

            var exists = await db.Suppliers.AnyAsync(
                s => s.Id == line.SupplierId && s.TenantId == tenantId && s.IsActive, ct);
            if (!exists)
                throw new InvalidOperationException("Landed cost supplier not found or inactive.");
        }
    }

    private static bool IsIlsCurrency(string? currency)
    {
        var c = NormalizeCurrency(currency);
        return c is "ILS" or "NIS";
    }

    private static List<PurchaseReceiptLine> BuildLineEntities(
        Guid receiptId,
        IReadOnlyList<PurchaseReceiptLineInput> lines)
    {
        var result = new List<PurchaseReceiptLine>(lines.Count);
        var order = 0;
        foreach (var input in lines)
        {
            var (lineTotal, unitPrice) = ResolveLineAmounts(
                input.Quantity,
                input.LineTotal,
                input.UnitPrice);

            result.Add(new PurchaseReceiptLine
            {
                Id = Guid.NewGuid(),
                PurchaseReceiptId = receiptId,
                ProductId = input.ProductId,
                WarehouseId = input.WarehouseId,
                Quantity = input.Quantity,
                LineTotal = lineTotal,
                UnitPrice = unitPrice,
                UnitCostIls = input.UnitCostIls is > 0 ? RoundMoney(input.UnitCostIls.Value) : null,
                SupplierSku = TrimOrNull(input.SupplierSku),
                Notes = TrimOrNull(input.Notes),
                SortOrder = order++
            });
        }
        return result;
    }

    private static (decimal? LineTotal, decimal? UnitPrice) ResolveLineAmounts(
        decimal quantity,
        decimal? lineTotal,
        decimal? unitPrice)
    {
        if (quantity <= 0) return (null, null);

        if (lineTotal is > 0)
        {
            var total = RoundMoney(lineTotal.Value);
            var unit = RoundUnitPrice(total / quantity);
            return (total, unit);
        }

        if (unitPrice is > 0)
        {
            var unit = RoundUnitPrice(unitPrice.Value);
            var total = RoundMoney(unit * quantity);
            return (total, unit);
        }

        return (null, null);
    }

    private static decimal RoundMoney(decimal value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static decimal RoundUnitPrice(decimal value) =>
        Math.Round(value, 6, MidpointRounding.AwayFromZero);

    private static List<PurchaseReceiptLandedCostLine> BuildLandedCostEntities(
        Guid receiptId,
        IReadOnlyList<PurchaseReceiptLandedCostLineInput> lines)
    {
        var result = new List<PurchaseReceiptLandedCostLine>(lines.Count);
        var order = 0;
        foreach (var input in lines)
        {
            result.Add(new PurchaseReceiptLandedCostLine
            {
                Id = Guid.NewGuid(),
                PurchaseReceiptId = receiptId,
                SupplierId = input.SupplierId,
                Category = ParseLandedCostCategory(input.Category),
                Currency = NormalizeCurrency(input.Currency),
                Amount = input.Amount,
                Notes = TrimOrNull(input.Notes),
                SortOrder = order++
            });
        }
        return result;
    }

    private static void ApplyLines(PurchaseReceipt receipt, IReadOnlyList<PurchaseReceiptLineInput>? lines)
    {
        if (lines is null || lines.Count == 0) return;

        foreach (var entity in BuildLineEntities(receipt.Id, lines))
            receipt.Lines.Add(entity);
    }

    private async Task ValidateSupplierAsync(Guid tenantId, Guid supplierId, CancellationToken ct)
    {
        var exists = await db.Suppliers.AnyAsync(
            s => s.Id == supplierId && s.TenantId == tenantId && s.IsActive, ct);
        if (!exists)
            throw new InvalidOperationException("Supplier not found or inactive.");
    }

    private async Task ValidateLinesAsync(
        Guid tenantId,
        string receiptCurrency,
        IReadOnlyList<PurchaseReceiptLineInput> lines,
        CancellationToken ct)
    {
        if (lines is null || lines.Count == 0) return;

        foreach (var line in lines)
        {
            var product = await db.Products.FirstOrDefaultAsync(
                p => p.Id == line.ProductId && p.TenantId == tenantId, ct);
            if (product is null)
                throw new InvalidOperationException("Product not found.");

            if ((line.UnitPrice is null or <= 0) && (line.LineTotal is null or <= 0))
                throw new InvalidOperationException("Purchase price is required for all lines.");

            if (ProductInventoryHelper.TracksStock(product))
            {
                if (line.WarehouseId is null)
                    throw new InvalidOperationException("Warehouse is required for all stock items.");

                try
                {
                    _ = InventoryCostService.ResolveLineUnitCostIls(
                        receiptCurrency, line.UnitPrice, line.UnitCostIls);
                }
                catch (InvalidOperationException)
                {
                    throw new InvalidOperationException(
                        "Unit cost in ILS is required for stock items when the receipt currency is not ILS.");
                }
            }
        }
    }

    private static string BuildMovementNote(PurchaseReceipt receipt)
    {
        var parts = new List<string> { $"GR {receipt.ReceiptNumber}" };
        if (!string.IsNullOrWhiteSpace(receipt.SupplierInvoiceNumber))
            parts.Add($"inv. {receipt.SupplierInvoiceNumber.Trim()}");
        parts.Add(receipt.Supplier.Name);
        return string.Join(" · ", parts);
    }

    private async Task<decimal> ResolveUsdIlsRateAsync(PurchaseReceipt receipt, CancellationToken ct)
    {
        if (receipt.UsdIlsRate is > 0)
            return receipt.UsdIlsRate.Value;

        var rate = await exchangeRates.GetUsdIlsAsync(receipt.DocumentDate, ct);
        return rate.Rate;
    }

    private static decimal? NormalizeUsdIlsRate(decimal? rate) =>
        rate is > 0 ? rate : null;

    private static string? TrimOrNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string NormalizeCurrency(string? currency)
    {
        var c = TrimOrNull(currency) ?? "ILS";
        return c.Length > 3 ? c[..3].ToUpperInvariant() : c.ToUpperInvariant();
    }

    private static DateTime UtcDate(DateTime date) =>
        DateTime.SpecifyKind(date.Date, DateTimeKind.Utc);
}
