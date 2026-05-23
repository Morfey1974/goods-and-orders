namespace OrderManagement.Api.Services.Pdf;

public sealed record QuotePdfLine(
    int RowNumber,
    string Description,
    string? Sku,
    decimal Quantity,
    decimal UnitPrice,
    decimal LineTotal);

public sealed record QuotePdfModel(
    string DisplayNumber,
    string FullDocumentNumber,
    DateTime IssueDate,
    decimal TotalAmount,
    decimal? SubtotalBeforeDiscount,
    decimal? DiscountValue,
    string? DiscountLabel,
    string CustomerName,
    string? CustomerAddress,
    string? CustomerIdLine,
    string? CustomerPhone,
    string? CustomerWebsite,
    string SupplierName,
    string? SupplierTagline,
    string? SupplierTaxLine,
    string? SupplierAddress,
    string? SupplierMobile,
    string? SupplierEmail,
    string? SupplierWebsite,
    string? ProjectLine,
    string? LogoFilePath,
    string? SignatureFilePath,
    IReadOnlyList<QuotePdfLine> Lines);
