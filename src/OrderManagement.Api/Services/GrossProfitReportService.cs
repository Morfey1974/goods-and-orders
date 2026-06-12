using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class GrossProfitReportService(AppDbContext db, CogsReportService cogsReport)
{
    public async Task<GrossProfitReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var startUtc = ReportDateRange.StartUtc(from);
        var endExclusiveUtc = ReportDateRange.EndExclusiveUtc(to);

        var q = db.BusinessDocuments.AsNoTracking()
            .Where(d => d.TenantId == tenantId && d.DocumentType == DocumentType.ChargeInvoice);

        if (startUtc.HasValue)
            q = q.Where(d => d.IssueDate >= startUtc.Value);
        if (endExclusiveUtc.HasValue)
            q = q.Where(d => d.IssueDate < endExclusiveUtc.Value);

        var docs = await q.ToListAsync(ct);
        var revenue = Math.Round(docs.Sum(d => d.TotalAmount), 2);

        var cogs = await cogsReport.BuildAsync(tenantId, from, to, ct);
        var cogsIls = cogs.CogsFromIssuesIls;

        return new GrossProfitReportDto(
            from?.Date,
            to?.Date,
            revenue,
            cogsIls,
            Math.Round(revenue - cogsIls, 2),
            docs.Count);
    }
}
