using System.Globalization;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services.Pdf;

public static class ProfitAndLossReportPdfBuilder
{
    public static ProfitAndLossReportPdfModel Build(
        Tenant tenant,
        string? logoPath,
        ProfitAndLossReportDto report)
    {
        var summaryLines = new List<ProfitAndLossReportPdfLineModel>
        {
            new("הכנסות", FormatMoney(report.RevenueIls), false, false),
            new("עלות מכר (COGS)", FormatMoney(-report.CogsIls), false, false),
            new("רווח גולמי", FormatMoney(report.GrossProfitIls), true, false),
            new("הוצאות מוכרות", "", false, true),
            new("בית (מעורב)", FormatMoney(-report.HomeMixedRecognizedIls), false, false),
            new("הוצאות ישירות", FormatMoney(-report.OperatingDirectRecognizedIls), false, false),
            new("פחת", FormatMoney(-report.DepreciationIls), false, false),
            new("רווח לצורכי מס", FormatMoney(report.NetProfitIls), true, false),
        };

        var categoryLines = report.OperatingByCategory
            .Select(c => new ProfitAndLossReportPdfCategoryLineModel(
                FormatOperatingCategory(c.Category),
                FormatMoney(c.AmountIls)))
            .ToList();

        return new ProfitAndLossReportPdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoPath),
            "דוח רווח והפסד (עוסק פטור)",
            "דוח רווח והפסד",
            DateTime.UtcNow,
            BuildFilterSubtitle(report.From, report.To, report.NetProfitIls),
            FormatCogsMethod(report.CogsMethod),
            summaryLines,
            categoryLines);
    }

    private static string FormatCogsMethod(string method) =>
        PlCogsMethodParser.Parse(method) switch
        {
            PlCogsMethod.InventoryFormula => "COGS: נוסחת מלאי (פתיחה + קניות − סגירה)",
            PlCogsMethod.IssueWriteOffs => "COGS: לפי הוצאות H- (מלאי)",
            _ => "COGS: לפי תשלומים (מזומן)"
        };

    private static string FormatOperatingCategory(string value) =>
        Enum.TryParse<OperatingExpenseType>(value, true, out var type)
            ? type switch
            {
                OperatingExpenseType.Accountant => "רואה חשבון",
                OperatingExpenseType.OfficeSupplies => "ציוד משרדי",
                OperatingExpenseType.Advertising => "פרסום",
                OperatingExpenseType.BankFees => "עמלות בנק",
                OperatingExpenseType.Insurance => "ביטוח",
                OperatingExpenseType.ProfessionalServices => "שירותים מקצועיים",
                OperatingExpenseType.SoftwareSubscription => "תוכנה / מנויים",
                OperatingExpenseType.Rent => "שכירות",
                OperatingExpenseType.Materials => "חומרים / מתכלים",
                OperatingExpenseType.Logistics => "משלוח / לוגיסטיקה",
                _ => "אחר"
            }
            : value;

    private static string BuildFilterSubtitle(DateTime? from, DateTime? to, decimal netProfit) =>
        $"{PdfReportFormat.PeriodSubtitle(from, to, FormatDate)} | רווח לצורכי מס: {PdfReportFormat.Ils(netProfit)}";

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal value) =>
        value.ToString("N2", CultureInfo.InvariantCulture);
}
