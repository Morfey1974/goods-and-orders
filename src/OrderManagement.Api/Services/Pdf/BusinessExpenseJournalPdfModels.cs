namespace OrderManagement.Api.Services.Pdf;

public sealed record BusinessExpenseJournalPdfModel(
    TenantPdfLetterheadModel Letterhead,
    string ReportTitle,
    string FooterLabel,
    DateTime GeneratedAt,
    string FilterSubtitle,
    decimal TotalAmountIls,
    decimal TotalRecognizedIls,
    IReadOnlyList<BusinessExpenseJournalPdfLineModel> Lines);

public sealed record BusinessExpenseJournalPdfLineModel(
    int RowNumber,
    string ExpenseDate,
    string ExpenseType,
    string Notes,
    string VendorName,
    string AmountIls,
    string RecognizedIls,
    string InvoiceReference,
    string DocumentCount);
