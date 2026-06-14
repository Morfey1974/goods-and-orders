using System.Globalization;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

public static class OperatingExpensesReportPdfRenderer
{
    private const string FontRegular = PdfFontRegistry.HebrewRegular;
    private const string FontBold = PdfFontRegistry.HebrewBold;
    private static bool _fontsRegistered;

    private static readonly string TitleAccentColor = "#3d4f5f";
    private static readonly string TableBorderColor = "#b0b8bf";
    private static readonly string TableHeaderBg = "#e8ecef";
    private static readonly string TableRowAltBg = "#f3f5f7";
    private static readonly string TableRowBg = "#FFFFFF";

    static OperatingExpensesReportPdfRenderer()
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

    public static byte[] Render(OperatingExpensesReportPdfModel model)
    {
        RegisterFonts();
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.MarginHorizontal(32);
                page.MarginTop(28);
                page.MarginBottom(32);
                page.DefaultTextStyle(Regular(9));

                page.Content().Column(col =>
                {
                    col.Item().Element(c => PdfLetterheadRenderer.Compose(c, model.Letterhead));
                    col.Item().PaddingTop(18).Element(c => ComposeTitleBand(c, model));
                    col.Item().PaddingTop(12).Element(ComposeExpenseTable);
                    if (model.DepreciationLines.Count > 0)
                    {
                        col.Item().PaddingTop(16).AlignRight()
                            .Text("פחת לפי נכס").Style(Bold(10).FontColor(TitleAccentColor));
                        col.Item().PaddingTop(6).Element(ComposeDepreciationTable);
                    }
                    col.Item().PaddingTop(10).Element(ComposeSummary);
                });

                page.Footer().PaddingTop(6).Element(c => ComposeFooter(c, model));
            });
        }).GeneratePdf();

        void ComposeExpenseTable(IContainer container)
        {
            if (model.ExpenseLines.Count == 0)
            {
                container.AlignRight().Text("אין הוצאות לתצוגה").Style(Regular(10));
                return;
            }

            container.Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(58);
                    columns.ConstantColumn(58);
                    columns.RelativeColumn(4);
                    columns.RelativeColumn(2);
                    columns.ConstantColumn(58);
                    columns.ConstantColumn(26);
                });

                table.Header(header =>
                {
                    ColumnHeaderCell(header.Cell(), "לזיכוי", compact: true);
                    ColumnHeaderCell(header.Cell(), "סכום", compact: true);
                    ColumnHeaderCell(header.Cell(), "הערות");
                    ColumnHeaderCell(header.Cell(), "סוג");
                    ColumnHeaderCell(header.Cell(), "תאריך", compact: true);
                    ColumnHeaderCell(header.Cell(), "מס'", compact: true);
                });

                var rowIndex = 0;
                foreach (var line in model.ExpenseLines)
                {
                    var zebra = rowIndex % 2 == 1;
                    DataCell(table.Cell(), line.RecognizedIls, zebra, alignCenter: true, compact: true);
                    DataCell(table.Cell(), line.AmountIls, zebra, alignCenter: true, compact: true);
                    DataCell(table.Cell(), line.Notes, zebra, mixedScript: true);
                    DataCell(table.Cell(), line.ExpenseType, zebra, mixedScript: true);
                    DataCell(table.Cell(), line.ExpenseDate, zebra, alignCenter: true, compact: true);
                    DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true, compact: true);
                    rowIndex++;
                }
            });
        }

        void ComposeDepreciationTable(IContainer container)
        {
            container.Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(58);
                    columns.ConstantColumn(58);
                    columns.RelativeColumn(2);
                    columns.RelativeColumn(4);
                    columns.ConstantColumn(26);
                });

                table.Header(header =>
                {
                    ColumnHeaderCell(header.Cell(), "לתקופה", compact: true);
                    ColumnHeaderCell(header.Cell(), "שנתי", compact: true);
                    ColumnHeaderCell(header.Cell(), "קטגוריה");
                    ColumnHeaderCell(header.Cell(), "נכס");
                    ColumnHeaderCell(header.Cell(), "מס'", compact: true);
                });

                var rowIndex = 0;
                foreach (var line in model.DepreciationLines)
                {
                    var zebra = rowIndex % 2 == 1;
                    DataCell(table.Cell(), line.PeriodDepreciationIls, zebra, alignCenter: true, compact: true);
                    DataCell(table.Cell(), line.AnnualDepreciationIls, zebra, alignCenter: true, compact: true);
                    DataCell(table.Cell(), line.Category, zebra, mixedScript: true);
                    DataCell(table.Cell(), line.Name, zebra, mixedScript: true);
                    DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true, compact: true);
                    rowIndex++;
                }
            });
        }

        void ComposeSummary(IContainer container)
        {
            container.AlignRight().Column(col =>
            {
                col.Item().Element(c => PdfMixedScriptText.RenderReportSubtitle(c,
                    $"בית (מעורב): {PdfReportFormat.Ils(model.HomeMixedTotalIls)} → {PdfReportFormat.Ils(model.HomeMixedRecognizedIls)}",
                    Regular(10).FontColor(TitleAccentColor)));
                col.Item().PaddingTop(2).Element(c => PdfMixedScriptText.RenderReportSubtitle(c,
                    $"הוצאות ישירות: {PdfReportFormat.Ils(model.OperatingDirectTotalIls)}",
                    Regular(10).FontColor(TitleAccentColor)));
                col.Item().PaddingTop(2).Element(c => PdfMixedScriptText.RenderReportSubtitle(c,
                    $"פחת: {PdfReportFormat.Ils(model.DepreciationIls)}",
                    Regular(10).FontColor(TitleAccentColor)));
                col.Item().PaddingTop(4).Element(c => PdfMixedScriptText.RenderReportSubtitle(c,
                    $"סה\"כ לזיכוי: {PdfReportFormat.Ils(model.GrandTotalRecognizedIls)}",
                    Bold(11).FontColor(TitleAccentColor)));
            });
        }
    }

    private static void ComposeTitleBand(IContainer container, OperatingExpensesReportPdfModel model)
    {
        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().AlignLeft().AlignMiddle()
                    .Text(FormatDate(model.GeneratedAt)).Style(Regular(10));

                row.AutoItem().AlignRight().AlignMiddle()
                    .Text(model.ReportTitle).Style(Bold(18).FontColor(TitleAccentColor));
            });

            col.Item().PaddingTop(5).Element(c =>
                PdfMixedScriptText.RenderReportSubtitle(c, model.FilterSubtitle,
                    Regular(9).FontColor(TitleAccentColor)));

            col.Item().PaddingTop(5).LineHorizontal(2f).LineColor(TitleAccentColor);
        });
    }

    private static void ComposeFooter(IContainer container, OperatingExpensesReportPdfModel model)
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
        var fontSize = compact ? 7.5f : 8.5f;
        TableCellBorder(cell).Background(TableHeaderBg)
            .PaddingVertical(4).PaddingHorizontal(3)
            .AlignCenter().Text(text).Style(Bold(fontSize));
    }

    private static void DataCell(
        IContainer cell,
        string text,
        bool altRow,
        bool alignCenter = false,
        bool compact = false,
        bool mixedScript = false)
    {
        var bg = altRow ? TableRowAltBg : TableRowBg;
        var fontSize = compact ? 7.5f : 8.5f;
        var c = TableCellBorder(cell).Background(bg)
            .PaddingVertical(4).PaddingHorizontal(3);
        if (mixedScript)
        {
            PdfMixedScriptText.Render(c, text, fontSize, alignCenter);
            return;
        }

        if (alignCenter)
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

    private static string FormatMoney(decimal value) =>
        value.ToString("N2", CultureInfo.InvariantCulture);
}
