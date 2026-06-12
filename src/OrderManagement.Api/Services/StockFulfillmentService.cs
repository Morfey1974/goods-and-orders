using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

/// <summary>
/// Warehouse issues when חשבון חיוב / חשבון עסקה (H-) is issued — not on quote or קבלה.
/// </summary>
public class StockFulfillmentService(AppDbContext db, WarehouseService warehouse, InventoryCostService inventoryCost)
{
    public async Task DeductOrderStockAsync(
        Guid tenantId,
        Order order,
        string chargeInvoiceReference,
        DateTime movementDate,
        CancellationToken ct)
    {
        foreach (var line in order.Lines)
        {
            await DeductProductSaleAsync(
                tenantId, line.ProductId, line.Quantity, chargeInvoiceReference, movementDate, ct);
        }
    }

    public async Task DeductProductSaleAsync(
        Guid tenantId,
        Guid productId,
        decimal quantity,
        string? reference,
        DateTime movementDate,
        CancellationToken ct)
    {
        if (quantity <= 0)
            throw new InvalidOperationException("Quantity must be positive.");

        var product = await db.Products.FirstOrDefaultAsync(
            p => p.Id == productId && p.TenantId == tenantId, ct);
        if (product is null)
            throw new InvalidOperationException("Product not found.");

        var note = string.IsNullOrWhiteSpace(reference) ? "Charge invoice (H-)" : reference;
        var when = movementDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(movementDate, DateTimeKind.Utc)
            : movementDate.ToUniversalTime();

        if (product.ProductType is ProductType.FinishedGood or ProductType.Bundle)
        {
            var bomLines = await db.BomLines
                .Where(b => b.ParentProductId == product.Id)
                .ToListAsync(ct);

            if (bomLines.Count > 0)
            {
                // Assembled FG: no FG stock — deduct BOM components only.
                foreach (var line in bomLines)
                {
                    var component = await db.Products.FirstOrDefaultAsync(
                        p => p.Id == line.ComponentProductId && p.TenantId == tenantId, ct);
                    if (component is null) continue;
                    if (!ProductInventoryHelper.TracksStock(component)) continue;

                    var cpWh = await warehouse.GetForProductAsync(tenantId, component, ct);
                    var componentQty = StockQuantity.Normalize(quantity * line.Quantity);
                    if (componentQty <= 0) continue;
                    await inventoryCost.IssueAsync(
                        tenantId,
                        component.Id,
                        cpWh.Id,
                        componentQty,
                        $"{note} (BOM {product.ArticleCode})",
                        when,
                        ct);
                }

                return;
            }

            // Purchased finished good (no BOM): deduct FG stock when tracked.
            if (!ProductInventoryHelper.TracksStock(product))
                return;

            var fgWh = await warehouse.GetForProductAsync(tenantId, product, ct);
            await inventoryCost.IssueAsync(
                tenantId, product.Id, fgWh.Id, quantity, note, when, ct);
            return;
        }

        if (!ProductInventoryHelper.TracksStock(product))
            return;

        var wh = await warehouse.GetForProductAsync(tenantId, product, ct);
        await inventoryCost.IssueAsync(
            tenantId, product.Id, wh.Id, quantity, note, when, ct);
    }

    [Obsolete("Use DeductProductSaleAsync")]
    public Task FulfillProductSaleAsync(
        Guid tenantId,
        Guid productId,
        decimal quantity,
        string? reference,
        CancellationToken ct) =>
        DeductProductSaleAsync(tenantId, productId, quantity, reference, DateTime.UtcNow, ct);

    public async Task<bool> HasStockIssuesForChargeAsync(
        Guid tenantId,
        string documentNumber,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(documentNumber))
            return false;

        return await ChargeStockReference
            .WhereChargeReference(
                db.StockMovements.AsNoTracking().Where(m =>
                    m.TenantId == tenantId && m.MovementType == StockMovementType.Issue),
                documentNumber)
            .AnyAsync(ct);
    }

    public async Task ReverseStockForChargeAsync(
        Guid tenantId,
        string documentNumber,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(documentNumber))
            return;

        var movementIds = await ChargeStockReference
            .WhereChargeReference(
                db.StockMovements.Where(m =>
                    m.TenantId == tenantId && m.MovementType == StockMovementType.Issue),
                documentNumber)
            .Select(m => m.Id)
            .ToListAsync(ct);

        foreach (var movementId in movementIds)
            await inventoryCost.ReverseIssueAsync(tenantId, movementId, ct);
    }

    /// <summary>
    /// Removes warehouse issues that belong to draft, deleted, or cancelled charge invoices.
    /// </summary>
    public async Task ReconcileInvalidChargeStockAsync(Guid tenantId, CancellationToken ct)
    {
        var finalizedChargeNumbers = await db.BusinessDocuments
            .AsNoTracking()
            .Where(d =>
                d.TenantId == tenantId
                && d.DocumentType == DocumentType.ChargeInvoice
                && d.Status != DocumentStatus.Draft
                && d.Status != DocumentStatus.Cancelled)
            .Select(d => d.DocumentNumber)
            .ToListAsync(ct);

        var finalizedSet = finalizedChargeNumbers.ToHashSet(StringComparer.OrdinalIgnoreCase);

        var issueMovements = await db.StockMovements
            .Where(m => m.TenantId == tenantId && m.MovementType == StockMovementType.Issue && m.Notes != null)
            .Select(m => new { m.Id, m.Notes })
            .ToListAsync(ct);

        foreach (var movement in issueMovements)
        {
            var chargeNumber = ChargeStockReference.TryExtractChargeNumber(movement.Notes);
            if (chargeNumber is null)
                continue;

            if (!finalizedSet.Contains(chargeNumber))
                await inventoryCost.ReverseIssueAsync(tenantId, movement.Id, ct);
        }
    }
}
