using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class InventoryValuationService(AppDbContext db)
{
    public async Task<IReadOnlyList<InventoryLotDto>> ListLotsAsync(
        Guid tenantId,
        DateTime? asOf,
        Guid? productId,
        Guid? warehouseId,
        CancellationToken ct)
    {
        var effectiveDate = NormalizeAsOf(asOf);
        var rows = await QueryOpenLotsAsync(tenantId, effectiveDate, productId, warehouseId, ct);
        return rows.Select(ToLotDto).ToList();
    }

    public async Task<InventoryValuationReportDto> BuildCurrentAsync(
        Guid tenantId,
        DateTime? asOf,
        bool detailed,
        CancellationToken ct)
    {
        var method = await db.Tenants
            .AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.InventoryCostMethod)
            .FirstAsync(ct);

        var effectiveDate = NormalizeAsOf(asOf);

        if (detailed)
            return await BuildDetailedReportAsync(tenantId, effectiveDate, method, ct);

        if (method == InventoryCostMethod.Wac)
            return await BuildWacReportAsync(tenantId, effectiveDate, method, ct);

        return await BuildAggregatedFifoReportAsync(tenantId, effectiveDate, method, ct);
    }

    private async Task<InventoryValuationReportDto> BuildDetailedReportAsync(
        Guid tenantId,
        DateTime effectiveDate,
        InventoryCostMethod method,
        CancellationToken ct)
    {
        var rows = await QueryOpenLotsAsync(tenantId, effectiveDate, null, null, ct);
        var lines = rows
            .Select(r =>
            {
                var total = InventoryCostService.RoundIls(r.QuantityRemaining * r.UnitCostIls);
                return new InventoryValuationLineDto(
                    r.ProductId,
                    r.ArticleCode,
                    r.LegacySku,
                    r.ProductName,
                    r.WarehouseId,
                    r.WarehouseName,
                    r.QuantityRemaining,
                    r.UnitCostIls,
                    total,
                    r.LotId,
                    r.ReceivedAt,
                    r.SourceType,
                    r.SourceLabel);
            })
            .OrderBy(l => l.WarehouseName)
            .ThenBy(l => l.ArticleCode)
            .ThenBy(l => l.ReceivedAt)
            .ToList();

        return new InventoryValuationReportDto(
            effectiveDate,
            InventoryCostMethodNames.ToApi(method),
            lines,
            InventoryCostService.RoundIls(lines.Sum(l => l.TotalValueIls)),
            Detailed: true);
    }

    private async Task<InventoryValuationReportDto> BuildAggregatedFifoReportAsync(
        Guid tenantId,
        DateTime effectiveDate,
        InventoryCostMethod method,
        CancellationToken ct)
    {
        var rows = await QueryOpenLotsAsync(tenantId, effectiveDate, null, null, ct);

        var lines = rows
            .GroupBy(x => new { x.ProductId, x.ArticleCode, x.LegacySku, x.ProductName, x.WarehouseId, x.WarehouseName })
            .Select(g =>
            {
                var qty = g.Sum(x => x.QuantityRemaining);
                var total = g.Sum(x => InventoryCostService.RoundIls(x.QuantityRemaining * x.UnitCostIls));
                var unit = qty > 0 ? InventoryCostService.RoundIls(total / qty) : 0;
                return new InventoryValuationLineDto(
                    g.Key.ProductId,
                    g.Key.ArticleCode,
                    g.Key.LegacySku,
                    g.Key.ProductName,
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
            select new { b.ProductId, p.ArticleCode, p.LegacySku, p.Name, b.WarehouseId, WarehouseName = w.Name, b.Quantity }
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
                row.LegacySku,
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

    private async Task<List<OpenLotRow>> QueryOpenLotsAsync(
        Guid tenantId,
        DateTime effectiveDate,
        Guid? productId,
        Guid? warehouseId,
        CancellationToken ct)
    {
        var query =
            from lot in db.InventoryLots.AsNoTracking()
            join p in db.Products.AsNoTracking() on lot.ProductId equals p.Id
            join w in db.Warehouses.AsNoTracking() on lot.WarehouseId equals w.Id
            where lot.TenantId == tenantId &&
                  lot.QuantityRemaining > 0 &&
                  lot.ReceivedAt <= effectiveDate
            select new { lot, p, w };

        if (productId.HasValue)
            query = query.Where(x => x.lot.ProductId == productId);
        if (warehouseId.HasValue)
            query = query.Where(x => x.lot.WarehouseId == warehouseId);

        var raw = await query
            .OrderBy(x => x.w.Name)
            .ThenBy(x => x.p.ArticleCode)
            .ThenBy(x => x.lot.ReceivedAt)
            .Select(x => new
            {
                x.lot.Id,
                x.lot.ProductId,
                x.p.ArticleCode,
                x.p.LegacySku,
                ProductName = x.p.Name,
                x.lot.WarehouseId,
                WarehouseName = x.w.Name,
                x.lot.QuantityRemaining,
                x.lot.UnitCostIls,
                x.lot.ReceivedAt,
                x.lot.SourceType,
                x.lot.SourceId,
            })
            .ToListAsync(ct);

        var receiptIds = raw
            .Where(x => x.SourceType == InventoryLotSource.PurchaseReceipt && x.SourceId.HasValue)
            .Select(x => x.SourceId!.Value)
            .Distinct()
            .ToList();

        var receiptNumbers = receiptIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.PurchaseReceipts.AsNoTracking()
                .Where(r => r.TenantId == tenantId && receiptIds.Contains(r.Id))
                .ToDictionaryAsync(r => r.Id, r => r.ReceiptNumber, ct);

        return raw.Select(x => new OpenLotRow(
            x.Id,
            x.ProductId,
            x.ArticleCode,
            x.LegacySku,
            x.ProductName,
            x.WarehouseId,
            x.WarehouseName,
            x.QuantityRemaining,
            x.UnitCostIls,
            x.ReceivedAt,
            x.SourceType.ToString(),
            x.SourceId,
            ResolveSourceLabel(x.SourceType, x.SourceId, x.ReceivedAt, receiptNumbers))).ToList();
    }

    private static string? ResolveSourceLabel(
        InventoryLotSource sourceType,
        Guid? sourceId,
        DateTime receivedAt,
        IReadOnlyDictionary<Guid, string> receiptNumbers)
    {
        return sourceType switch
        {
            InventoryLotSource.OpeningBalance => $"opening:{receivedAt:yyyy-MM-dd}",
            InventoryLotSource.PurchaseReceipt when sourceId is { } id && receiptNumbers.TryGetValue(id, out var num)
                => $"receipt:{num}",
            InventoryLotSource.PurchaseReceipt => "receipt:",
            _ => sourceType.ToString(),
        };
    }

    private static InventoryLotDto ToLotDto(OpenLotRow r) =>
        new(
            r.LotId,
            r.ProductId,
            r.ArticleCode,
            r.LegacySku,
            r.ProductName,
            r.WarehouseId,
            r.WarehouseName,
            r.QuantityRemaining,
            r.UnitCostIls,
            InventoryCostService.RoundIls(r.QuantityRemaining * r.UnitCostIls),
            r.ReceivedAt,
            r.SourceType,
            r.SourceId,
            r.SourceLabel);

    private static DateTime NormalizeAsOf(DateTime? asOf) =>
        asOf.HasValue
            ? DateTime.SpecifyKind(asOf.Value.Date, DateTimeKind.Utc)
            : DateTime.UtcNow.Date;

    private sealed record OpenLotRow(
        Guid LotId,
        Guid ProductId,
        string ArticleCode,
        string? LegacySku,
        string ProductName,
        Guid WarehouseId,
        string WarehouseName,
        decimal QuantityRemaining,
        decimal UnitCostIls,
        DateTime ReceivedAt,
        string SourceType,
        Guid? SourceId,
        string? SourceLabel);
}
