using System.Globalization;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

public static class CogsReportPdfRenderer
{
    private const string FontRegular = PdfFontRegistry.HebrewRegular;
    private const string FontBold = PdfFontRegistry.HebrewBold;
    private static bool _fontsRegistered;

    private static readonly string TitleAccentColor = "#3d4f5f";
    private static readonly string TableBorderColor = "#b0b8bf";
    private static readonly string TableHeaderBg = "#e8ecef";
    private static readonly string TableRowAltBg = "#f3f5f7";
    private static readonly string TableRowBg = "#FFFFFF";

    static CogsReportPdfRenderer()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        RegisterFonts();
    }

    private static void RegisterFonts()
    {
        if (_fontsRegistered) return;
        PdfFontRegistry.EnsureRegistered();
        _fontsRegistered = true;
    }

    public static byte[] Render(CogsReportPdfModel model)
    {
        RegisterFonts();
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginHorizontal(24);
                page.MarginTop(20);
                page.MarginBottom(24);
                page.DefaultTextStyle(Regular(8.5f));

                page.Content().Column(col =>
                {
                    col.Item().Element(c => PdfLetterheadRenderer.Compose(c, model.Letterhead));
                    col.Item().PaddingTop(10).Element(c => ComposeTitleBand(c, model));
                    col.Item().PaddingTop(6).Element(c => ComposeSummary(c, model));
                    col.Item().PaddingTop(8).Element(c => ComposeIssueTable(c, model));
                });

                page.Footer().PaddingTop(4).Element(c => ComposeFooter(c, model));
            });
        }).GeneratePdf();
    }

    private static void ComposeTitleBand(IContainer container, CogsReportPdfModel model)
    {
        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().AlignLeft().AlignMiddle()
                    .Text(FormatDate(model.GeneratedAt)).Style(Regular(10));

                row.AutoItem().AlignRight().AlignMiddle()
                    .Text(model.ReportTitle).Style(Bold(15).FontColor(TitleAccentColor));
            });

            col.Item().PaddingTop(4).Element(c =>
                PdfMixedScriptText.RenderReportSubtitle(c, model.FilterSubtitle,
                    Regular(8.5f).FontColor(TitleAccentColor)));

            col.Item().PaddingTop(4).LineHorizontal(2f).LineColor(TitleAccentColor);
        });
    }

    private static void ComposeSummary(IContainer container, CogsReportPdfModel model)
    {
        container.AlignRight().Column(col =>
        {
            col.Item().Element(c => PdfMixedScriptText.RenderReportSubtitle(c,
                $"מלאי פתיחה: {PdfReportFormat.IlsFromFormatted(model.OpeningInventoryIls)}  |  רכישות: {PdfReportFormat.IlsFromFormatted(model.PurchasesToInventoryIls)}  |  מלאי סגירה: {PdfReportFormat.IlsFromFormatted(model.ClosingInventoryIls)}",
                Bold(8f)));
            col.Item().PaddingTop(2).Element(c => PdfMixedScriptText.RenderReportSubtitle(c,
                $"COGS (נוסחה): {PdfReportFormat.IlsFromFormatted(model.CogsByFormulaIls)}  |  COGS (H-): {PdfReportFormat.IlsFromFormatted(model.CogsFromIssuesIls)}",
                Bold(8f)));
        });
    }

    private static void ComposeIssueTable(IContainer container, CogsReportPdfModel model)
    {
        if (model.IssueLines.Count == 0)
        {
            container.AlignRight().Text("אין הוצאות לתצוגה").Style(Regular(10));
            return;
        }

        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(42);   // עלות
                columns.ConstantColumn(96);   // הערות — «40051 (BOM FG-00180)»
                columns.ConstantColumn(24);   // כמות
                columns.RelativeColumn(1);    // שם — всё свободное место
                columns.ConstantColumn(48);   // מק"ט
                columns.ConstantColumn(52);   // תאריך — dd/MM/yyyy
                columns.ConstantColumn(22);   // מס'
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "עלות", compact: true);
                ColumnHeaderCell(header.Cell(), "הערות", compact: true);
                ColumnHeaderCell(header.Cell(), "כמות", compact: true);
                ColumnHeaderCell(header.Cell(), "שם");
                ColumnHeaderCell(header.Cell(), "מק\"ט", compact: true);
                ColumnHeaderCell(header.Cell(), "תאריך", compact: true);
                ColumnHeaderCell(header.Cell(), "מס'", compact: true);
            });

            var rowIndex = 0;
            foreach (var line in model.IssueLines)
            {
                var zebra = rowIndex % 2 == 1;
                DataCell(table.Cell(), line.TotalCostIls, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.Notes, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.Quantity, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.ProductName, zebra, mixedScript: true);
                DataCell(table.Cell(), line.ArticleCode, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.MovementDate, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true, compact: true);
                rowIndex++;
            }
        });
    }

    private static void ComposeFooter(IContainer container, CogsReportPdfModel model)
    {
        container.AlignCenter().Text(text =>
        {
            text.Span("עמוד ").Style(Regular(8));
            text.CurrentPageNumber().Style(Regular(8));
            text.Span(" מתוך ").Style(Regular(8));
            text.TotalPages().Style(Regular(8));
            text.Span($" | {model.FooterLabel} | {FormatDate(model.GeneratedAt)}").Style(Regular(8));
        });
    }

    private static IContainer TableCellBorder(IContainer cell) =>
        cell.Border(0.5f).BorderColor(TableBorderColor);

    private static void ColumnHeaderCell(IContainer cell, string text, bool compact = false)
    {
        var fontSize = compact ? 7f : 8f;
        TableCellBorder(cell).Background(TableHeaderBg)
            .PaddingVertical(2).PaddingHorizontal(2)
            .AlignCenter().Text(text).Style(Bold(fontSize));
    }

    private static void DataCell(
        IContainer cell,
        string text,
        bool altRow,
        bool alignCenter = false,
        bool alignLeft = false,
        bool compact = false,
        bool mixedScript = false)
    {
        var bg = altRow ? TableRowAltBg : TableRowBg;
        var fontSize = compact ? 7f : 8f;
        var c = TableCellBorder(cell).Background(bg)
            .PaddingVertical(2).PaddingHorizontal(2);
        if (mixedScript)
        {
            PdfMixedScriptText.Render(c, text, fontSize, alignCenter);
            return;
        }

        if (alignLeft)
            c.AlignLeft().Text(text).Style(Regular(fontSize));
        else if (alignCenter)
            c.AlignCenter().Text(text).Style(Regular(fontSize));
        else
            c.AlignRight().Text(text).Style(Regular(fontSize));
    }

    private static TextStyle Regular(float size) =>
        TextStyle.Default.FontFamily(FontRegular).FontSize(size);

    private static TextStyle Bold(float size) =>
        TextStyle.Default.FontFamily(FontBold).FontSize(size);

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
}
