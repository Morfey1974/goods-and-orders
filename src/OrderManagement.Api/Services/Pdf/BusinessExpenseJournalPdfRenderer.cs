using System.Globalization;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

public static class BusinessExpenseJournalPdfRenderer
{
    private const string FontRegular = PdfFontRegistry.HebrewRegular;
    private const string FontBold = PdfFontRegistry.HebrewBold;
    private static bool _fontsRegistered;

    private static readonly string TitleAccentColor = "#3d4f5f";
    private static readonly string TableBorderColor = "#b0b8bf";
    private static readonly string TableHeaderBg = "#e8ecef";
    private static readonly string TableRowAltBg = "#f3f5f7";
    private static readonly string TableRowBg = "#FFFFFF";

    static BusinessExpenseJournalPdfRenderer()
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

    public static byte[] Render(BusinessExpenseJournalPdfModel model)
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
                    col.Item().PaddingTop(12).Element(ComposeTable);
                    col.Item().PaddingTop(10).Element(ComposeTotals);
                });

                page.Footer().PaddingTop(6).Element(c => ComposeFooter(c, model));
            });
        }).GeneratePdf();

        void ComposeTable(IContainer container)
        {
            if (model.Lines.Count == 0)
            {
                container.AlignRight().Text("אין נתונים לתצוגה").Style(Regular(10));
                return;
            }

            container.Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(34);
                    columns.ConstantColumn(58);
                    columns.ConstantColumn(58);
                    columns.RelativeColumn(2);
                    columns.RelativeColumn(4);
                    columns.RelativeColumn(3);
                    columns.RelativeColumn(2);
                    columns.ConstantColumn(40);
                    columns.ConstantColumn(26);
                });

                table.Header(header =>
                {
                    ColumnHeaderCell(header.Cell(), "מסמכים", compact: true);
                    ColumnHeaderCell(header.Cell(), "חשבונית");
                    ColumnHeaderCell(header.Cell(), "לזיכוי", compact: true);
                    ColumnHeaderCell(header.Cell(), "סכום", compact: true);
                    ColumnHeaderCell(header.Cell(), "ספק");
                    ColumnHeaderCell(header.Cell(), "הערות");
                    ColumnHeaderCell(header.Cell(), "סוג");
                    ColumnHeaderCell(header.Cell(), "תאריך", compact: true);
                    ColumnHeaderCell(header.Cell(), "מס'", compact: true);
                });

                var rowIndex = 0;
                foreach (var line in model.Lines)
                {
                    var zebra = rowIndex % 2 == 1;
                    DataCell(table.Cell(), line.DocumentCount, zebra, alignCenter: true, compact: true);
                    DataCell(table.Cell(), line.InvoiceReference, zebra, mixedScript: true);
                    DataCell(table.Cell(), line.RecognizedIls, zebra, alignCenter: true, compact: true);
                    DataCell(table.Cell(), line.AmountIls, zebra, alignCenter: true, compact: true);
                    DataCell(table.Cell(), line.VendorName, zebra, mixedScript: true);
                    DataCell(table.Cell(), line.Notes, zebra, mixedScript: true);
                    DataCell(table.Cell(), line.ExpenseType, zebra, mixedScript: true);
                    DataCell(table.Cell(), line.ExpenseDate, zebra, alignCenter: true, compact: true);
                    DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true, compact: true);
                    rowIndex++;
                }
            });
        }

        void ComposeTotals(IContainer container)
        {
            container.AlignRight().Column(col =>
            {
                col.Item().Text($"סה\"כ לזיכוי: {FormatMoney(model.TotalRecognizedIls)} ₪")
                    .Style(Bold(11).FontColor(TitleAccentColor));
                col.Item().PaddingTop(2).Text($"סה\"כ הוצאות: {FormatMoney(model.TotalAmountIls)} ₪")
                    .Style(Regular(10).FontColor(TitleAccentColor));
            });
        }
    }

    private static void ComposeTitleBand(IContainer container, BusinessExpenseJournalPdfModel model)
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
            col.Item().PaddingTop(5).AlignRight()
                .Text(model.FilterSubtitle).Style(Regular(9).FontColor(TitleAccentColor));
            col.Item().PaddingTop(5).LineHorizontal(2f).LineColor(TitleAccentColor);
        });
    }

    private static void ComposeFooter(IContainer container, BusinessExpenseJournalPdfModel model)
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
        bool zebra,
        bool alignCenter = false,
        bool compact = false,
        bool mixedScript = false)
    {
        var fontSize = compact ? 7.5f : 8.5f;
        var bg = zebra ? TableRowAltBg : TableRowBg;
        var container = TableCellBorder(cell).Background(bg).PaddingVertical(3).PaddingHorizontal(3);
        var styled = Regular(fontSize);
        if (mixedScript)
        {
            PdfMixedScriptText.Render(container, text, fontSize, alignCenter);
            return;
        }

        var aligned = alignCenter ? container.AlignCenter() : container.AlignRight();
        aligned.Text(text).Style(styled);
    }

    private static string FormatDate(DateTime value) =>
        value.ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal value) => value.ToString("N2", CultureInfo.InvariantCulture);

    private static TextStyle Regular(float size) => TextStyle.Default.FontFamily(FontRegular).FontSize(size);

    private static TextStyle Bold(float size) => TextStyle.Default.FontFamily(FontBold).FontSize(size);
}
