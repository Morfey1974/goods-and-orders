using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class PurchaseReceiptService(
    AppDbContext db,
    WarehouseService warehouse,
    ArticleSequenceService sequences)
{
    public async Task<PurchaseReceipt> CreateDraftAsync(
        Guid tenantId,
        CreatePurchaseReceiptRequest request,
        CancellationToken ct)
    {
        await ValidateSupplierAsync(tenantId, request.SupplierId, ct);
        await ValidateLinesAsync(tenantId, request.Lines, ct);

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
            Notes = TrimOrNull(request.Notes),
            Status = PurchaseReceiptStatus.Draft,
            CreatedAt = now,
            UpdatedAt = now
        };

        ApplyLines(receipt, request.Lines);
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
            .Include(r => r.Lines)
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Purchase receipt not found.");

        if (receipt.Status != PurchaseReceiptStatus.Draft)
            throw new InvalidOperationException("Only draft receipts can be edited.");

        if (receipt.Version != request.Version)
            throw new InvalidOperationException("Data was modified. Refresh and try again.");

        await ValidateSupplierAsync(tenantId, request.SupplierId, ct);
        await ValidateLinesAsync(tenantId, request.Lines, ct);

        receipt.SupplierId = request.SupplierId;
        receipt.SupplierInvoiceNumber = TrimOrNull(request.SupplierInvoiceNumber);
        receipt.DocumentDate = UtcDate(request.DocumentDate);
        receipt.Currency = NormalizeCurrency(request.Currency);
        receipt.TotalAmount = request.TotalAmount;
        receipt.Notes = TrimOrNull(request.Notes);
        receipt.Version++;
        receipt.UpdatedAt = DateTime.UtcNow;

        foreach (var line in receipt.Lines.ToList())
            db.Entry(line).State = EntityState.Detached;

        await db.PurchaseReceiptLines
            .Where(l => l.PurchaseReceiptId == receipt.Id)
            .ExecuteDeleteAsync(ct);
        receipt.Lines.Clear();
        ApplyLines(receipt, request.Lines);

        await db.SaveChangesAsync(ct);
        return await LoadAsync(tenantId, receipt.Id, ct)
            ?? throw new InvalidOperationException("Failed to load purchase receipt.");
    }

    public async Task<PurchaseReceipt> PostAsync(Guid tenantId, Guid id, int version, CancellationToken ct)
    {
        var receipt = await db.PurchaseReceipts
            .Include(r => r.Lines)
            .ThenInclude(l => l.Product)
            .Include(r => r.Supplier)
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Purchase receipt not found.");

        if (receipt.Status != PurchaseReceiptStatus.Draft)
            throw new InvalidOperationException("Receipt is already posted.");

        if (receipt.Version != version)
            throw new InvalidOperationException("Data was modified. Refresh and try again.");

        if (receipt.Lines.Count == 0)
            throw new InvalidOperationException("Add at least one line before posting.");

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

            await warehouse.ApplyMovementAsync(
                tenantId,
                wh.Id,
                product.Id,
                StockMovementType.Receipt,
                qty,
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
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Purchase receipt not found.");

        if (receipt.Status != PurchaseReceiptStatus.Draft)
            throw new InvalidOperationException("Only draft receipts can be deleted.");

        db.PurchaseReceipts.Remove(receipt);
        await db.SaveChangesAsync(ct);
    }

    public async Task<PurchaseReceipt?> LoadAsync(Guid tenantId, Guid id, CancellationToken ct) =>
        await db.PurchaseReceipts
            .Include(r => r.Supplier)
            .Include(r => r.Lines)
            .ThenInclude(l => l.Product)
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);

    private static void ApplyLines(PurchaseReceipt receipt, IReadOnlyList<PurchaseReceiptLineInput>? lines)
    {
        if (lines is null || lines.Count == 0) return;

        var order = 0;
        foreach (var input in lines)
        {
            receipt.Lines.Add(new PurchaseReceiptLine
            {
                Id = Guid.NewGuid(),
                PurchaseReceiptId = receipt.Id,
                ProductId = input.ProductId,
                WarehouseId = input.WarehouseId,
                Quantity = input.Quantity,
                UnitPrice = input.UnitPrice,
                SupplierSku = TrimOrNull(input.SupplierSku),
                Notes = TrimOrNull(input.Notes),
                SortOrder = order++
            });
        }
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

            if (line.UnitPrice is null or <= 0)
                throw new InvalidOperationException("Purchase price is required for all lines.");

            if (ProductInventoryHelper.TracksStock(product) && line.WarehouseId is null)
                throw new InvalidOperationException("Warehouse is required for all stock items.");
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
