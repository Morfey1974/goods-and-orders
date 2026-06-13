using System.ComponentModel.DataAnnotations;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Dto;

public record InventoryOpeningBalanceLineInput(
    [Required] Guid ProductId,
    [Required] Guid WarehouseId,
    [Range(0.0001, double.MaxValue)] decimal Quantity,
    [Range(0.01, double.MaxValue)] decimal UnitCostIls);

public record PostInventoryOpeningBalanceRequest(
    [Required] DateTime AsOfDate,
    [Required][MinLength(1)] IReadOnlyList<InventoryOpeningBalanceLineInput> Lines,
    string? Notes);

public record PostInventoryOpeningBalanceResult(
    int LinesPosted,
    decimal TotalValueIls);

public record InventoryValuationLineDto(
    Guid ProductId,
    string ArticleCode,
    string? LegacySku,
    string ProductName,
    Guid WarehouseId,
    string WarehouseName,
    decimal Quantity,
    decimal UnitCostIls,
    decimal TotalValueIls,
    Guid? LotId = null,
    DateTime? ReceivedAt = null,
    string? SourceType = null,
    string? SourceLabel = null);

public record InventoryLotDto(
    Guid Id,
    Guid ProductId,
    string ArticleCode,
    string? LegacySku,
    string ProductName,
    Guid WarehouseId,
    string WarehouseName,
    decimal QuantityReceived,
    decimal QuantityRemaining,
    decimal UnitCostIls,
    decimal TotalReceivedIls,
    decimal TotalValueIls,
    DateTime ReceivedAt,
    string SourceType,
    Guid? SourceId,
    string? SourceLabel,
    Guid? SourceReceiptId = null,
    string? SourceReceiptNumber = null,
    Guid? SourceAssemblyId = null,
    string? SourceAssemblyNumber = null);

public record InventoryValuationReportDto(
    DateTime AsOfDate,
    string CostMethod,
    IReadOnlyList<InventoryValuationLineDto> Lines,
    decimal GrandTotalIls,
    bool Detailed = false);

public record StockInventoryResetResultDto(
    int LotAllocationsDeleted,
    int LotsDeleted,
    int AverageCostsDeleted,
    int MovementsDeleted,
    int BalancesDeleted,
    int OrdersStockFlagReset,
    int ProductsTrackInventoryReset);

public static class InventoryCostMethodNames
{
    public static string ToApi(InventoryCostMethod method) =>
        method == InventoryCostMethod.Wac ? "WAC" : "FIFO";
}
