using System.Globalization;
using OrderManagement.Api.Services;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

public static class InventoryValuationPdfRenderer
{
    private const string FontRegular = PdfFontRegistry.HebrewRegular;
    private const string FontBold = PdfFontRegistry.HebrewBold;
    private static bool _fontsRegistered;

    private static readonly string TitleAccentColor = "#3d4f5f";
    private static readonly string TableBorderColor = "#b0b8bf";
    private static readonly string TableHeaderBg = "#e8ecef";
    private static readonly string TableRowAltBg = "#f3f5f7";
    private static readonly string TableRowBg = "#FFFFFF";
    private static readonly string GroupHeaderBg = "#c5d4dc";

    static InventoryValuationPdfRenderer()
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

    public static byte[] Render(InventoryValuationPdfModel model)
    {
        RegisterFonts();
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginHorizontal(40);
                page.MarginTop(32);
                page.MarginBottom(36);
                page.DefaultTextStyle(Regular(10));

                page.Content().Column(col =>
                {
                    col.Item().Element(c => PdfLetterheadRenderer.Compose(c, model.Letterhead));
                    col.Item().PaddingTop(22).Element(c => ComposeTitleBand(c, model));
                    col.Item().PaddingTop(14).Element(c => ComposeGroups(c, model));
                });

                page.Footer().PaddingTop(8).Element(c => ComposeFooter(c, model));
            });
        }).GeneratePdf();
    }

    private static void ComposeTitleBand(IContainer container, InventoryValuationPdfModel model)
    {
        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().AlignLeft().AlignMiddle()
                    .Text(FormatDate(model.GeneratedAt)).Style(Regular(11));

                row.AutoItem().AlignRight().AlignMiddle()
                    .Text(model.ReportTitle).Style(Bold(20).FontColor(TitleAccentColor));
            });

            col.Item().PaddingTop(6).Element(c =>
                PdfMixedScriptText.RenderReportSubtitle(c, model.FilterSubtitle,
                    Regular(10).FontColor(TitleAccentColor)));

            col.Item().PaddingTop(6).LineHorizontal(2.5f).LineColor(TitleAccentColor);
        });
    }

    private static void ComposeGroups(IContainer container, InventoryValuationPdfModel model)
    {
        if (model.Groups.Count == 0)
        {
            container.AlignRight().Text("אין נתונים לתצוגה").Style(Regular(11));
            return;
        }

        container.Column(col =>
        {
            col.Spacing(14);
            foreach (var group in model.Groups)
                col.Item().Element(c => ComposeGroup(c, group, model.Detailed));
        });
    }

    private static void ComposeGroup(IContainer container, InventoryValuationGroupModel group, bool detailed)
    {
        container.Column(col =>
        {
            col.Item().Background(GroupHeaderBg)
                .Border(0.5f).BorderColor(TableBorderColor)
                .PaddingVertical(7).PaddingHorizontal(8)
                .AlignRight()
                .Text(group.WarehouseName).Style(Bold(11).FontColor(TitleAccentColor));

            col.Item().Element(c => ComposeTable(c, group.Lines, detailed));
        });
    }

    private static void ComposeTable(IContainer container, IReadOnlyList<InventoryValuationLineModel> lines, bool detailed)
    {
        if (lines.Count == 0)
        {
            container
                .Border(0.5f).BorderColor(TableBorderColor)
                .Background(TableRowBg)
                .PaddingVertical(10).PaddingHorizontal(8)
                .AlignRight()
                .Text("אין פריטים במלאי").Style(Regular(10));
            return;
        }

        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(58);      // סכום
                columns.ConstantColumn(52);      // עלות יח'
                columns.ConstantColumn(40);      // כמות
                if (detailed)
                {
                    columns.RelativeColumn(2);   // מקור
                    columns.ConstantColumn(62);  // תאריך קליטה
                }
                columns.RelativeColumn(4);       // שם פריט
                columns.ConstantColumn(88);      // מק"ט
                columns.ConstantColumn(30);      // מס'
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "סכום ₪", compact: true);
                ColumnHeaderCell(header.Cell(), "עלות יח'", compact: true);
                ColumnHeaderCell(header.Cell(), "כמות", compact: true);
                if (detailed)
                {
                    ColumnHeaderCell(header.Cell(), "מקור");
                    ColumnHeaderCell(header.Cell(), "תאריך קליטה", compact: true);
                }
                ColumnHeaderCell(header.Cell(), "שם פריט");
                ColumnHeaderCell(header.Cell(), "מק\"ט");
                ColumnHeaderCell(header.Cell(), "מס'", compact: true);
            });

            var rowIndex = 0;
            foreach (var line in lines)
            {
                var zebra = rowIndex % 2 == 1;
                DataCell(table.Cell(), FormatMoney(line.TotalValueIls), zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), FormatMoney(line.UnitCostIls), zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), FormatQuantity(line.Quantity), zebra, alignCenter: true, compact: true);
                if (detailed)
                {
                    DataCell(table.Cell(), line.SourceLabel ?? "—", zebra, mixedScript: true);
                    DataCell(table.Cell(), line.ReceivedAtLabel ?? "—", zebra, alignCenter: true, compact: true);
                }
                DataCell(table.Cell(), line.ProductName, zebra, mixedScript: true);
                DataCell(table.Cell(), line.ArticleCode, zebra, alignCenter: true);
                DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true, compact: true);
                rowIndex++;
            }
        });
    }

    private static void ComposeFooter(IContainer container, InventoryValuationPdfModel model)
    {
        container.AlignCenter().Text(text =>
        {
            text.Span("עמוד ").Style(Regular(9));
            text.CurrentPageNumber().Style(Regular(9));
            text.Span(" מתוך ").Style(Regular(9));
            text.TotalPages().Style(Regular(9));
            text.Span($" | {model.FooterLabel} | {FormatDate(model.GeneratedAt)}").Style(Regular(9));
        });
    }

    private static IContainer TableCellBorder(IContainer cell) =>
        cell.Border(0.5f).BorderColor(TableBorderColor);

    private static void ColumnHeaderCell(IContainer cell, string text, bool compact = false)
    {
        var fontSize = compact ? 8f : 9f;
        TableCellBorder(cell).Background(TableHeaderBg)
            .PaddingVertical(compact ? 5 : 6).PaddingHorizontal(compact ? 3 : 5)
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
        var fontSize = compact ? 8f : 9f;
        var c = TableCellBorder(cell).Background(bg)
            .PaddingVertical(compact ? 5 : 6)
            .PaddingHorizontal(compact ? 3 : 5);
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

    private static string FormatQuantity(decimal qty) => StockQuantity.Format(qty);
}
