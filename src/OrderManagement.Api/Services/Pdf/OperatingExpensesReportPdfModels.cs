namespace OrderManagement.Api.Services.Pdf;

public sealed record OperatingExpensesReportPdfModel(
    TenantPdfLetterheadModel Letterhead,
    string ReportTitle,
    string FooterLabel,
    DateTime GeneratedAt,
    string FilterSubtitle,
    decimal HomeMixedTotalIls,
    decimal HomeMixedRecognizedIls,
    decimal OperatingDirectTotalIls,
    decimal DepreciationIls,
    decimal GrandTotalRecognizedIls,
    IReadOnlyList<OperatingExpensesReportPdfExpenseLineModel> ExpenseLines,
    IReadOnlyList<OperatingExpensesReportPdfDepreciationLineModel> DepreciationLines);

public sealed record OperatingExpensesReportPdfExpenseLineModel(
    int RowNumber,
    string ExpenseDate,
    string ExpenseType,
    string Notes,
    string AmountIls,
    string RecognizedIls);

public sealed record OperatingExpensesReportPdfDepreciationLineModel(
    int RowNumber,
    string Name,
    string Category,
    string AnnualDepreciationIls,
    string PeriodDepreciationIls);
