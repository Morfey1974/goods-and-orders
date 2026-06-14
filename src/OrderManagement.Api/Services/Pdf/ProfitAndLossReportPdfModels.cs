namespace OrderManagement.Api.Services.Pdf;

public sealed record ProfitAndLossReportPdfModel(
    TenantPdfLetterheadModel Letterhead,
    string ReportTitle,
    string FooterLabel,
    DateTime GeneratedAt,
    string FilterSubtitle,
    string CogsMethodLabel,
    IReadOnlyList<ProfitAndLossReportPdfLineModel> SummaryLines,
    IReadOnlyList<ProfitAndLossReportPdfCategoryLineModel> CategoryLines);

public sealed record ProfitAndLossReportPdfLineModel(
    string Label,
    string AmountIls,
    bool IsTotal,
    bool IsSectionHeader);

public sealed record ProfitAndLossReportPdfCategoryLineModel(
    string Category,
    string AmountIls);
