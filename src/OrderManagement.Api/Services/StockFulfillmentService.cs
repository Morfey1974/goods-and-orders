using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

/// <summary>
/// Warehouse issues when חשבון חיוב / חשבון עסקה (H-) is issued — not on quote or קבלה.
/// </summary>
public class StockFulfillmentService(AppDbContext db, WarehouseService warehouse)
{
    public async Task DeductOrderStockAsync(
        Guid tenantId,
        Order order,
        string chargeInvoiceReference,
        CancellationToken ct)
    {
        foreach (var line in order.Lines)
        {
            await DeductProductSaleAsync(
                tenantId, line.ProductId, line.Quantity, chargeInvoiceReference, ct);
        }
    }

    public async Task DeductProductSaleAsync(
        Guid tenantId,
        Guid productId,
        decimal quantity,
        string? reference,
        CancellationToken ct)
    {
        if (quantity <= 0)
            throw new InvalidOperationException("Quantity must be positive.");

        var product = await db.Products.FirstOrDefaultAsync(
            p => p.Id == productId && p.TenantId == tenantId, ct);
        if (product is null)
            throw new InvalidOperationException("Product not found.");

        if (!ProductTypePrefixes.TracksStock(product.ProductType))
            return;

        var note = string.IsNullOrWhiteSpace(reference) ? "Charge invoice (H-)" : reference;

        if (product.ProductType is ProductType.FinishedGood or ProductType.Bundle)
        {
            var fgWh = await warehouse.GetForProductAsync(tenantId, product, ct);
            await warehouse.ApplyMovementAsync(
                tenantId, fgWh.Id, product.Id, StockMovementType.Issue, quantity, note, ct);

            var bomLines = await db.BomLines
                .Where(b => b.ParentProductId == product.Id)
                .ToListAsync(ct);

            foreach (var line in bomLines)
            {
                var component = await db.Products.FirstOrDefaultAsync(
                    p => p.Id == line.ComponentProductId && p.TenantId == tenantId, ct);
                if (component is null) continue;
                if (!ProductTypePrefixes.TracksStock(component.ProductType)) continue;

                var cpWh = await warehouse.GetForProductAsync(tenantId, component, ct);
                var componentQty = StockQuantity.Normalize(quantity * line.Quantity);
                if (componentQty <= 0) continue;
                await warehouse.ApplyMovementAsync(
                    tenantId,
                    cpWh.Id,
                    component.Id,
                    StockMovementType.Issue,
                    componentQty,
                    $"{note} (BOM {product.ArticleCode})",
                    ct);
            }
        }
        else
        {
            var wh = await warehouse.GetForProductAsync(tenantId, product, ct);
            await warehouse.ApplyMovementAsync(
                tenantId, wh.Id, product.Id, StockMovementType.Issue, quantity, note, ct);
        }
    }

    [Obsolete("Use DeductProductSaleAsync")]
    public Task FulfillProductSaleAsync(
        Guid tenantId,
        Guid productId,
        decimal quantity,
        string? reference,
        CancellationToken ct) =>
        DeductProductSaleAsync(tenantId, productId, quantity, reference, ct);
}
