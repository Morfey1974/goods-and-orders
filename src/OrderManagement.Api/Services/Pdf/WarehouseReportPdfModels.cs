namespace OrderManagement.Api.Services.Pdf;

public sealed record WarehouseReportPdfModel(
    TenantPdfLetterheadModel Letterhead,
    string ReportTitle,
    string FooterLabel,
    DateTime GeneratedAt,
    string? FilterSubtitle,
    WarehouseReportKind Kind,
    IReadOnlyList<WarehouseBalanceGroupModel> BalanceGroups,
    IReadOnlyList<WarehouseMovementGroupModel> MovementGroups);

public enum WarehouseReportKind
{
    Balances,
    Movements
}

public sealed record WarehouseBalanceGroupModel(
    string WarehouseName,
    IReadOnlyList<WarehouseBalanceLineModel> Lines);

/// <summary>Warehouse row for report grouping (all active warehouses in balances report).</summary>
public sealed record WarehouseReportWarehouseRef(Guid Id, string Name);

public sealed record WarehouseMovementGroupModel(
    string WarehouseName,
    IReadOnlyList<WarehouseMovementLineModel> Lines);

public sealed record WarehouseBalanceLineModel(
    int RowNumber,
    string ArticleCode,
    string ProductName,
    string ProductTypeLabel,
    decimal Quantity);

public sealed record WarehouseMovementLineModel(
    int RowNumber,
    DateTime CreatedAt,
    string ArticleCode,
    string ProductName,
    string MovementTypeLabel,
    decimal Quantity,
    decimal BalanceAfter,
    string? Notes);
