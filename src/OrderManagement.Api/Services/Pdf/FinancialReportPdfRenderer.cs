using System.Globalization;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

public static class FinancialReportPdfRenderer
{
    private const string FontRegular = PdfFontRegistry.HebrewRegular;
    private const string FontBold = PdfFontRegistry.HebrewBold;
    private static bool _fontsRegistered;

    private static readonly string TitleAccentColor = "#3d4f5f";
    private static readonly string TableBorderColor = "#b0b8bf";
    private static readonly string TableHeaderBg = "#e8ecef";
    private static readonly string TableRowAltBg = "#f3f5f7";
    private static readonly string TableRowBg = "#FFFFFF";

    static FinancialReportPdfRenderer()
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

    public static byte[] Render(FinancialReportPdfModel model)
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
                    col.Item().PaddingTop(12).Element(c =>
                    {
                        if (model.Kind == FinancialReportPdfKind.Income)
                            ComposeIncomeTable(c, model);
                        else
                            ComposeExpenseTable(c, model);
                    });
                    col.Item().PaddingTop(10).Element(c => ComposeGrandTotal(c, model));
                });

                page.Footer().PaddingTop(6).Element(c => ComposeFooter(c, model));
            });
        }).GeneratePdf();
    }

    private static void ComposeTitleBand(IContainer container, FinancialReportPdfModel model)
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

    private static void ComposeIncomeTable(IContainer container, FinancialReportPdfModel model)
    {
        if (model.IncomeLines.Count == 0)
        {
            container.AlignRight().Text("אין נתונים לתצוגה").Style(Regular(10));
            return;
        }

        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(52);   // סכום ₪
                columns.ConstantColumn(52);   // סכום
                columns.RelativeColumn(2);    // פירוט
                columns.ConstantColumn(72);   // סוג תשלום
                columns.RelativeColumn(3);    // לקוח
                columns.ConstantColumn(58);   // תאריך קבלה
                columns.ConstantColumn(52);   // מס' קבלה
                columns.ConstantColumn(58);   // תאריך תשלום
                columns.ConstantColumn(26);   // מס'
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "סכום ₪", compact: true);
                ColumnHeaderCell(header.Cell(), "סכום", compact: true);
                ColumnHeaderCell(header.Cell(), "פירוט");
                ColumnHeaderCell(header.Cell(), "סוג תשלום", compact: true);
                ColumnHeaderCell(header.Cell(), "לקוח");
                ColumnHeaderCell(header.Cell(), "תאריך קבלה", compact: true);
                ColumnHeaderCell(header.Cell(), "קבלה", compact: true);
                ColumnHeaderCell(header.Cell(), "תאריך תשלום", compact: true);
                ColumnHeaderCell(header.Cell(), "מס'", compact: true);
            });

            var rowIndex = 0;
            foreach (var line in model.IncomeLines)
            {
                var zebra = rowIndex % 2 == 1;
                DataCell(table.Cell(), line.AmountIls, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.Amount, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.Detail, zebra, mixedScript: true);
                DataCell(table.Cell(), line.PaymentType, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.CustomerName, zebra, mixedScript: true);
                DataCell(table.Cell(), line.ReceiptDate, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.DocumentNumber, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.PaymentDate, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true, compact: true);
                rowIndex++;
            }
        });
    }

    private static void ComposeExpenseTable(IContainer container, FinancialReportPdfModel model)
    {
        if (model.ExpenseLines.Count == 0)
        {
            container.AlignRight().Text("אין נתונים לתצוגה").Style(Regular(10));
            return;
        }

        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(58);   // סכום ₪
                columns.ConstantColumn(58);   // סכום מקור
                columns.RelativeColumn(2);    // חשבונית
                columns.RelativeColumn(4);    // ספק
                columns.ConstantColumn(52);   // מס' תעודה
                columns.ConstantColumn(58);   // תאריך
                columns.ConstantColumn(26);   // מס'
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "סכום ₪", compact: true);
                ColumnHeaderCell(header.Cell(), "סכום", compact: true);
                ColumnHeaderCell(header.Cell(), "חשבונית ספק");
                ColumnHeaderCell(header.Cell(), "ספק");
                ColumnHeaderCell(header.Cell(), "תעודה", compact: true);
                ColumnHeaderCell(header.Cell(), "תאריך", compact: true);
                ColumnHeaderCell(header.Cell(), "מס'", compact: true);
            });

            var rowIndex = 0;
            foreach (var line in model.ExpenseLines)
            {
                var zebra = rowIndex % 2 == 1;
                DataCell(table.Cell(), line.AmountIls, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.AmountOriginal, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.SupplierInvoiceNumber, zebra, mixedScript: true);
                DataCell(table.Cell(), line.SupplierName, zebra, mixedScript: true);
                DataCell(table.Cell(), line.ReceiptNumber, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.DocumentDate, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true, compact: true);
                rowIndex++;
            }
        });
    }

    private static void ComposeGrandTotal(IContainer container, FinancialReportPdfModel model)
    {
        container.AlignRight().Text($"סה\"כ: {FormatMoney(model.GrandTotalIls)} ₪")
            .Style(Bold(11).FontColor(TitleAccentColor));
    }

    private static void ComposeFooter(IContainer container, FinancialReportPdfModel model)
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
