using System.Globalization;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

/// <summary>Shared layout for הצעת מחיר / חשבון חיוב / קבלה (Yesh / DCM sample).</summary>
public static class BusinessDocumentPdfRenderer
{
    private const string FontRegular = "Noto Sans Hebrew";
    private const string FontBold = "Noto Sans Hebrew Bold";
    private static bool _fontsRegistered;

    private static readonly string TitleAccentColor = "#3d4f5f";
    private static readonly string TableBorderColor = "#b0b8bf";
    private static readonly string TableHeaderBg = "#e8ecef";
    private static readonly string TableRowAltBg = "#f3f5f7";
    private static readonly string TableTotalLabelBg = "#c5d4dc";
    private static readonly string TableRowBg = "#FFFFFF";

    static BusinessDocumentPdfRenderer()
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

    public static byte[] Render(BusinessDocumentPdfModel model)
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
                    col.Item().Element(c => ComposeLetterhead(c, model));
                    col.Item().PaddingTop(22).Element(c => ComposeTitleBand(c, model));
                    col.Item().PaddingTop(16).Element(c => ComposeCustomerBlock(c, model));
                    col.Item().PaddingTop(14).Element(c => ComposeLinesTable(c, model));
                    col.Item().PaddingTop(24).Element(c => ComposeSignatureBlock(c, model));
                });

                page.Footer().PaddingTop(8).Element(c => ComposeFooter(c, model));
            });
        }).GeneratePdf();
    }

    private const float LogoWidth = 216f;
    private const float LogoHeight = 160f;
    private const float DocumentTitleFontSize = 20f;

    private static void ComposeLetterhead(IContainer container, BusinessDocumentPdfModel model)
    {
        container.Row(row =>
        {
            if (!string.IsNullOrEmpty(model.LogoFilePath) && File.Exists(model.LogoFilePath))
                row.ConstantItem(LogoWidth).Height(LogoHeight).AlignLeft().AlignTop()
                    .Image(model.LogoFilePath).FitArea();
            else
                row.ConstantItem(LogoWidth);

            row.RelativeItem().AlignRight().AlignTop().Element(c =>
                ComposePartyBlock(c, SupplierBlock(model)));
        });
    }

    private static void ComposeTitleBand(IContainer container, BusinessDocumentPdfModel model)
    {
        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().AlignLeft().AlignMiddle()
                    .Text("[ נאמן למקור ]").Style(Regular(11).FontColor(TitleAccentColor));

                row.AutoItem().AlignRight().AlignMiddle().Row(right =>
                {
                    right.AutoItem().PaddingRight(8).AlignMiddle()
                        .Text(model.DisplayNumber).Style(Bold(DocumentTitleFontSize).FontColor(TitleAccentColor));
                    right.AutoItem().AlignMiddle()
                        .Text(model.DocumentTitle).Style(Bold(DocumentTitleFontSize).FontColor(TitleAccentColor));
                });
            });

            col.Item().PaddingTop(6).LineHorizontal(2.5f).LineColor(TitleAccentColor);
        });
    }

    private static PartyBlockModel SupplierBlock(BusinessDocumentPdfModel model) => new(
        Heading: null,
        Title: model.SupplierName,
        TitleFontSize: 22f,
        Subtitle: model.SupplierTagline,
        Address: model.SupplierAddress,
        DetailLine: model.SupplierTaxLine,
        Phone: model.SupplierMobile,
        PhoneLabel: "נייד",
        Email: model.SupplierEmail,
        EmailLabel: "אימייל",
        Website: model.SupplierWebsite,
        WebsiteLabel: "אתר");

    private static void ComposeCustomerBlock(IContainer container, BusinessDocumentPdfModel model)
    {
        container.Row(row =>
        {
            row.ConstantItem(100).AlignLeft().AlignTop()
                .Text(FormatDate(model.IssueDate)).Style(Regular(11));

            row.RelativeItem().AlignRight().AlignTop().Element(c =>
                ComposePartyBlock(c, new PartyBlockModel(
                    Heading: "לכבוד",
                    Title: model.CustomerName,
                    Subtitle: null,
                    Address: model.CustomerAddress,
                    DetailLine: model.CustomerIdLine is not null
                        ? $"{model.CustomerIdLine} : ח.פ / ת.ז"
                        : null,
                    Phone: model.CustomerPhone,
                    PhoneLabel: "טלפון",
                    Email: null,
                    EmailLabel: null,
                    Website: model.CustomerWebsite,
                    WebsiteLabel: "אתר")));
        });
    }

    private sealed record PartyBlockModel(
        string? Heading,
        string Title,
        string? Subtitle,
        string? Address,
        string? DetailLine,
        string? Phone,
        string? PhoneLabel,
        string? Email,
        string? EmailLabel,
        string? Website,
        string? WebsiteLabel,
        float TitleFontSize = 11f);

    private static void ComposePartyBlock(IContainer container, PartyBlockModel block)
    {
        container.Column(col =>
        {
            col.Spacing(2);
            if (!string.IsNullOrWhiteSpace(block.Heading))
                col.Item().AlignRight().Text($"{block.Heading} :").Style(Bold(10));

            col.Item().AlignRight().Text(block.Title).Style(Bold(block.TitleFontSize));

            if (!string.IsNullOrWhiteSpace(block.Subtitle))
                col.Item().AlignRight().Text(block.Subtitle).Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(block.Address))
                col.Item().AlignRight().Text(block.Address).Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(block.DetailLine))
                col.Item().AlignRight().Text(block.DetailLine).Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(block.Phone) && block.PhoneLabel is not null)
                col.Item().AlignRight().Text($"{block.Phone} : {block.PhoneLabel}").Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(block.Email) && block.EmailLabel is not null)
                col.Item().AlignRight().Text($"{block.Email} : {block.EmailLabel}").Style(Regular(10));

            if (!string.IsNullOrWhiteSpace(block.Website) && block.WebsiteLabel is not null)
                col.Item().AlignRight().Text($"{block.Website} : {block.WebsiteLabel}").Style(Regular(10));
        });
    }

    private static void ComposeLinesTable(IContainer container, BusinessDocumentPdfModel model)
    {
        container.Column(col =>
        {
            if (!string.IsNullOrWhiteSpace(model.TableBannerLine))
                col.Item().Element(c => TableBanner(c, model.TableBannerLine));

            col.Item().Element(c =>
            {
                if (model.LinesKind == BusinessDocumentPdfLinesKind.ReceiptPayments)
                    ComposeReceiptPaymentsTable(c, model);
                else
                    ComposeProductLinesTable(c, model);
            });
        });
    }

    private static void TableBanner(IContainer container, string title) =>
        container.Background(TitleAccentColor)
            .Border(0.5f).BorderColor(TableBorderColor)
            .PaddingVertical(7).PaddingHorizontal(8)
            .AlignRight()
            .Text(title).Style(Bold(10).FontColor(Colors.White));

    private static void ComposeProductLinesTable(IContainer container, BusinessDocumentPdfModel model)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(78);
                columns.ConstantColumn(78);
                columns.ConstantColumn(42);
                columns.RelativeColumn(3);
                columns.ConstantColumn(38);
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "סה״כ");
                ColumnHeaderCell(header.Cell(), "מחיר ליחידה");
                ColumnHeaderCell(header.Cell(), "כמות");
                ColumnHeaderCell(header.Cell(), "פירוט");
                ColumnHeaderCell(header.Cell(), "שורה");
            });

            var rowIndex = 0;
            foreach (var line in model.Lines)
            {
                var zebra = rowIndex % 2 == 1;
                var detail = FormatLineDetail(line);
                DataMoneyCell(table.Cell(), FormatMoney(line.LineTotal), zebra);
                DataMoneyCell(table.Cell(), FormatMoney(line.UnitPrice), zebra);
                DataCell(table.Cell(), FormatQuantity(line.Quantity), zebra, alignCenter: true);
                DataCell(table.Cell(), detail, zebra);
                DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true);
                rowIndex++;
            }

            if (model.DiscountValue is { } disc and > 0)
            {
                var zebra = rowIndex % 2 == 1;
                DataMoneyCell(table.Cell(), $"-{FormatMoney(disc)}", zebra);
                DataCell(table.Cell(), "", zebra);
                DataCell(table.Cell(), "", zebra);
                DataCell(table.Cell(), model.DiscountLabel ?? "הנחה", zebra);
                DataCell(table.Cell(), "", zebra);
                rowIndex++;
            }

            table.Footer(footer =>
            {
                FooterTotalAmountCell(footer.Cell(), FormatMoney(model.TotalAmount));
                FooterTotalLabelCell(footer.Cell(), model.TotalFooterLabel);
                FooterEmptyCell(footer.Cell());
                FooterEmptyCell(footer.Cell());
                FooterEmptyCell(footer.Cell());
            });
        });
    }

    private static void ComposeReceiptPaymentsTable(IContainer container, BusinessDocumentPdfModel model)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(78);
                columns.RelativeColumn(3);
                columns.ConstantColumn(76);
                columns.ConstantColumn(76);
                columns.ConstantColumn(38);
            });

            table.Header(header =>
            {
                ColumnHeaderCell(header.Cell(), "סה״כ");
                ColumnHeaderCell(header.Cell(), "פירוט");
                ColumnHeaderCell(header.Cell(), "סוג תשלום");
                ColumnHeaderCell(header.Cell(), "תאריך שורה");
                ColumnHeaderCell(header.Cell(), "שורה");
            });

            var rowIndex = 0;
            foreach (var line in model.Lines)
            {
                var zebra = rowIndex % 2 == 1;
                DataMoneyCell(table.Cell(), FormatMoney(line.LineTotal), zebra);
                DataCell(table.Cell(), line.PaymentDetail ?? "—", zebra);
                DataCell(table.Cell(), line.PaymentTypeLabel ?? "", zebra);
                DataCell(table.Cell(), line.LineDateDisplay ?? "—", zebra, alignCenter: true);
                DataCell(table.Cell(), line.RowNumber.ToString(CultureInfo.InvariantCulture), zebra, alignCenter: true);
                rowIndex++;
            }

            table.Footer(footer =>
            {
                FooterTotalAmountCell(footer.Cell(), FormatMoney(model.TotalAmount));
                FooterTotalLabelCell(footer.Cell(), model.TotalFooterLabel);
                FooterEmptyCell(footer.Cell());
                FooterEmptyCell(footer.Cell());
                FooterEmptyCell(footer.Cell());
            });
        });
    }

    private static string FormatLineDetail(BusinessDocumentPdfLine line)
    {
        if (!string.IsNullOrWhiteSpace(line.Sku))
            return $"{line.Sku} / {line.Description}";
        return line.Description;
    }

    private static IContainer TableCellBorder(IContainer cell) =>
        cell.Border(0.5f).BorderColor(TableBorderColor);

    private static void ColumnHeaderCell(IContainer cell, string text) =>
        TableCellBorder(cell).Background(TableHeaderBg)
            .PaddingVertical(6).PaddingHorizontal(5)
            .AlignCenter().Text(text).Style(Bold(9));

    private static void DataCell(IContainer cell, string text, bool altRow, bool alignCenter = false)
    {
        var bg = altRow ? TableRowAltBg : TableRowBg;
        var c = TableCellBorder(cell).Background(bg).PaddingVertical(6).PaddingHorizontal(5);
        if (alignCenter)
            c.AlignCenter().Text(text).Style(Regular(9));
        else
            c.AlignRight().Text(text).Style(Regular(9));
    }

    private static void DataMoneyCell(IContainer cell, string text, bool altRow) =>
        TableCellBorder(cell).Background(altRow ? TableRowAltBg : TableRowBg)
            .PaddingVertical(6).PaddingHorizontal(5)
            .AlignRight().Text(text).Style(Regular(9));

    private static void FooterEmptyCell(IContainer cell) =>
        TableCellBorder(cell).Background(TableRowBg)
            .PaddingVertical(7).PaddingHorizontal(5)
            .Text(" ");

    private static void FooterTotalLabelCell(IContainer cell, string text) =>
        TableCellBorder(cell).Background(TableTotalLabelBg)
            .PaddingVertical(7).PaddingHorizontal(5)
            .AlignRight().Text(text).Style(Bold(10));

    private static void FooterTotalAmountCell(IContainer cell, string text) =>
        TableCellBorder(cell).Background(TitleAccentColor)
            .PaddingVertical(7).PaddingHorizontal(5)
            .AlignRight().Text(text).Style(Bold(11).FontColor(Colors.White));

    private const float SignatureImageWidth = 140f;
    private const float SignatureImageHeight = 56f;

    private static void ComposeSignatureBlock(IContainer container, BusinessDocumentPdfModel model)
    {
        container.AlignLeft().Row(row =>
        {
            if (!string.IsNullOrEmpty(model.SignatureFilePath) && File.Exists(model.SignatureFilePath))
            {
                row.ConstantItem(SignatureImageWidth).Height(SignatureImageHeight)
                    .AlignLeft().AlignMiddle()
                    .Image(model.SignatureFilePath).FitArea();
            }

            row.AutoItem().AlignMiddle().PaddingLeft(12)
                .Text("חתימה").Style(Bold(12));
        });
    }

    private static void ComposeFooter(IContainer container, BusinessDocumentPdfModel model)
    {
        container.AlignCenter().Text(text =>
        {
            text.Span("עמוד ").Style(Regular(9));
            text.CurrentPageNumber().Style(Regular(9));
            text.Span(" מתוך ").Style(Regular(9));
            text.TotalPages().Style(Regular(9));
            text.Span($" | {model.FooterDocumentLabel} {model.DisplayNumber}").Style(Regular(9));
        });
    }

    private static TextStyle Regular(float size) =>
        TextStyle.Default.FontFamily(FontRegular).FontSize(size);

    private static TextStyle Bold(float size) =>
        TextStyle.Default.FontFamily(FontBold).FontSize(size);

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal amount) =>
        "₪" + amount.ToString("N2", CultureInfo.InvariantCulture);

    private static string FormatQuantity(decimal qty) =>
        qty % 1 == 0
            ? qty.ToString("0", CultureInfo.InvariantCulture)
            : qty.ToString("0.##", CultureInfo.InvariantCulture);
}
