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
    string ProductName,
    Guid WarehouseId,
    string WarehouseName,
    decimal Quantity,
    decimal UnitCostIls,
    decimal TotalValueIls);

public record InventoryValuationReportDto(
    DateTime AsOfDate,
    string CostMethod,
    IReadOnlyList<InventoryValuationLineDto> Lines,
    decimal GrandTotalIls);

public static class InventoryCostMethodNames
{
    public static string ToApi(InventoryCostMethod method) =>
        method == InventoryCostMethod.Wac ? "WAC" : "FIFO";
}
