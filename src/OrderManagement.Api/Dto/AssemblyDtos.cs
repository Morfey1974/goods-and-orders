namespace OrderManagement.Api.Dto;

public record AssemblyRecipeLineDto(
    Guid ComponentProductId,
    string ComponentArticleCode,
    string ComponentName,
    decimal Quantity);

public record AssemblyRecipeLineInput(Guid ComponentProductId, decimal Quantity);

public record StockAssemblyLineDto(
    Guid Id,
    Guid ProductId,
    string ArticleCode,
    string ProductName,
    decimal Quantity,
    int SortOrder);

public record StockAssemblyLineInput(Guid ProductId, decimal Quantity);

public record StockAssemblyListItemDto(
    Guid Id,
    string AssemblyNumber,
    DateTime AssemblyDate,
    string Status,
    string OutputArticleCode,
    string OutputProductName,
    decimal OutputQuantity,
    decimal AdditionalCostIls,
    int Version,
    DateTime CreatedAt);

public record StockAssemblyDto(
    Guid Id,
    string AssemblyNumber,
    DateTime AssemblyDate,
    string Status,
    Guid OutputProductId,
    string OutputArticleCode,
    string OutputProductName,
    Guid OutputWarehouseId,
    string OutputWarehouseName,
    decimal OutputQuantity,
    decimal AdditionalCostIls,
    string? Notes,
    DateTime? PostedAt,
    decimal? OutputUnitCostIls,
    IReadOnlyList<StockAssemblyLineDto> Lines,
    int Version,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateStockAssemblyRequest(
    DateTime AssemblyDate,
    Guid OutputProductId,
    Guid? OutputWarehouseId,
    decimal OutputQuantity,
    decimal AdditionalCostIls,
    string? Notes,
    IReadOnlyList<StockAssemblyLineInput> Lines);

public record UpdateStockAssemblyRequest(
    DateTime AssemblyDate,
    Guid OutputProductId,
    Guid? OutputWarehouseId,
    decimal OutputQuantity,
    decimal AdditionalCostIls,
    string? Notes,
    IReadOnlyList<StockAssemblyLineInput> Lines,
    int Version);
