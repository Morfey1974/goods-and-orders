using System.Globalization;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services.Pdf;

public static class CogsReportPdfBuilder
{
    public static CogsReportPdfModel Build(
        Tenant tenant,
        string? logoPath,
        CogsReportDto report)
    {
        var issueLines = report.IssueLines
            .Select((line, index) => new CogsReportPdfIssueLineModel(
                index + 1,
                FormatDate(line.MovementDate),
                line.ArticleCode,
                line.ProductName,
                FormatQuantity(line.Quantity),
                FormatMoney(line.TotalCostIls),
                string.IsNullOrWhiteSpace(line.Notes) ? "—" : line.Notes!))
            .ToList();

        return new CogsReportPdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoPath),
            "דוח עלות מכר (COGS)",
            "דוח עלות מכר (COGS)",
            DateTime.UtcNow,
            BuildFilterSubtitle(report.From, report.To, report.CogsFromIssuesIls, issueLines.Count),
            FormatMoney(report.OpeningInventoryIls),
            FormatMoney(report.PurchasesToInventoryIls),
            FormatMoney(report.ClosingInventoryIls),
            FormatMoney(report.CogsByFormulaIls),
            FormatMoney(report.CogsFromIssuesIls),
            issueLines);
    }

    private static string BuildFilterSubtitle(DateTime? from, DateTime? to, decimal cogsFromIssues, int lineCount)
    {
        var period = FormatPeriod(from, to);
        return $"תקופה: {period} | COGS (הוצאות H-): {FormatMoney(cogsFromIssues)} ₪ | שורות: {lineCount}";
    }

    private static string FormatPeriod(DateTime? from, DateTime? to)
    {
        if (from is null && to is null) return "הכל";
        if (from is null) return $"עד {FormatDate(to!.Value)}";
        if (to is null) return $"מ-{FormatDate(from.Value)}";
        return $"{FormatDate(from.Value)} – {FormatDate(to.Value)}";
    }

    private static string FormatQuantity(decimal value) =>
        value.ToString("0.####", CultureInfo.InvariantCulture);

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal value) =>
        value.ToString("N2", CultureInfo.InvariantCulture);
}
