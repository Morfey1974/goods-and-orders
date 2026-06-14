using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Services.Pdf;

public static class InventoryValuationPdfBuilder
{
    public static InventoryValuationPdfModel Build(
        Tenant tenant,
        string? logoAbsolutePath,
        InventoryValuationReportDto report)
    {
        var groups = report.Lines
            .GroupBy(l => (l.WarehouseId, l.WarehouseName))
            .OrderBy(g => g.Key.WarehouseName)
            .Select(g =>
            {
                var row = 1;
                var lines = g
                    .OrderBy(l => l.ArticleCode)
                    .ThenBy(l => l.ReceivedAt)
                    .Select(l => new InventoryValuationLineModel(
                        row++,
                        l.ArticleCode,
                        l.ProductName,
                        l.Quantity,
                        l.UnitCostIls,
                        l.TotalValueIls,
                        l.ReceivedAt.HasValue ? FormatDate(l.ReceivedAt.Value) : null,
                        report.Detailed ? SourceLabelHebrew(l.SourceLabel) : null))
                    .ToList();
                return new InventoryValuationGroupModel(
                    WarehouseDisplayName(g.Key.WarehouseName),
                    lines);
            })
            .Where(g => g.Lines.Count > 0)
            .ToList();

        var filterParts = new List<string>
        {
            $"נכון לתאריך: {PdfReportFormat.Ltr(FormatDate(report.AsOfDate))}",
            $"שיטה: {PdfReportFormat.Ltr(report.CostMethod)}",
            $"סה\"כ: {PdfReportFormat.Ils(report.GrandTotalIls)}"
        };
        if (report.Detailed)
            filterParts.Add("פירוט מנות FIFO");

        return new InventoryValuationPdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoAbsolutePath),
            "דוח הערכת מלאי",
            "דוח הערכת מלאי",
            DateTime.UtcNow,
            string.Join(" | ", filterParts),
            report.Detailed,
            report.GrandTotalIls,
            groups);
    }

    private static string WarehouseDisplayName(string name) => name switch
    {
        WarehouseService.ComponentsWarehouseName => "מחסן רכיבים",
        WarehouseService.FinishedGoodsWarehouseName => "מחסן מוצרים גמורים",
        _ => name
    };

    private static string? SourceLabelHebrew(string? sourceLabel)
    {
        if (string.IsNullOrWhiteSpace(sourceLabel)) return null;
        if (sourceLabel.StartsWith("opening:", StringComparison.Ordinal))
            return $"יתרת פתיחה · {sourceLabel["opening:".Length..]}";
        if (sourceLabel.StartsWith("receipt:", StringComparison.Ordinal))
        {
            var number = sourceLabel["receipt:".Length..];
            return string.IsNullOrWhiteSpace(number) ? "תעודת קליטה" : $"תעודת קליטה {number}";
        }
        return sourceLabel;
    }

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", System.Globalization.CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal value) =>
        value.ToString("N2", System.Globalization.CultureInfo.InvariantCulture);
}
