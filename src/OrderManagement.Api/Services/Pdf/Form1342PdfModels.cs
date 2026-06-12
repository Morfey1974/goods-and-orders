using OrderManagement.Api.Dto;

namespace OrderManagement.Api.Services.Pdf;

public record Form1342PdfLineModel(
    int RowNumber,
    string AssetDescription,
    string AcquisitionDate,
    string InServiceDate,
    string OriginalCost,
    string ChangesCost,
    string TotalDepreciable,
    string LegalRate,
    string ClaimedRate,
    string CurrentYearDepreciation,
    string PreviousAccumulated,
    string TotalAccumulated,
    string RemainingBalance,
    string Notes);

public record Form1342PdfModel(
    TenantPdfLetterheadModel Letterhead,
    int TaxYear,
    string TenantName,
    string? OsekNumber,
    DateTime GeneratedAt,
    IReadOnlyList<Form1342PdfLineModel> Lines,
    string TotalCurrentYearDepreciation);
