using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class OperatingExpensesReportService(
    AppDbContext db,
    BusinessExpenseService expenses,
    DepreciationReportService depreciationReport)
{
    public async Task<OperatingExpensesReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var lines = await expenses.ListAsync(tenantId, from, to, ct);
        var homeLines = lines.Where(l => l.IsHomeMixed).ToList();
        var operatingLines = lines.Where(l => !l.IsHomeMixed).ToList();

        var homeTotal = Math.Round(homeLines.Sum(l => l.AmountIls), 2);
        var homeRecognized = Math.Round(homeLines.Sum(l => l.RecognizedAmountIls), 2);
        var operatingTotal = Math.Round(operatingLines.Sum(l => l.RecognizedAmountIls), 2);

        var depreciationLines = await depreciationReport.BuildPeriodLinesAsync(tenantId, from, to, ct);
        var depreciation = Math.Round(depreciationLines.Sum(l => l.CurrentYearDepreciationIls), 2);

        var grand = Math.Round(homeRecognized + operatingTotal + depreciation, 2);

        var mappedDepreciation = await MapDepreciationLinesAsync(tenantId, from, to, ct);

        return new OperatingExpensesReportDto(
            from?.Date,
            to?.Date,
            homeTotal,
            homeRecognized,
            operatingTotal,
            depreciation,
            grand,
            lines,
            mappedDepreciation);
    }

    private async Task<IReadOnlyList<FixedAssetDepreciationLineDto>> MapDepreciationLinesAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var periodEnd = to?.Date ?? DateTime.UtcNow.Date;
        var periodStart = from?.Date ?? new DateTime(periodEnd.Year, 1, 1);

        var instances = await db.FixedAssetInstances.AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.Status != Entities.FixedAssetInstanceStatus.Disposed)
            .ToListAsync(ct);

        var result = new List<FixedAssetDepreciationLineDto>();
        foreach (var instance in instances)
        {
            if (instance.AcquisitionDate.Date > periodEnd) continue;

            var depreciable = DepreciationCalculator.DepreciableBase(
                instance.OriginalCostIls, instance.ChangesCostIls, instance.BusinessUsePercent);
            if (depreciable <= 0) continue;

            var accumulatedBefore = DepreciationCalculator.AccumulatedBeforeTaxYear(
                depreciable,
                instance.AnnualDepreciationPercent,
                instance.AcquisitionDate,
                instance.InServiceDate,
                periodStart.Year,
                instance.DisposedAt);

            var periodDep = DepreciationCalculator.DepreciationForPeriod(
                depreciable,
                instance.AnnualDepreciationPercent,
                instance.AcquisitionDate,
                instance.InServiceDate,
                periodStart,
                periodEnd,
                accumulatedBefore,
                instance.DisposedAt);

            if (periodDep <= 0) continue;

            var annual = DepreciationCalculator.FullAnnualDepreciation(
                depreciable, instance.AnnualDepreciationPercent);

            result.Add(new FixedAssetDepreciationLineDto(
                instance.Id,
                instance.Name,
                instance.Category.ToString(),
                annual,
                periodDep));
        }

        return result.OrderBy(l => l.Name).ToList();
    }
}
