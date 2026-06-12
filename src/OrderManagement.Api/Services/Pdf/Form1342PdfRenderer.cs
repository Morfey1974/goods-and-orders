using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

public static class Form1342PdfRenderer
{
    private const string FontRegular = PdfFontRegistry.HebrewRegular;
    private const string FontBold = PdfFontRegistry.HebrewBold;
    private static bool _fontsRegistered;

    static Form1342PdfRenderer()
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

    public static byte[] Render(Form1342PdfModel model)
    {
        RegisterFonts();
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.MarginHorizontal(20);
                page.MarginTop(16);
                page.MarginBottom(20);
                page.DefaultTextStyle(Regular(7));

                page.Content().Column(col =>
                {
                    col.Item().Element(c => PdfLetterheadRenderer.Compose(c, model.Letterhead));
                    col.Item().PaddingTop(10).Element(c => ComposeHeader(c, model));
                    col.Item().PaddingTop(8).Element(c => ComposeTable(c, model));
                    col.Item().PaddingTop(6).AlignRight()
                        .Text($"סה\"כ פחת לשנה {model.TaxYear}: {model.TotalCurrentYearDepreciation} ₪")
                        .Style(Bold(9));
                });

                page.Footer().AlignCenter()
                    .Text($"טופס 1342 (יא) | שנת מס {model.TaxYear} | {FormatDate(model.GeneratedAt)}")
                    .Style(Regular(7));
            });
        }).GeneratePdf();
    }

    private static void ComposeHeader(IContainer container, Form1342PdfModel model)
    {
        container.Column(col =>
        {
            col.Item().AlignRight().Text("טופס 1342 (יא) — פרטים על נכסים בני פחת")
                .Style(Bold(12));
            col.Item().PaddingTop(4).AlignRight()
                .Text("Form 1342 — Fixed assets depreciation schedule | Форма 1342 — ведомость амортизации")
                .Style(Regular(8));
            col.Item().PaddingTop(6).Row(row =>
            {
                row.RelativeItem().AlignRight().Text($"שנת מס / Tax year: {model.TaxYear}").Style(Regular(8));
                row.RelativeItem().AlignRight().Text($"שם / Name: {model.TenantName}").Style(Regular(8));
                row.RelativeItem().AlignRight()
                    .Text($"מס' עוסק / File: {model.OsekNumber ?? "—"}").Style(Regular(8));
            });
        });
    }

    private static void ComposeTable(IContainer container, Form1342PdfModel model)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(2.2f); // notes
                columns.RelativeColumn(1.1f); // balance
                columns.RelativeColumn(1.1f); // total acc
                columns.RelativeColumn(1.1f); // prev acc
                columns.RelativeColumn(1.1f); // current year
                columns.RelativeColumn(0.8f); // claimed rate
                columns.RelativeColumn(0.8f); // legal rate
                columns.RelativeColumn(1.0f); // total depreciable
                columns.RelativeColumn(0.9f); // changes
                columns.RelativeColumn(1.0f); // original
                columns.RelativeColumn(1.2f); // dates
                columns.RelativeColumn(2.0f); // description
                columns.ConstantColumn(24); // row
            });

            HeaderCell(table, "#");
            HeaderCell(table, "תיאור / Description");
            HeaderCell(table, "תאריכים\nDates");
            HeaderCell(table, "מחיר מקורי\nOriginal ₪");
            HeaderCell(table, "שינויים\nChanges ₪");
            HeaderCell(table, "סה\"כ בני פחת\nTotal ₪");
            HeaderCell(table, "שיעור\nLegal %");
            HeaderCell(table, "נתבע\nClaimed %");
            HeaderCell(table, "פחת שנה\nYear ₪");
            HeaderCell(table, "מצטבר קודם\nPrev ₪");
            HeaderCell(table, "מצטבר\nTotal ₪");
            HeaderCell(table, "יתרה\nBalance ₪");
            HeaderCell(table, "הערות\nNotes");

            foreach (var line in model.Lines)
            {
                BodyCell(table, line.RowNumber.ToString());
                BodyCell(table, line.AssetDescription);
                BodyCell(table, $"{line.AcquisitionDate}\n{line.InServiceDate}");
                BodyCell(table, line.OriginalCost);
                BodyCell(table, line.ChangesCost);
                BodyCell(table, line.TotalDepreciable);
                BodyCell(table, line.LegalRate);
                BodyCell(table, line.ClaimedRate);
                BodyCell(table, line.CurrentYearDepreciation);
                BodyCell(table, line.PreviousAccumulated);
                BodyCell(table, line.TotalAccumulated);
                BodyCell(table, line.RemainingBalance);
                BodyCell(table, line.Notes);
            }
        });
    }

    private static void HeaderCell(TableDescriptor table, string text)
    {
        table.Cell().Border(0.5f).Background("#e8ecef").Padding(3).AlignRight()
            .Text(text).Style(Bold(6.5f));
    }

    private static void BodyCell(TableDescriptor table, string text)
    {
        table.Cell().Border(0.5f).Padding(3).AlignRight()
            .Text(text).Style(Regular(6.5f));
    }

    private static TextStyle Regular(float size) => TextStyle.Default.FontSize(size).FontFamily(FontRegular);
    private static TextStyle Bold(float size) => TextStyle.Default.FontSize(size).FontFamily(FontBold);

    private static string FormatDate(DateTime value) =>
        value.ToString("dd/MM/yyyy");
}
