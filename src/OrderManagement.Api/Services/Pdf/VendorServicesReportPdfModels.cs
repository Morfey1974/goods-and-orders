namespace OrderManagement.Api.Services.Pdf;

public sealed record VendorServicesReportPdfModel(
    TenantPdfLetterheadModel Letterhead,
    string ReportTitle,
    string FooterLabel,
    DateTime GeneratedAt,
    string FilterSubtitle,
    decimal GrandTotalIls,
    IReadOnlyList<VendorServicesReportPdfLineModel> Lines);

public sealed record VendorServicesReportPdfLineModel(
    int RowNumber,
    string ServiceDate,
    string VendorName,
    string Source,
    string Category,
    string Description,
    string AmountIls);
