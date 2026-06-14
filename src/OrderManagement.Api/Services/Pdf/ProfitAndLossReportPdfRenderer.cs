using System.Globalization;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

public static class ProfitAndLossReportPdfRenderer
{
    private const string FontRegular = PdfFontRegistry.HebrewRegular;
    private const string FontBold = PdfFontRegistry.HebrewBold;
    private static bool _fontsRegistered;

    private static readonly string TitleAccentColor = "#3d4f5f";
    private static readonly string TableBorderColor = "#b0b8bf";
    private static readonly string TableHeaderBg = "#e8ecef";
    private static readonly string TableRowAltBg = "#f3f5f7";
    private static readonly string TableRowBg = "#FFFFFF";

    static ProfitAndLossReportPdfRenderer()
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

    public static byte[] Render(ProfitAndLossReportPdfModel model)
    {
        RegisterFonts();
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginHorizontal(40);
                page.MarginTop(28);
                page.MarginBottom(32);
                page.DefaultTextStyle(Regular(10));

                page.Content().Column(col =>
                {
                    col.Item().Element(c => PdfLetterheadRenderer.Compose(c, model.Letterhead));
                    col.Item().PaddingTop(18).Element(c => ComposeTitleBand(c, model));
                    col.Item().PaddingTop(14).Element(c => ComposeSummaryTable(c, model));
                    if (model.CategoryLines.Count > 0)
                    {
                        col.Item().PaddingTop(18).AlignRight()
                            .Text("הוצאות תפעוליות לפי קטגוריה").Style(Bold(11).FontColor(TitleAccentColor));
                        col.Item().PaddingTop(8).Element(c => ComposeCategoryTable(c, model));
                    }
                });

                page.Footer().PaddingTop(6).Element(c => ComposeFooter(c, model));
            });
        }).GeneratePdf();
    }

    private static void ComposeTitleBand(IContainer container, ProfitAndLossReportPdfModel model)
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
            col.Item().PaddingTop(3).Element(c =>
                PdfMixedScriptText.RenderReportSubtitle(c, model.CogsMethodLabel,
                    Regular(9).FontColor(TitleAccentColor)));
            col.Item().PaddingTop(5).LineHorizontal(2f).LineColor(TitleAccentColor);
        });
    }

    private static void ComposeSummaryTable(IContainer container, ProfitAndLossReportPdfModel model)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(3);
                columns.ConstantColumn(90);
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "סכום ₪");
                ColumnHeaderCell(header.Cell(), "סעיף");
            });

            var rowIndex = 0;
            foreach (var line in model.SummaryLines)
            {
                if (line.IsSectionHeader)
                {
                    SectionHeaderCell(table.Cell().ColumnSpan(2), line.Label);
                    continue;
                }

                var zebra = rowIndex % 2 == 1;
                var style = line.IsTotal ? Bold(10) : Regular(10);
                DataCell(table.Cell(), line.AmountIls, zebra, style, alignCenter: true);
                DataCell(table.Cell(), line.Label, zebra, style);
                rowIndex++;
            }
        });
    }

    private static void ComposeCategoryTable(IContainer container, ProfitAndLossReportPdfModel model)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(3);
                columns.ConstantColumn(90);
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "סכום ₪");
                ColumnHeaderCell(header.Cell(), "קטגוריה");
            });

            var rowIndex = 0;
            foreach (var line in model.CategoryLines)
            {
                var zebra = rowIndex % 2 == 1;
                DataCell(table.Cell(), line.AmountIls, zebra, Regular(9), alignCenter: true);
                DataCell(table.Cell(), line.Category, zebra, Regular(9));
                rowIndex++;
            }
        });
    }

    private static void ComposeFooter(IContainer container, ProfitAndLossReportPdfModel model)
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

    private static void ColumnHeaderCell(IContainer cell, string text)
    {
        TableCellBorder(cell).Background(TableHeaderBg)
            .PaddingVertical(5).PaddingHorizontal(6)
            .AlignCenter().Text(text).Style(Bold(9));
    }

    private static void SectionHeaderCell(IContainer cell, string text)
    {
        TableCellBorder(cell).Background(TableHeaderBg)
            .PaddingVertical(6).PaddingHorizontal(6)
            .AlignRight().Text(text).Style(Bold(10));
    }

    private static void DataCell(
        IContainer cell,
        string text,
        bool altRow,
        TextStyle style,
        bool alignCenter = false)
    {
        var bg = altRow ? TableRowAltBg : TableRowBg;
        var c = TableCellBorder(cell).Background(bg)
            .PaddingVertical(5).PaddingHorizontal(6);
        if (alignCenter)
            c.AlignCenter().Text(text).Style(style);
        else
            c.AlignRight().Text(text).Style(style);
    }

    private static TextStyle Regular(float size) =>
        TextStyle.Default.FontFamily(FontRegular).FontSize(size);

    private static TextStyle Bold(float size) =>
        TextStyle.Default.FontFamily(FontBold).FontSize(size);

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
}
