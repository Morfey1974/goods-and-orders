using System.Globalization;
using OrderManagement.Api.Services;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

public static class WarehouseReportPdfRenderer
{
    private const string FontRegular = "Noto Sans Hebrew";
    private const string FontBold = "Noto Sans Hebrew Bold";
    private static bool _fontsRegistered;

    private static readonly string TitleAccentColor = "#3d4f5f";
    private static readonly string TableBorderColor = "#b0b8bf";
    private static readonly string TableHeaderBg = "#e8ecef";
    private static readonly string TableRowAltBg = "#f3f5f7";
    private static readonly string TableRowBg = "#FFFFFF";
    private static readonly string GroupHeaderBg = "#c5d4dc";

    static WarehouseReportPdfRenderer()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        RegisterFonts();
    }

    private static void RegisterFonts()
    {
        if (_fontsRegistered) return;
        RegisterFontFile("NotoSansHebrew-Regular.ttf", FontRegular);
        RegisterFontFile("NotoSansHebrew-Bold.ttf", FontBold);
        _fontsRegistered = true;
    }

    private static void RegisterFontFile(string fileName, string family)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Assets", "Fonts", fileName);
        if (!File.Exists(path)) return;
        using var stream = File.OpenRead(path);
        FontManager.RegisterFontWithCustomName(family, stream);
    }

    public static byte[] Render(WarehouseReportPdfModel model)
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
                    col.Item().PaddingTop(14).Element(c =>
                    {
                        if (model.Kind == WarehouseReportKind.Balances)
                            ComposeBalanceGroups(c, model);
                        else
                            ComposeMovementGroups(c, model);
                    });
                });

                page.Footer().PaddingTop(8).Element(c => ComposeFooter(c, model));
            });
        }).GeneratePdf();
    }

    private static void ComposeTitleBand(IContainer container, WarehouseReportPdfModel model)
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

            if (!string.IsNullOrWhiteSpace(model.FilterSubtitle))
            {
                col.Item().PaddingTop(6).AlignRight()
                    .Text(model.FilterSubtitle).Style(Regular(10).FontColor(TitleAccentColor));
            }

            col.Item().PaddingTop(6).LineHorizontal(2.5f).LineColor(TitleAccentColor);
        });
    }

    private static void ComposeBalanceGroups(IContainer container, WarehouseReportPdfModel model)
    {
        if (model.BalanceGroups.Count == 0)
        {
            container.AlignRight().Text("אין נתונים לתצוגה").Style(Regular(11));
            return;
        }

        container.Column(col =>
        {
            col.Spacing(14);
            foreach (var group in model.BalanceGroups)
            {
                col.Item().Element(c => ComposeBalanceGroup(c, group));
            }
        });
    }

    private static void ComposeBalanceGroup(IContainer container, WarehouseBalanceGroupModel group)
    {
        container.Column(col =>
        {
            col.Item().Background(GroupHeaderBg)
                .Border(0.5f).BorderColor(TableBorderColor)
                .PaddingVertical(7).PaddingHorizontal(8)
                .AlignRight()
                .Text(group.WarehouseName).Style(Bold(11).FontColor(TitleAccentColor));

            col.Item().Element(c => ComposeBalanceTable(c, group.Lines));
        });
    }

    private static void ComposeBalanceTable(IContainer container, IReadOnlyList<WarehouseBalanceLineModel> lines)
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
                columns.ConstantColumn(40);      // כמות
                columns.ConstantColumn(34);      // סוג
                columns.RelativeColumn(5);       // שם פריט
                columns.ConstantColumn(88);      // מק"ט
                columns.ConstantColumn(30);      // מס'
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "כמות", compact: true);
                ColumnHeaderCell(header.Cell(), "סוג", compact: true);
                ColumnHeaderCell(header.Cell(), "שם פריט");
                ColumnHeaderCell(header.Cell(), "מק\"ט");
                ColumnHeaderCell(header.Cell(), "מס'", compact: true);
            });

            var rowIndex = 0;
            foreach (var line in lines)
            {
                var zebra = rowIndex % 2 == 1;
                DataCell(table.Cell(), FormatQuantity(line.Quantity), zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.ProductTypeLabel, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.ProductName, zebra);
                DataCell(table.Cell(), line.ArticleCode, zebra, alignCenter: true);
                DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true, compact: true);
                rowIndex++;
            }
        });
    }

    private static void ComposeMovementGroups(IContainer container, WarehouseReportPdfModel model)
    {
        if (model.MovementGroups.Count == 0)
        {
            container.AlignRight().Text("אין נתונים לתצוגה").Style(Regular(11));
            return;
        }

        container.Column(col =>
        {
            col.Spacing(14);
            foreach (var group in model.MovementGroups)
            {
                col.Item().Element(c => ComposeMovementGroup(c, group));
            }
        });
    }

    private static void ComposeMovementGroup(IContainer container, WarehouseMovementGroupModel group)
    {
        container.Column(col =>
        {
            col.Item().Background(GroupHeaderBg)
                .Border(0.5f).BorderColor(TableBorderColor)
                .PaddingVertical(7).PaddingHorizontal(8)
                .AlignRight()
                .Text(group.WarehouseName).Style(Bold(11).FontColor(TitleAccentColor));

            col.Item().Element(c => ComposeMovementTable(c, group.Lines));
        });
    }

    private static void ComposeMovementTable(IContainer container, IReadOnlyList<WarehouseMovementLineModel> lines)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(3);       // הערות
                columns.ConstantColumn(34);      // יתרה
                columns.ConstantColumn(34);      // כמות
                columns.ConstantColumn(32);      // סוג
                columns.RelativeColumn(4);       // שם פריט
                columns.ConstantColumn(90);      // מק"ט
                columns.ConstantColumn(68);      // תאריך
                columns.ConstantColumn(30);      // מס'
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "הערות");
                ColumnHeaderCell(header.Cell(), "יתרה", compact: true);
                ColumnHeaderCell(header.Cell(), "כמות", compact: true);
                ColumnHeaderCell(header.Cell(), "סוג", compact: true);
                ColumnHeaderCell(header.Cell(), "שם פריט");
                ColumnHeaderCell(header.Cell(), "מק\"ט");
                ColumnHeaderCell(header.Cell(), "תאריך", compact: true);
                ColumnHeaderCell(header.Cell(), "מס'", compact: true);
            });

            var rowIndex = 0;
            foreach (var line in lines)
            {
                var zebra = rowIndex % 2 == 1;
                DataCell(table.Cell(), line.Notes ?? "—", zebra);
                DataCell(table.Cell(), FormatQuantity(line.BalanceAfter), zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), FormatQuantity(line.Quantity), zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.MovementTypeLabel, zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.ProductName, zebra);
                DataCell(table.Cell(), line.ArticleCode, zebra, alignCenter: true);
                DataCell(table.Cell(), FormatDateTime(line.CreatedAt), zebra, alignCenter: true, compact: true);
                DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true, compact: true);
                rowIndex++;
            }
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

    private static void DataCell(IContainer cell, string text, bool altRow, bool alignCenter = false, bool compact = false)
    {
        var bg = altRow ? TableRowAltBg : TableRowBg;
        var fontSize = compact ? 8f : 9f;
        var c = TableCellBorder(cell).Background(bg)
            .PaddingVertical(compact ? 5 : 6)
            .PaddingHorizontal(compact ? 3 : 5);
        if (alignCenter)
            c.AlignCenter().Text(text).Style(Regular(fontSize));
        else
            c.AlignRight().Text(text).Style(Regular(fontSize));
    }

    private static void ComposeFooter(IContainer container, WarehouseReportPdfModel model)
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

    private static TextStyle Regular(float size) =>
        TextStyle.Default.FontFamily(FontRegular).FontSize(size);

    private static TextStyle Bold(float size) =>
        TextStyle.Default.FontFamily(FontBold).FontSize(size);

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private static string FormatDateTime(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);

    private static string FormatQuantity(decimal qty) => StockQuantity.Format(qty);
}

internal static class PdfLetterheadRenderer
{
    private const string FontRegular = "Noto Sans Hebrew";
    private const string FontBold = "Noto Sans Hebrew Bold";
    private const float LogoWidth = 216f;
    private const float LogoHeight = 160f;

    public static void Compose(IContainer container, TenantPdfLetterheadModel model)
    {
        container.Row(row =>
        {
            if (!string.IsNullOrEmpty(model.LogoFilePath) && File.Exists(model.LogoFilePath))
                row.ConstantItem(LogoWidth).Height(LogoHeight).AlignLeft().AlignTop()
                    .Image(model.LogoFilePath).FitArea();
            else
                row.ConstantItem(LogoWidth);

            row.RelativeItem().AlignRight().AlignTop().Element(c => ComposePartyBlock(c, model));
        });
    }

    private static void ComposePartyBlock(IContainer container, TenantPdfLetterheadModel model)
    {
        container.Column(col =>
        {
            col.Spacing(2);
            col.Item().AlignRight().Text(model.SupplierName).Style(Bold(22));

            if (!string.IsNullOrWhiteSpace(model.SupplierTagline))
                col.Item().AlignRight().Text(model.SupplierTagline).Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(model.SupplierAddress))
                col.Item().AlignRight().Text(model.SupplierAddress).Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(model.SupplierTaxLine))
                col.Item().AlignRight().Text(model.SupplierTaxLine).Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(model.SupplierMobile))
                col.Item().AlignRight().Text($"{model.SupplierMobile} : נייד").Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(model.SupplierEmail))
                col.Item().AlignRight().Text($"{model.SupplierEmail} : אימייל").Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(model.SupplierWebsite))
                col.Item().AlignRight().Text($"{model.SupplierWebsite} : אתר").Style(Regular(10));
        });
    }

    private static TextStyle Regular(float size) =>
        TextStyle.Default.FontFamily(FontRegular).FontSize(size);

    private static TextStyle Bold(float size) =>
        TextStyle.Default.FontFamily(FontBold).FontSize(size);
}
