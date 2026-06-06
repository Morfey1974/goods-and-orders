using System.ComponentModel.DataAnnotations;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Dto;

public record PurchaseReceiptLineDto(
    Guid Id,
    Guid ProductId,
    string ProductArticleCode,
    string ProductName,
    Guid? WarehouseId,
    string? WarehouseName,
    decimal Quantity,
    decimal? UnitPrice,
    decimal? UnitCostIls,
    string? SupplierSku,
    string? Notes,
    int SortOrder);

public record PurchaseReceiptLineInput(
    Guid ProductId,
    Guid? WarehouseId,
    [Range(0.0001, double.MaxValue)] decimal Quantity,
    decimal? UnitPrice,
    decimal? UnitCostIls,
    string? SupplierSku,
    string? Notes);

public record PurchaseReceiptListItemDto(
    Guid Id,
    string ReceiptNumber,
    string SupplierName,
    DateTime DocumentDate,
    string Currency,
    decimal? TotalAmount,
    string Status,
    bool HasDocument,
    DateTime CreatedAt,
    DateTime? PostedAt);

public record PurchaseReceiptDto(
    Guid Id,
    string ReceiptNumber,
    Guid SupplierId,
    string SupplierName,
    string? SupplierInvoiceNumber,
    DateTime DocumentDate,
    string Currency,
    decimal? TotalAmount,
    string? Notes,
    string Status,
    DateTime? PostedAt,
    bool HasDocument,
    string? DocumentFileName,
    int Version,
    DateTime CreatedAt,
    IReadOnlyList<PurchaseReceiptLineDto> Lines);

public record CreatePurchaseReceiptRequest(
    [Required] Guid SupplierId,
    string? SupplierInvoiceNumber,
    [Required] DateTime DocumentDate,
    string? Currency,
    decimal? TotalAmount,
    string? Notes,
    IReadOnlyList<PurchaseReceiptLineInput> Lines);

public record UpdatePurchaseReceiptRequest(
    [Required] Guid SupplierId,
    string? SupplierInvoiceNumber,
    [Required] DateTime DocumentDate,
    string? Currency,
    decimal? TotalAmount,
    string? Notes,
    int Version,
    IReadOnlyList<PurchaseReceiptLineInput> Lines);

public static class PurchaseReceiptMappers
{
    public static PurchaseReceiptListItemDto ToListItem(PurchaseReceipt r) => new(
        r.Id,
        r.ReceiptNumber,
        r.Supplier.Name,
        r.DocumentDate,
        r.Currency,
        r.TotalAmount,
        r.Status.ToString(),
        !string.IsNullOrEmpty(r.DocumentPath),
        r.CreatedAt,
        r.PostedAt);

    public static PurchaseReceiptDto ToDto(PurchaseReceipt r) => new(
        r.Id,
        r.ReceiptNumber,
        r.SupplierId,
        r.Supplier.Name,
        r.SupplierInvoiceNumber,
        r.DocumentDate,
        r.Currency,
        r.TotalAmount,
        r.Notes,
        r.Status.ToString(),
        r.PostedAt,
        !string.IsNullOrEmpty(r.DocumentPath),
        r.DocumentFileName,
        r.Version,
        r.CreatedAt,
        r.Lines
            .OrderBy(l => l.SortOrder)
            .Select(ToLineDto)
            .ToList());

    public static PurchaseReceiptLineDto ToLineDto(PurchaseReceiptLine line)
    {
        var product = line.Product;
        return new PurchaseReceiptLineDto(
            line.Id,
            line.ProductId,
            product.ArticleCode,
            product.Name,
            line.WarehouseId,
            null,
            line.Quantity,
            line.UnitPrice,
            line.UnitCostIls,
            line.SupplierSku,
            line.Notes,
            line.SortOrder);
    }
}
