namespace OrderManagement.Api.Dto;

public record FixedAssetInstanceDto(
    Guid Id,
    Guid? ProductId,
    string? ArticleCode,
    string Name,
    string? Description,
    Guid? PurchaseReceiptId,
    string? ReceiptNumber,
    DateTime AcquisitionDate,
    DateTime InServiceDate,
    decimal OriginalCostIls,
    decimal ChangesCostIls,
    decimal DepreciableBaseIls,
    string Category,
    decimal AnnualDepreciationPercent,
    decimal BusinessUsePercent,
    decimal AnnualDepreciationIls,
    string Status,
    DateTime? DisposedAt,
    string? VendorName,
    string? InvoiceReference,
    string? Notes);

public record Form1342LineDto(
    int RowNumber,
    Guid InstanceId,
    string AssetDescription,
    DateTime AcquisitionDate,
    DateTime InServiceDate,
    decimal OriginalCostIls,
    decimal ChangesCostIls,
    decimal TotalDepreciableIls,
    decimal LegalDepreciationRatePercent,
    decimal ClaimedDepreciationRatePercent,
    decimal CurrentYearDepreciationIls,
    decimal PreviousAccumulatedDepreciationIls,
    decimal TotalAccumulatedDepreciationIls,
    decimal RemainingBalanceIls,
    decimal BusinessUsePercent,
    string? Notes);

public record Form1342ReportDto(
    int TaxYear,
    string? TenantName,
    string? OsekNumber,
    IReadOnlyList<Form1342LineDto> Lines,
    decimal TotalCurrentYearDepreciationIls);

public record FixedAssetDepreciationScheduleLineDto(
    Guid InstanceId,
    string Name,
    string Category,
    int TaxYear,
    int MonthsInYear,
    decimal CurrentYearDepreciationIls,
    decimal AccumulatedDepreciationIls,
    decimal RemainingBalanceIls);
