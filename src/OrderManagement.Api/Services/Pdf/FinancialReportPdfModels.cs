namespace OrderManagement.Api.Services.Pdf;

public enum FinancialReportPdfKind
{
    Income,
    Expense
}

public sealed record FinancialReportPdfModel(
    TenantPdfLetterheadModel Letterhead,
    string ReportTitle,
    string FooterLabel,
    DateTime GeneratedAt,
    string FilterSubtitle,
    FinancialReportPdfKind Kind,
    decimal GrandTotalIls,
    int DocumentCount,
    IReadOnlyList<IncomeReportPdfLineModel> IncomeLines,
    IReadOnlyList<ExpenseReportPdfLineModel> ExpenseLines);

public sealed record IncomeReportPdfLineModel(
    int RowNumber,
    string PaymentDate,
    string DocumentNumber,
    string ReceiptDate,
    string CustomerName,
    string PaymentType,
    string Detail,
    string Amount,
    string AmountIls);

public sealed record ExpenseReportPdfLineModel(
    int RowNumber,
    string DocumentDate,
    string ReceiptNumber,
    string SupplierName,
    string SupplierInvoiceNumber,
    string AmountOriginal,
    string AmountIls);
