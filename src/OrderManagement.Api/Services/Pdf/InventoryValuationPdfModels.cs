namespace OrderManagement.Api.Services.Pdf;

public sealed record InventoryValuationPdfModel(
    TenantPdfLetterheadModel Letterhead,
    string ReportTitle,
    string FooterLabel,
    DateTime GeneratedAt,
    string FilterSubtitle,
    bool Detailed,
    decimal GrandTotalIls,
    IReadOnlyList<InventoryValuationGroupModel> Groups);

public sealed record InventoryValuationGroupModel(
    string WarehouseName,
    IReadOnlyList<InventoryValuationLineModel> Lines);

public sealed record InventoryValuationLineModel(
    int RowNumber,
    string ArticleCode,
    string ProductName,
    decimal Quantity,
    decimal UnitCostIls,
    decimal TotalValueIls,
    string? ReceivedAtLabel,
    string? SourceLabel);
