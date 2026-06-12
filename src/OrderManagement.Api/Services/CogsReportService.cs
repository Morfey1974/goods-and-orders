using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class CogsReportService(AppDbContext db, InventoryValuationService valuation)
{
    public async Task<CogsReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var startUtc = ReportDateRange.StartUtc(from);
        var endExclusiveUtc = ReportDateRange.EndExclusiveUtc(to);
        var endInclusive = endExclusiveUtc?.AddDays(-1) ?? DateTime.UtcNow.Date;

        var openingDate = startUtc?.AddDays(-1) ?? endInclusive;
        var closingDate = endInclusive;

        var opening = await SumInventoryValueAsync(tenantId, openingDate, ct);
        var closing = await SumInventoryValueAsync(tenantId, closingDate, ct);
        var purchases = await SumReceiptMovementsAsync(tenantId, startUtc, endExclusiveUtc, ct);

        var issueQuery =
            from m in db.StockMovements.AsNoTracking()
            join p in db.Products.AsNoTracking() on m.ProductId equals p.Id
            where m.TenantId == tenantId && m.MovementType == StockMovementType.Issue
            select new { m, p };

        if (startUtc.HasValue)
            issueQuery = issueQuery.Where(x => x.m.MovementDate >= startUtc.Value);
        if (endExclusiveUtc.HasValue)
            issueQuery = issueQuery.Where(x => x.m.MovementDate < endExclusiveUtc.Value);

        var issues = await issueQuery
            .OrderBy(x => x.m.MovementDate)
            .ThenBy(x => x.p.ArticleCode)
            .ToListAsync(ct);

        var issueLines = issues.Select(x => new CogsIssueLineDto(
            x.m.Id,
            x.m.MovementDate,
            x.p.ArticleCode,
            x.p.Name,
            x.m.Quantity,
            x.m.TotalCost ?? 0m,
            x.m.Notes)).ToList();

        var cogsFromIssues = Math.Round(issueLines.Sum(l => l.TotalCostIls), 2);
        var cogsByFormula = Math.Round(opening + purchases - closing, 2);

        return new CogsReportDto(
            from?.Date,
            to?.Date,
            opening,
            purchases,
            closing,
            cogsByFormula,
            cogsFromIssues,
            issueLines);
    }

    private async Task<decimal> SumInventoryValueAsync(Guid tenantId, DateTime asOf, CancellationToken ct)
    {
        var lots = await valuation.ListLotsAsync(tenantId, asOf, null, null, ct);
        return Math.Round(lots.Sum(l => l.TotalValueIls), 2);
    }

    private async Task<decimal> SumReceiptMovementsAsync(
        Guid tenantId,
        DateTime? startUtc,
        DateTime? endExclusiveUtc,
        CancellationToken ct)
    {
        var q = db.StockMovements.AsNoTracking()
            .Where(m => m.TenantId == tenantId && m.MovementType == StockMovementType.Receipt);
        if (startUtc.HasValue)
            q = q.Where(m => m.MovementDate >= startUtc.Value);
        if (endExclusiveUtc.HasValue)
            q = q.Where(m => m.MovementDate < endExclusiveUtc.Value);

        var sum = await q.SumAsync(m => m.TotalCost ?? 0m, ct);
        return Math.Round(sum, 2);
    }
}
