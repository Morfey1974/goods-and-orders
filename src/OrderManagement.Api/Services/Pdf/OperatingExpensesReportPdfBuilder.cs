using System.Globalization;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services.Pdf;

public static class OperatingExpensesReportPdfBuilder
{
    public static OperatingExpensesReportPdfModel Build(
        Tenant tenant,
        string? logoPath,
        OperatingExpensesReportDto report)
    {
        var expenseLines = report.ExpenseLines
            .Select((e, index) => new OperatingExpensesReportPdfExpenseLineModel(
                index + 1,
                FormatDate(e.ExpenseDate),
                FormatExpenseType(e),
                string.IsNullOrWhiteSpace(e.Notes) ? "—" : e.Notes!,
                FormatMoney(e.AmountIls),
                FormatMoney(e.RecognizedAmountIls)))
            .ToList();

        var depreciationLines = report.DepreciationLines
            .Select((line, index) => new OperatingExpensesReportPdfDepreciationLineModel(
                index + 1,
                line.Name,
                FormatDepreciationCategory(line.Category),
                FormatMoney(line.AnnualDepreciationIls),
                FormatMoney(line.PeriodDepreciationIls)))
            .ToList();

        return new OperatingExpensesReportPdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoPath),
            "דוח הוצאות תפעוליות",
            "דוח הוצאות תפעוליות",
            DateTime.UtcNow,
            BuildFilterSubtitle(report.From, report.To, report.GrandTotalRecognizedIls, report.ExpenseLines.Count),
            report.HomeMixedTotalIls,
            report.HomeMixedRecognizedIls,
            report.OperatingDirectTotalIls,
            report.DepreciationIls,
            report.GrandTotalRecognizedIls,
            expenseLines,
            depreciationLines);
    }

    private static string FormatExpenseType(BusinessExpenseDto e)
    {
        if (e.IsHomeMixed && !string.IsNullOrWhiteSpace(e.HomeExpenseType))
            return FormatHomeExpenseType(e.HomeExpenseType!);
        if (!string.IsNullOrWhiteSpace(e.OperatingExpenseType))
            return FormatOperatingExpenseType(e.OperatingExpenseType!);
        return "—";
    }

    private static string FormatHomeExpenseType(string value) =>
        Enum.TryParse<HomeExpenseType>(value, true, out var type)
            ? type switch
            {
                HomeExpenseType.Electricity => "חשמל",
                HomeExpenseType.Arnona => "ארנונה",
                HomeExpenseType.Water => "מים",
                HomeExpenseType.VaadBayit => "ועד בית",
                HomeExpenseType.PhoneInternet => "טלפון / אינטרנט",
                HomeExpenseType.MortgageInterest => "ריבית משכנתא",
                HomeExpenseType.Cleaning => "ניקיון",
                _ => "אחר"
            }
            : value;

    private static string FormatOperatingExpenseType(string value) =>
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

    private static string FormatDepreciationCategory(string value) =>
        Enum.TryParse<DepreciationAssetCategory>(value, true, out var category)
            ? category switch
            {
                DepreciationAssetCategory.Furniture => "ריהוט",
                DepreciationAssetCategory.OtherEquipment => "ציוד אחר",
                DepreciationAssetCategory.AirConditioner => "מזגן",
                DepreciationAssetCategory.ConstructionEquipment => "ציוד בנייה",
                DepreciationAssetCategory.Vehicle => "רכב",
                DepreciationAssetCategory.PersonalPc => "מחשב אישי",
                DepreciationAssetCategory.OtherPc => "מחשב אחר",
                DepreciationAssetCategory.ProfessionalBooks => "ספרים מקצועיים",
                _ => value
            }
            : value;

    private static string BuildFilterSubtitle(DateTime? from, DateTime? to, decimal grandTotal, int lineCount)
    {
        var period = FormatPeriod(from, to);
        return $"תקופה: {period} | סה\"כ לזיכוי: {FormatMoney(grandTotal)} ₪ | שורות: {lineCount}";
    }

    private static string FormatPeriod(DateTime? from, DateTime? to)
    {
        if (from is null && to is null) return "הכל";
        if (from is null) return $"עד {FormatDate(to!.Value)}";
        if (to is null) return $"מ-{FormatDate(from.Value)}";
        return $"{FormatDate(from.Value)} – {FormatDate(to.Value)}";
    }

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal value) =>
        value.ToString("N2", CultureInfo.InvariantCulture);
}
