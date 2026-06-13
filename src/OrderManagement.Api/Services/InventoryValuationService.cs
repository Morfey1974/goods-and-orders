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
        bool includeDepleted,
        CancellationToken ct)
    {
        var effectiveDate = NormalizeAsOf(asOf);
        var rows = await QueryOpenLotsAsync(tenantId, effectiveDate, productId, warehouseId, includeDepleted, ct);
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
        var rows = await QueryOpenLotsAsync(tenantId, effectiveDate, null, null, includeDepleted: false, ct);
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
        var rows = await QueryOpenLotsAsync(tenantId, effectiveDate, null, null, includeDepleted: false, ct);

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
        bool includeDepleted,
        CancellationToken ct)
    {
        var historical = IsHistoricalAsOf(effectiveDate);
        var restoredQtyByLot = historical
            ? await SumIssueAllocationsAfterDateAsync(tenantId, effectiveDate, ct)
            : null;

        var query =
            from lot in db.InventoryLots.AsNoTracking()
            join p in db.Products.AsNoTracking() on lot.ProductId equals p.Id
            join w in db.Warehouses.AsNoTracking() on lot.WarehouseId equals w.Id
            where lot.TenantId == tenantId &&
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

        var lineIds = raw
            .Where(x => x.SourceType == InventoryLotSource.PurchaseReceipt && x.SourceId.HasValue)
            .Select(x => x.SourceId!.Value)
            .Distinct()
            .ToList();

        var receiptByLineId = lineIds.Count == 0
            ? new Dictionary<Guid, ReceiptLineInfo>()
            : await (
                from line in db.PurchaseReceiptLines.AsNoTracking()
                join receipt in db.PurchaseReceipts.AsNoTracking() on line.PurchaseReceiptId equals receipt.Id
                where lineIds.Contains(line.Id) && receipt.TenantId == tenantId
                select new { LineId = line.Id, receipt.Id, receipt.ReceiptNumber }
            ).ToDictionaryAsync(x => x.LineId, x => new ReceiptLineInfo(x.Id, x.ReceiptNumber), ct);

        var assemblyIds = raw
            .Where(x => x.SourceType == InventoryLotSource.Assembly && x.SourceId.HasValue)
            .Select(x => x.SourceId!.Value)
            .Distinct()
            .ToList();

        var assemblyById = assemblyIds.Count == 0
            ? new Dictionary<Guid, AssemblyInfo>()
            : await db.StockAssemblies.AsNoTracking()
                .Where(a => assemblyIds.Contains(a.Id) && a.TenantId == tenantId)
                .ToDictionaryAsync(a => a.Id, a => new AssemblyInfo(a.Id, a.AssemblyNumber), ct);

        var lotIds = raw.Select(x => x.Id).ToList();
        var issuedByLot = lotIds.Count == 0
            ? new Dictionary<Guid, decimal>()
            : await db.InventoryLotAllocations.AsNoTracking()
                .Where(a => a.TenantId == tenantId && lotIds.Contains(a.InventoryLotId))
                .GroupBy(a => a.InventoryLotId)
                .Select(g => new { LotId = g.Key, Qty = g.Sum(x => x.Quantity) })
                .ToDictionaryAsync(x => x.LotId, x => x.Qty, ct);

        return raw
            .Select(x =>
            {
                var qty = x.QuantityRemaining;
                if (historical && restoredQtyByLot!.TryGetValue(x.Id, out var restored))
                    qty = StockQuantity.Normalize(qty + restored);

                var issued = issuedByLot.GetValueOrDefault(x.Id);
                var received = StockQuantity.Normalize(x.QuantityRemaining + issued);

                return new { x, qty, received };
            })
            .Where(x => includeDepleted || x.qty > 0)
            .Select(x =>
            {
                ReceiptLineInfo? receiptInfo = null;
                if (x.x.SourceType == InventoryLotSource.PurchaseReceipt && x.x.SourceId is { } lineId)
                    receiptByLineId.TryGetValue(lineId, out receiptInfo);

                AssemblyInfo? assemblyInfo = null;
                if (x.x.SourceType == InventoryLotSource.Assembly && x.x.SourceId is { } assemblyId)
                    assemblyById.TryGetValue(assemblyId, out assemblyInfo);

                var docNumber = receiptInfo?.ReceiptNumber ?? assemblyInfo?.AssemblyNumber;

                return new OpenLotRow(
                    x.x.Id,
                    x.x.ProductId,
                    x.x.ArticleCode,
                    x.x.LegacySku,
                    x.x.ProductName,
                    x.x.WarehouseId,
                    x.x.WarehouseName,
                    x.received,
                    x.qty,
                    x.x.UnitCostIls,
                    x.x.ReceivedAt,
                    x.x.SourceType.ToString(),
                    x.x.SourceId,
                    receiptInfo?.ReceiptId,
                    receiptInfo?.ReceiptNumber,
                    assemblyInfo?.AssemblyId,
                    assemblyInfo?.AssemblyNumber,
                    ResolveSourceLabel(x.x.SourceType, x.x.ReceivedAt, docNumber));
            })
            .ToList();
    }

    /// <summary>
    /// Issue allocations after as-of date — add back to current lot qty for historical valuation.
    /// </summary>
    private async Task<Dictionary<Guid, decimal>> SumIssueAllocationsAfterDateAsync(
        Guid tenantId,
        DateTime asOfInclusive,
        CancellationToken ct)
    {
        var cutoff = asOfInclusive.Date.AddDays(1);

        return await (
            from a in db.InventoryLotAllocations.AsNoTracking()
            join m in db.StockMovements.AsNoTracking() on a.StockMovementId equals m.Id
            where a.TenantId == tenantId
                  && m.MovementType == StockMovementType.Issue
                  && m.MovementDate >= cutoff
            group a by a.InventoryLotId
            into g
            select new { LotId = g.Key, Qty = g.Sum(x => x.Quantity) }
        ).ToDictionaryAsync(x => x.LotId, x => x.Qty, ct);
    }

    private static bool IsHistoricalAsOf(DateTime effectiveDate) =>
        effectiveDate.Date < DateTime.UtcNow.Date;

    private static string? ResolveSourceLabel(
        InventoryLotSource sourceType,
        DateTime receivedAt,
        string? receiptNumber)
    {
        return sourceType switch
        {
            InventoryLotSource.OpeningBalance => $"opening:{receivedAt:yyyy-MM-dd}",
            InventoryLotSource.PurchaseReceipt when !string.IsNullOrWhiteSpace(receiptNumber)
                => $"receipt:{receiptNumber}",
            InventoryLotSource.PurchaseReceipt => "receipt:",
            InventoryLotSource.Assembly when !string.IsNullOrWhiteSpace(receiptNumber)
                => $"assembly:{receiptNumber}",
            InventoryLotSource.Assembly => "assembly:",
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
            r.QuantityReceived,
            r.QuantityRemaining,
            r.UnitCostIls,
            InventoryCostService.RoundIls(r.QuantityReceived * r.UnitCostIls),
            InventoryCostService.RoundIls(r.QuantityRemaining * r.UnitCostIls),
            r.ReceivedAt,
            r.SourceType,
            r.SourceId,
            r.SourceLabel,
            r.SourceReceiptId,
            r.SourceReceiptNumber,
            r.SourceAssemblyId,
            r.SourceAssemblyNumber);

    private sealed record ReceiptLineInfo(Guid ReceiptId, string ReceiptNumber);

    private sealed record AssemblyInfo(Guid AssemblyId, string AssemblyNumber);

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
        decimal QuantityReceived,
        decimal QuantityRemaining,
        decimal UnitCostIls,
        DateTime ReceivedAt,
        string SourceType,
        Guid? SourceId,
        Guid? SourceReceiptId,
        string? SourceReceiptNumber,
        Guid? SourceAssemblyId,
        string? SourceAssemblyNumber,
        string? SourceLabel);
}
