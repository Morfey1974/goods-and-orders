using System.Globalization;
using OrderManagement.Api.Dto;

namespace OrderManagement.Api.Services.Pdf;

public static class Form1342PdfBuilder
{
    public static Form1342PdfModel Build(
        Entities.Tenant tenant,
        string? logoAbsolutePath,
        Form1342ReportDto report)
    {
        var lines = report.Lines.Select(l => new Form1342PdfLineModel(
            l.RowNumber,
            l.AssetDescription,
            FormatDate(l.AcquisitionDate),
            FormatDate(l.InServiceDate),
            FormatMoney(l.OriginalCostIls),
            FormatMoney(l.ChangesCostIls),
            FormatMoney(l.TotalDepreciableIls),
            FormatRate(l.LegalDepreciationRatePercent),
            FormatRate(l.ClaimedDepreciationRatePercent),
            FormatMoney(l.CurrentYearDepreciationIls),
            FormatMoney(l.PreviousAccumulatedDepreciationIls),
            FormatMoney(l.TotalAccumulatedDepreciationIls),
            FormatMoney(l.RemainingBalanceIls),
            string.IsNullOrWhiteSpace(l.Notes) ? "—" : l.Notes!)).ToList();

        return new Form1342PdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoAbsolutePath),
            report.TaxYear,
            report.TenantName ?? tenant.BusinessName ?? "",
            report.OsekNumber ?? tenant.OsekNumber,
            DateTime.UtcNow,
            lines,
            FormatMoney(report.TotalCurrentYearDepreciationIls));
    }

    private static string FormatDate(DateTime utc) =>
        utc.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal value) =>
        value.ToString("N2", CultureInfo.InvariantCulture);

    private static string FormatRate(decimal value) =>
        value.ToString("0.####", CultureInfo.InvariantCulture) + "%";
}
