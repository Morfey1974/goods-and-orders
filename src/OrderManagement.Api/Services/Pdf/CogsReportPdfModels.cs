namespace OrderManagement.Api.Services.Pdf;

public sealed record CogsReportPdfModel(
    TenantPdfLetterheadModel Letterhead,
    string ReportTitle,
    string FooterLabel,
    DateTime GeneratedAt,
    string FilterSubtitle,
    string OpeningInventoryIls,
    string PurchasesToInventoryIls,
    string ClosingInventoryIls,
    string CogsByFormulaIls,
    string CogsFromIssuesIls,
    IReadOnlyList<CogsReportPdfIssueLineModel> IssueLines);

public sealed record CogsReportPdfIssueLineModel(
    int RowNumber,
    string MovementDate,
    string ArticleCode,
    string ProductName,
    string Quantity,
    string TotalCostIls,
    string Notes);
