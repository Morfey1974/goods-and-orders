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

public record PurchaseReceiptLandedCostLineDto(
    Guid Id,
    Guid SupplierId,
    string SupplierName,
    string Category,
    string Currency,
    decimal Amount,
    decimal? AmountIls,
    string? Notes,
    int SortOrder);

public record PurchaseReceiptLandedCostLineInput(
    [Required] Guid SupplierId,
    [Required] string Category,
    string? Currency,
    [Range(0.01, double.MaxValue)] decimal Amount,
    string? Notes);

public record PurchaseReceiptDocumentDto(
    Guid Id,
    string FileName,
    string ContentType,
    int SortOrder,
    DateTime CreatedAt);

public record PurchaseReceiptListItemDto(
    Guid Id,
    string ReceiptNumber,
    string SupplierName,
    DateTime DocumentDate,
    string Currency,
    decimal? TotalAmount,
    string Status,
    int DocumentCount,
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
    decimal? UsdIlsRate,
    string? Notes,
    string Status,
    DateTime? PostedAt,
    int DocumentCount,
    int Version,
    DateTime CreatedAt,
    IReadOnlyList<PurchaseReceiptLineDto> Lines,
    bool ApplyLandedCosts,
    IReadOnlyList<PurchaseReceiptLandedCostLineDto> LandedCostLines,
    IReadOnlyList<PurchaseReceiptDocumentDto> Documents);

public record CreatePurchaseReceiptRequest(
    [Required] Guid SupplierId,
    string? SupplierInvoiceNumber,
    [Required] DateTime DocumentDate,
    string? Currency,
    decimal? TotalAmount,
    decimal? UsdIlsRate,
    string? Notes,
    bool ApplyLandedCosts,
    IReadOnlyList<PurchaseReceiptLineInput> Lines,
    IReadOnlyList<PurchaseReceiptLandedCostLineInput>? LandedCostLines);

public record UpdatePurchaseReceiptRequest(
    [Required] Guid SupplierId,
    string? SupplierInvoiceNumber,
    [Required] DateTime DocumentDate,
    string? Currency,
    decimal? TotalAmount,
    decimal? UsdIlsRate,
    string? Notes,
    int Version,
    bool ApplyLandedCosts,
    IReadOnlyList<PurchaseReceiptLineInput> Lines,
    IReadOnlyList<PurchaseReceiptLandedCostLineInput>? LandedCostLines);

public static class PurchaseReceiptMappers
{
    public static int DocumentCount(PurchaseReceipt r) => r.Documents.Count;

    public static PurchaseReceiptListItemDto ToListItem(PurchaseReceipt r) => new(
        r.Id,
        r.ReceiptNumber,
        r.Supplier.Name,
        r.DocumentDate,
        r.Currency,
        r.TotalAmount,
        r.Status.ToString(),
        DocumentCount(r),
        r.CreatedAt,
        r.PostedAt);

    public static PurchaseReceiptDocumentDto ToDocumentDto(PurchaseReceiptDocument doc) => new(
        doc.Id,
        doc.FileName,
        doc.ContentType,
        doc.SortOrder,
        doc.CreatedAt);

    public static PurchaseReceiptDto ToDto(PurchaseReceipt r) => new(
        r.Id,
        r.ReceiptNumber,
        r.SupplierId,
        r.Supplier.Name,
        r.SupplierInvoiceNumber,
        r.DocumentDate,
        r.Currency,
        r.TotalAmount,
        r.UsdIlsRate,
        r.Notes,
        r.Status.ToString(),
        r.PostedAt,
        DocumentCount(r),
        r.Version,
        r.CreatedAt,
        r.Lines
            .OrderBy(l => l.SortOrder)
            .Select(ToLineDto)
            .ToList(),
        r.ApplyLandedCosts,
        r.LandedCostLines
            .OrderBy(l => l.SortOrder)
            .Select(ToLandedCostLineDto)
            .ToList(),
        r.Documents
            .OrderBy(d => d.SortOrder)
            .ThenBy(d => d.CreatedAt)
            .Select(ToDocumentDto)
            .ToList());

    public static PurchaseReceiptLandedCostLineDto ToLandedCostLineDto(PurchaseReceiptLandedCostLine line) =>
        new(
            line.Id,
            line.SupplierId,
            line.Supplier.Name,
            line.Category.ToString(),
            line.Currency,
            line.Amount,
            line.AmountIls,
            line.Notes,
            line.SortOrder);

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
