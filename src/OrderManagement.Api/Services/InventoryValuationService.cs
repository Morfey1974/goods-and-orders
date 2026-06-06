using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class InventoryValuationService(AppDbContext db)
{
    public async Task<InventoryValuationReportDto> BuildCurrentAsync(
        Guid tenantId,
        DateTime? asOf,
        CancellationToken ct)
    {
        var method = await db.Tenants
            .AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.InventoryCostMethod)
            .FirstAsync(ct);

        var effectiveDate = asOf.HasValue
            ? DateTime.SpecifyKind(asOf.Value.Date, DateTimeKind.Utc)
            : DateTime.UtcNow.Date;

        var lots = await (
            from lot in db.InventoryLots.AsNoTracking()
            join p in db.Products.AsNoTracking() on lot.ProductId equals p.Id
            join w in db.Warehouses.AsNoTracking() on lot.WarehouseId equals w.Id
            where lot.TenantId == tenantId &&
                  lot.QuantityRemaining > 0 &&
                  lot.ReceivedAt <= effectiveDate
            orderby w.Name, p.ArticleCode, lot.ReceivedAt
            select new
            {
                lot.ProductId,
                p.ArticleCode,
                p.Name,
                lot.WarehouseId,
                WarehouseName = w.Name,
                lot.QuantityRemaining,
                lot.UnitCostIls,
                lot.ReceivedAt
            }).ToListAsync(ct);

        if (method == InventoryCostMethod.Wac)
        {
            return await BuildWacReportAsync(tenantId, effectiveDate, method, ct);
        }

        var lines = lots
            .GroupBy(x => new { x.ProductId, x.ArticleCode, x.Name, x.WarehouseId, x.WarehouseName })
            .Select(g =>
            {
                var qty = g.Sum(x => x.QuantityRemaining);
                var total = g.Sum(x => InventoryCostService.RoundIls(x.QuantityRemaining * x.UnitCostIls));
                var unit = qty > 0 ? InventoryCostService.RoundIls(total / qty) : 0;
                return new InventoryValuationLineDto(
                    g.Key.ProductId,
                    g.Key.ArticleCode,
                    g.Key.Name,
                    g.Key.WarehouseId,
                    g.Key.WarehouseName,
                    qty,
                    unit,
                    total);
            })
            .Where(l => l.Quantity > 0)
            .OrderBy(l => l.WarehouseName)
            .ThenBy(l => l.ArticleCode)
            .ToList();

        return new InventoryValuationReportDto(
            effectiveDate,
            InventoryCostMethodNames.ToApi(method),
            lines,
            InventoryCostService.RoundIls(lines.Sum(l => l.TotalValueIls)));
    }

    private async Task<InventoryValuationReportDto> BuildWacReportAsync(
        Guid tenantId,
        DateTime effectiveDate,
        InventoryCostMethod method,
        CancellationToken ct)
    {
        var rows = await (
            from b in db.StockBalances.AsNoTracking()
            join p in db.Products.AsNoTracking() on b.ProductId equals p.Id
            join w in db.Warehouses.AsNoTracking() on b.WarehouseId equals w.Id
            where p.TenantId == tenantId && b.Quantity > 0
            orderby w.Name, p.ArticleCode
            select new { b.ProductId, p.ArticleCode, p.Name, b.WarehouseId, WarehouseName = w.Name, b.Quantity }
        ).ToListAsync(ct);

        var avgByKey = await db.InventoryAverageCosts
            .AsNoTracking()
            .Where(c => c.TenantId == tenantId)
            .ToDictionaryAsync(c => (c.ProductId, c.WarehouseId), c => c.UnitCostIls, ct);

        var lines = new List<InventoryValuationLineDto>();
        foreach (var row in rows)
        {
            if (!avgByKey.TryGetValue((row.ProductId, row.WarehouseId), out var unit) || unit <= 0)
                continue;

            var total = InventoryCostService.RoundIls(row.Quantity * unit);
            lines.Add(new InventoryValuationLineDto(
                row.ProductId,
                row.ArticleCode,
                row.Name,
                row.WarehouseId,
                row.WarehouseName,
                row.Quantity,
                unit,
                total));
        }

        return new InventoryValuationReportDto(
            effectiveDate,
            InventoryCostMethodNames.ToApi(method),
            lines,
            InventoryCostService.RoundIls(lines.Sum(l => l.TotalValueIls)));
    }
}
