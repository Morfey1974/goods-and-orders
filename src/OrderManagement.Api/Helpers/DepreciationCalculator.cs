namespace OrderManagement.Api.Helpers;

/// <summary>Linear depreciation (שיטת הקו הישר) per Israeli Income Tax Ordinance practice.</summary>
public static class DepreciationCalculator
{
    public static decimal RoundMoney(decimal value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);

    public static decimal DepreciableBase(decimal originalCostIls, decimal changesCostIls, decimal businessUsePercent)
    {
        var gross = originalCostIls + changesCostIls;
        if (gross <= 0 || businessUsePercent <= 0) return 0m;
        return RoundMoney(gross * businessUsePercent / 100m);
    }

    public static decimal FullAnnualDepreciation(decimal depreciableBase, decimal annualRatePercent)
    {
        if (depreciableBase <= 0 || annualRatePercent <= 0) return 0m;
        return RoundMoney(depreciableBase * annualRatePercent / 100m);
    }

    /// <summary>Months in service during a calendar tax year (inclusive).</summary>
    public static int MonthsInTaxYear(
        DateTime acquisitionDate,
        DateTime inServiceDate,
        int taxYear,
        DateTime? disposedAt)
    {
        var serviceStart = inServiceDate.Date > acquisitionDate.Date ? inServiceDate.Date : acquisitionDate.Date;
        var yearStart = new DateTime(taxYear, 1, 1);
        var yearEnd = new DateTime(taxYear, 12, 31);

        if (serviceStart > yearEnd) return 0;
        if (disposedAt is { } disposed && disposed.Date < yearStart) return 0;

        var effectiveStart = serviceStart > yearStart ? serviceStart : yearStart;
        var effectiveEnd = disposedAt is { } d && d.Date < yearEnd ? d.Date : yearEnd;
        if (effectiveStart > effectiveEnd) return 0;

        var startIndex = effectiveStart.Year * 12 + effectiveStart.Month;
        var endIndex = effectiveEnd.Year * 12 + effectiveEnd.Month;
        return Math.Max(0, endIndex - startIndex + 1);
    }

    public static decimal AccumulatedBeforeTaxYear(
        decimal depreciableBase,
        decimal annualRatePercent,
        DateTime acquisitionDate,
        DateTime inServiceDate,
        int taxYear,
        DateTime? disposedAt)
    {
        if (depreciableBase <= 0) return 0m;

        var serviceStart = inServiceDate.Date > acquisitionDate.Date ? inServiceDate.Date : acquisitionDate.Date;
        var firstYear = serviceStart.Year;
        var total = 0m;

        for (var year = firstYear; year < taxYear; year++)
        {
            total += DepreciationForTaxYear(
                depreciableBase,
                annualRatePercent,
                acquisitionDate,
                inServiceDate,
                year,
                total,
                disposedAt);
            if (total >= depreciableBase) break;
        }

        return RoundMoney(Math.Min(total, depreciableBase));
    }

    /// <summary>
    /// Depreciation for a calendar tax year. On the final period, takes the remaining balance to zero.
    /// </summary>
    public static decimal DepreciationForTaxYear(
        decimal depreciableBase,
        decimal annualRatePercent,
        DateTime acquisitionDate,
        DateTime inServiceDate,
        int taxYear,
        decimal accumulatedBeforeYear,
        DateTime? disposedAt)
    {
        if (depreciableBase <= 0) return 0m;

        var remaining = depreciableBase - accumulatedBeforeYear;
        if (remaining <= 0) return 0m;

        var months = MonthsInTaxYear(acquisitionDate, inServiceDate, taxYear, disposedAt);
        if (months <= 0) return 0m;

        var annual = FullAnnualDepreciation(depreciableBase, annualRatePercent);
        var proposed = RoundMoney(annual * months / 12m);

        if (proposed >= remaining) return RoundMoney(remaining);

        return proposed;
    }

    public static decimal TotalAccumulatedThroughTaxYear(
        decimal depreciableBase,
        decimal annualRatePercent,
        DateTime acquisitionDate,
        DateTime inServiceDate,
        int taxYear,
        DateTime? disposedAt)
    {
        var before = AccumulatedBeforeTaxYear(
            depreciableBase, annualRatePercent, acquisitionDate, inServiceDate, taxYear, disposedAt);
        var current = DepreciationForTaxYear(
            depreciableBase, annualRatePercent, acquisitionDate, inServiceDate, taxYear, before, disposedAt);
        return RoundMoney(Math.Min(depreciableBase, before + current));
    }

    /// <summary>Depreciation for an arbitrary date range (used in operating expenses report).</summary>
    public static decimal DepreciationForPeriod(
        decimal depreciableBase,
        decimal annualRatePercent,
        DateTime acquisitionDate,
        DateTime inServiceDate,
        DateTime periodFrom,
        DateTime periodTo,
        decimal accumulatedBeforePeriod,
        DateTime? disposedAt)
    {
        if (depreciableBase <= 0 || periodFrom.Date > periodTo.Date) return 0m;

        var total = 0m;
        var fromYear = periodFrom.Year;
        var toYear = periodTo.Year;

        for (var year = fromYear; year <= toYear; year++)
        {
            var accumulatedBeforeYear = AccumulatedBeforeTaxYear(
                depreciableBase, annualRatePercent, acquisitionDate, inServiceDate, year, disposedAt);
            var yearDep = DepreciationForTaxYear(
                depreciableBase, annualRatePercent, acquisitionDate, inServiceDate, year,
                accumulatedBeforeYear, disposedAt);
            if (yearDep <= 0) continue;

            if (year == fromYear && year == toYear && fromYear == toYear)
            {
                var monthsInYear = MonthsInTaxYear(acquisitionDate, inServiceDate, year, disposedAt);
                if (monthsInYear <= 0) continue;
                var overlapMonths = CountOverlapMonths(periodFrom, periodTo, year, acquisitionDate, inServiceDate, disposedAt);
                if (overlapMonths <= 0) continue;
                total += RoundMoney(yearDep * overlapMonths / monthsInYear);
            }
            else if (year == fromYear)
            {
                var monthsInYear = MonthsInTaxYear(acquisitionDate, inServiceDate, year, disposedAt);
                if (monthsInYear <= 0) continue;
                var overlapMonths = CountOverlapMonths(periodFrom, new DateTime(year, 12, 31), year, acquisitionDate, inServiceDate, disposedAt);
                total += RoundMoney(yearDep * overlapMonths / monthsInYear);
            }
            else if (year == toYear)
            {
                var monthsInYear = MonthsInTaxYear(acquisitionDate, inServiceDate, year, disposedAt);
                if (monthsInYear <= 0) continue;
                var overlapMonths = CountOverlapMonths(new DateTime(year, 1, 1), periodTo, year, acquisitionDate, inServiceDate, disposedAt);
                total += RoundMoney(yearDep * overlapMonths / monthsInYear);
            }
            else
            {
                total += yearDep;
            }
        }

        var remaining = depreciableBase - accumulatedBeforePeriod;
        return RoundMoney(Math.Min(total, Math.Max(0m, remaining)));
    }

    private static int CountOverlapMonths(
        DateTime periodFrom,
        DateTime periodTo,
        int taxYear,
        DateTime acquisitionDate,
        DateTime inServiceDate,
        DateTime? disposedAt)
    {
        var yearStart = new DateTime(taxYear, 1, 1);
        var yearEnd = new DateTime(taxYear, 12, 31);
        var overlapStart = periodFrom.Date > yearStart ? periodFrom.Date : yearStart;
        var overlapEnd = periodTo.Date < yearEnd ? periodTo.Date : yearEnd;

        var serviceStart = inServiceDate.Date > acquisitionDate.Date ? inServiceDate.Date : acquisitionDate.Date;
        if (serviceStart > overlapEnd) return 0;
        if (disposedAt is { } d && d.Date < overlapStart) return 0;

        if (serviceStart > overlapStart) overlapStart = serviceStart;
        if (disposedAt is { } disp && disp.Date < overlapEnd) overlapEnd = disp.Date;
        if (overlapStart > overlapEnd) return 0;

        var startIndex = overlapStart.Year * 12 + overlapStart.Month;
        var endIndex = overlapEnd.Year * 12 + overlapEnd.Month;
        return Math.Max(0, endIndex - startIndex + 1);
    }

    public static bool IsFullyDepreciated(
        decimal depreciableBase,
        decimal annualRatePercent,
        DateTime acquisitionDate,
        DateTime inServiceDate,
        DateTime asOfDate,
        DateTime? disposedAt)
    {
        if (depreciableBase <= 0) return true;
        var accumulated = 0m;
        for (var year = acquisitionDate.Year; year <= asOfDate.Year; year++)
        {
            var before = accumulated;
            accumulated = TotalAccumulatedThroughTaxYear(
                depreciableBase, annualRatePercent, acquisitionDate, inServiceDate, year, disposedAt);
        }

        return accumulated >= depreciableBase;
    }
}
