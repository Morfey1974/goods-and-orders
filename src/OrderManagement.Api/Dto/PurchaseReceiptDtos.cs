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
    decimal? LineTotal,
    decimal? UnitPrice,
    decimal? UnitCostIls,
    string? SupplierSku,
    string? Notes,
    int SortOrder);

public record PurchaseReceiptLineInput(
    Guid ProductId,
    Guid? WarehouseId,
    [Range(0.0001, double.MaxValue)] decimal Quantity,
    decimal? LineTotal,
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
    decimal? TotalAmountUsd,
    decimal? TotalAmountIls,
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

    public static PurchaseReceiptListItemDto ToListItem(PurchaseReceipt r)
    {
        var (amountUsd, amountIls) = ResolveListAmounts(r);
        return new(
            r.Id,
            r.ReceiptNumber,
            r.Supplier.Name,
            r.DocumentDate,
            r.Currency,
            r.TotalAmount,
            amountUsd,
            amountIls,
            r.Status.ToString(),
            DocumentCount(r),
            r.CreatedAt,
            r.PostedAt);
    }

    private static (decimal? Usd, decimal? Ils) ResolveListAmounts(PurchaseReceipt r)
    {
        if (r.Lines.Count > 0)
            return ResolveListAmountsFromLines(r);

        return ResolveListAmountsFromHeader(r);
    }

    private static (decimal? Usd, decimal? Ils) ResolveListAmountsFromLines(PurchaseReceipt r)
    {
        var currency = NormalizeListCurrency(r.Currency);
        if (currency == "USD")
        {
            decimal usd = 0;
            decimal ils = 0;
            foreach (var line in r.Lines)
            {
                if (line.LineTotal is > 0)
                    usd += line.LineTotal.Value;
                else if (line.UnitPrice is > 0)
                    usd += line.UnitPrice.Value * line.Quantity;
                if (line.UnitCostIls is > 0)
                    ils += line.UnitCostIls.Value * line.Quantity;
            }

            usd = RoundListMoney(usd);
            ils = RoundListMoney(ils);
            if (ils <= 0 && usd > 0 && r.UsdIlsRate is > 0)
                ils = RoundListMoney(usd * r.UsdIlsRate.Value);

            return (usd > 0 ? usd : null, ils > 0 ? ils : null);
        }

        decimal ilsTotal = 0;
        foreach (var line in r.Lines)
        {
            if (line.LineTotal is > 0)
                ilsTotal += line.LineTotal.Value;
            else if (line.UnitPrice is > 0)
                ilsTotal += line.UnitPrice.Value * line.Quantity;
            else if (line.UnitCostIls is > 0)
                ilsTotal += line.UnitCostIls.Value * line.Quantity;
        }

        ilsTotal = RoundListMoney(ilsTotal);
        if (ilsTotal <= 0 && r.TotalAmount is > 0)
            ilsTotal = r.TotalAmount.Value;

        return (null, ilsTotal > 0 ? ilsTotal : null);
    }

    private static (decimal? Usd, decimal? Ils) ResolveListAmountsFromHeader(PurchaseReceipt r)
    {
        if (r.TotalAmount is not > 0)
            return (null, null);

        var currency = NormalizeListCurrency(r.Currency);
        if (currency == "USD")
        {
            if (r.UsdIlsRate is > 0)
            {
                var ils = r.TotalAmount.Value;
                var usd = RoundListMoney(ils / r.UsdIlsRate.Value);
                return (usd > 0 ? usd : null, ils);
            }

            return (r.TotalAmount, null);
        }

        return (null, r.TotalAmount);
    }

    private static string NormalizeListCurrency(string? currency)
    {
        var c = string.IsNullOrWhiteSpace(currency) ? "ILS" : currency.Trim().ToUpperInvariant();
        return c is "NIS" or "₪" ? "ILS" : c.Length > 3 ? c[..3] : c;
    }

    private static decimal RoundListMoney(decimal value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);

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
            line.LineTotal,
            line.UnitPrice,
            line.UnitCostIls,
            line.SupplierSku,
            line.Notes,
            line.SortOrder);
    }
}
