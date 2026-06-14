using System.Globalization;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services.Pdf;

public static class VendorServicesReportPdfBuilder
{
    public static VendorServicesReportPdfModel Build(
        Tenant tenant,
        string? logoPath,
        VendorServicesReportDto report)
    {
        var lines = report.Lines
            .Select((line, index) => new VendorServicesReportPdfLineModel(
                index + 1,
                FormatDate(line.ServiceDate),
                line.VendorName,
                FormatSource(line.SourceKind, line.ReceiptNumber),
                FormatCategory(line.Category),
                string.IsNullOrWhiteSpace(line.Description) ? "—" : line.Description!,
                FormatMoney(line.AmountIls)))
            .ToList();

        return new VendorServicesReportPdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoPath),
            "דוח שירותי ספקים",
            "דוח שירותי ספקים",
            DateTime.UtcNow,
            BuildFilterSubtitle(report.From, report.To, report.GrandTotalIls, lines.Count),
            report.GrandTotalIls,
            lines);
    }

    private static string BuildFilterSubtitle(DateTime? from, DateTime? to, decimal grandTotal, int lineCount) =>
        $"{PdfReportFormat.PeriodSubtitle(from, to, FormatDate)} | סה\"כ: {PdfReportFormat.Ils(grandTotal)} | {PdfReportFormat.CountSegment("שורות", lineCount)}";

    private static string FormatSource(string sourceKind, string? receiptNumber)
    {
        var label = sourceKind switch
        {
            "LandedCost" => "הוצאה נלווה",
            "GrService" => "GR",
            "Journal" => "יומן",
            _ => sourceKind
        };
        return string.IsNullOrWhiteSpace(receiptNumber) ? label : $"{label} {receiptNumber}";
    }

    private static string FormatCategory(string value)
    {
        if (Enum.TryParse<PurchaseReceiptLandedCostCategory>(value, true, out var landed))
        {
            return landed switch
            {
                PurchaseReceiptLandedCostCategory.Logistics => "משלוח / לוגיסטיקה",
                PurchaseReceiptLandedCostCategory.Customs => "מכס",
                PurchaseReceiptLandedCostCategory.Tax => "מס",
                _ => "אחר"
            };
        }

        if (Enum.TryParse<OperatingExpenseType>(value, true, out var operating))
        {
            return operating switch
            {
                OperatingExpenseType.Logistics => "משלוח / לוגיסטיקה",
                _ => value
            };
        }

        return value;
    }

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal value) =>
        value.ToString("N2", CultureInfo.InvariantCulture);
}
