namespace OrderManagement.Api.Services.Pdf;

public enum BusinessDocumentPdfLinesKind
{
    Products = 0,
    ReceiptPayments = 1
}

public sealed record BusinessDocumentPdfLine(
    int RowNumber,
    string Description,
    string? Sku,
    decimal Quantity,
    decimal UnitPrice,
    decimal LineTotal,
    string? PaymentTypeLabel = null,
    string? LineDateDisplay = null,
    string? PaymentDetail = null);

public sealed record BusinessDocumentPdfModel(
    string DocumentTitle,
    string FooterDocumentLabel,
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
    /// <summary>Banner above the lines table (project / based-on reference).</summary>
    string? TableBannerLine,
    string? LogoFilePath,
    string? SignatureFilePath,
    IReadOnlyList<BusinessDocumentPdfLine> Lines,
    BusinessDocumentPdfLinesKind LinesKind = BusinessDocumentPdfLinesKind.Products,
    string TotalFooterLabel = "סה\"כ לתשלום");
