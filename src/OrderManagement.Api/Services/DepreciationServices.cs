using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class FixedAssetInstanceService(AppDbContext db)
{
    public async Task<IReadOnlyList<FixedAssetInstance>> ListActiveAsync(Guid tenantId, CancellationToken ct) =>
        await db.FixedAssetInstances.AsNoTracking()
            .Include(i => i.Product)
            .Include(i => i.PurchaseReceipt)
            .Where(i => i.TenantId == tenantId && i.Status != FixedAssetInstanceStatus.Disposed)
            .OrderBy(i => i.AcquisitionDate)
            .ThenBy(i => i.Name)
            .ToListAsync(ct);

    public static FixedAssetInstanceDto ToDto(FixedAssetInstance i, string? receiptNumber = null)
    {
        var depreciable = DepreciationCalculator.DepreciableBase(
            i.OriginalCostIls, i.ChangesCostIls, i.BusinessUsePercent);
        var annual = DepreciationCalculator.FullAnnualDepreciation(depreciable, i.AnnualDepreciationPercent);
        return new FixedAssetInstanceDto(
            i.Id,
            i.ProductId,
            i.Product?.ArticleCode,
            i.Name,
            i.Description,
            i.PurchaseReceiptId,
            receiptNumber ?? i.PurchaseReceipt?.ReceiptNumber,
            i.AcquisitionDate,
            i.InServiceDate,
            i.OriginalCostIls,
            i.ChangesCostIls,
            depreciable,
            i.Category.ToString(),
            i.AnnualDepreciationPercent,
            i.BusinessUsePercent,
            annual,
            i.Status.ToString(),
            i.DisposedAt,
            i.VendorName,
            i.InvoiceReference,
            i.Notes);
    }

    public async Task RefreshDepreciationStatusAsync(FixedAssetInstance instance, DateTime asOf, CancellationToken ct)
    {
        if (instance.Status == FixedAssetInstanceStatus.Disposed) return;

        var depreciable = DepreciationCalculator.DepreciableBase(
            instance.OriginalCostIls, instance.ChangesCostIls, instance.BusinessUsePercent);

        if (DepreciationCalculator.IsFullyDepreciated(
                depreciable,
                instance.AnnualDepreciationPercent,
                instance.AcquisitionDate,
                instance.InServiceDate,
                asOf,
                instance.DisposedAt))
        {
            instance.Status = FixedAssetInstanceStatus.FullyDepreciated;
            instance.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }
    }
}

public class Form1342ReportService(AppDbContext db)
{
    public async Task<Form1342ReportDto> BuildAsync(Guid tenantId, int taxYear, CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().FirstAsync(t => t.Id == tenantId, ct);
        var instances = await db.FixedAssetInstances.AsNoTracking()
            .Where(i => i.TenantId == tenantId)
            .OrderBy(i => i.AcquisitionDate)
            .ThenBy(i => i.Name)
            .ToListAsync(ct);

        var lines = new List<Form1342LineDto>();
        var row = 1;
        decimal totalCurrent = 0m;

        foreach (var instance in instances)
        {
            if (!IsRelevantForTaxYear(instance, taxYear)) continue;

            var line = BuildLine(instance, taxYear, row++);
            lines.Add(line);
            totalCurrent += line.CurrentYearDepreciationIls;
        }

        return new Form1342ReportDto(
            taxYear,
            tenant.BusinessName,
            tenant.OsekNumber,
            lines,
            DepreciationCalculator.RoundMoney(totalCurrent));
    }

    private static bool IsRelevantForTaxYear(FixedAssetInstance instance, int taxYear)
    {
        var serviceStart = instance.InServiceDate.Date > instance.AcquisitionDate.Date
            ? instance.InServiceDate.Date
            : instance.AcquisitionDate.Date;
        if (serviceStart.Year > taxYear) return false;
        if (instance.Status == FixedAssetInstanceStatus.Disposed &&
            instance.DisposedAt is { } disposed &&
            disposed.Year < taxYear)
            return false;
        return true;
    }

    public static Form1342LineDto BuildLine(FixedAssetInstance instance, int taxYear, int rowNumber)
    {
        var depreciable = DepreciationCalculator.DepreciableBase(
            instance.OriginalCostIls, instance.ChangesCostIls, instance.BusinessUsePercent);
        var legalRate = DepreciationAssetCategoryRates.AnnualPercent(instance.Category);
        var claimedRate = instance.AnnualDepreciationPercent;

        var previous = DepreciationCalculator.AccumulatedBeforeTaxYear(
            depreciable,
            claimedRate,
            instance.AcquisitionDate,
            instance.InServiceDate,
            taxYear,
            instance.DisposedAt);

        var current = DepreciationCalculator.DepreciationForTaxYear(
            depreciable,
            claimedRate,
            instance.AcquisitionDate,
            instance.InServiceDate,
            taxYear,
            previous,
            instance.DisposedAt);

        var total = DepreciationCalculator.RoundMoney(Math.Min(depreciable, previous + current));
        var remaining = DepreciationCalculator.RoundMoney(Math.Max(0m, depreciable - total));

        var description = instance.Name;

        return new Form1342LineDto(
            rowNumber,
            instance.Id,
            description,
            instance.AcquisitionDate,
            instance.InServiceDate,
            instance.OriginalCostIls,
            instance.ChangesCostIls,
            depreciable,
            legalRate,
            claimedRate,
            current,
            previous,
            total,
            remaining,
            instance.BusinessUsePercent,
            instance.Notes);
    }
}

public class DepreciationReportService(AppDbContext db)
{
    public async Task<IReadOnlyList<FixedAssetDepreciationScheduleLineDto>> BuildPeriodLinesAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var periodEnd = to?.Date ?? DateTime.UtcNow.Date;
        var periodStart = from?.Date ?? new DateTime(periodEnd.Year, 1, 1);

        var instances = await db.FixedAssetInstances.AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.Status != FixedAssetInstanceStatus.Disposed)
            .ToListAsync(ct);

        var result = new List<FixedAssetDepreciationScheduleLineDto>();

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

            var accumulatedEnd = DepreciationCalculator.RoundMoney(
                Math.Min(depreciable, accumulatedBefore + periodDep));

            result.Add(new FixedAssetDepreciationScheduleLineDto(
                instance.Id,
                instance.Name,
                instance.Category.ToString(),
                periodEnd.Year,
                DepreciationCalculator.MonthsInTaxYear(
                    instance.AcquisitionDate, instance.InServiceDate, periodEnd.Year, instance.DisposedAt),
                periodDep,
                accumulatedEnd,
                DepreciationCalculator.RoundMoney(depreciable - accumulatedEnd)));
        }

        return result.OrderBy(l => l.Name).ToList();
    }
}
