using System.ComponentModel.DataAnnotations;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Dto;

public record DocumentLineDto(
    Guid Id,
    Guid? ProductId,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal LineTotal,
    int SortOrder);

public record ReceiptPaymentLineDto(
    Guid Id,
    string PaymentType,
    decimal Amount,
    string Currency,
    DateTime? LineDate,
    string? GeneralDetail,
    string? DetailsJson,
    int SortOrder);

public record DocumentDto(
    Guid Id,
    string DocumentType,
    string DocumentNumber,
    Guid CustomerId,
    string CustomerName,
    Guid? OrderId,
    Guid? ParentDocumentId,
    string Status,
    string? Description,
    DateTime IssueDate,
    DateTime? DueDate,
    decimal TotalAmount,
    decimal? DiscountPercent,
    decimal? DiscountAmount,
    string? PaymentMethod,
    IReadOnlyList<DocumentLineDto> Lines,
    IReadOnlyList<ReceiptPaymentLineDto>? PaymentLines,
    decimal? ParentChargeAmount,
    string? ParentChargeNumber,
    int Version,
    DateTime CreatedAt);

public record DocumentSummaryDto(
    decimal TotalReceipts,
    decimal TotalChargeInvoices,
    decimal TotalQuotes,
    decimal TotalReceivable);

public record DocumentMonthGroupDto(
    string MonthKey,
    int Year,
    int Month,
    IReadOnlyList<DocumentDto> Documents);

public record DocumentListResponseDto(
    DocumentSummaryDto Summary,
    IReadOnlyList<DocumentMonthGroupDto> Groups);

public record DocumentLineInput(
    Guid? ProductId,
    [Required][MinLength(1)] string Description,
    [Range(0.0001, double.MaxValue)] decimal Quantity,
    [Range(0, double.MaxValue)] decimal UnitPrice);

public record UpdateDocumentRequest(
    string? Description,
    DateTime? IssueDate,
    DateTime? DueDate,
    string? PaymentMethod,
    int Version,
    [MinLength(1)] IReadOnlyList<DocumentLineInput>? Lines,
    [Range(0, 100)] decimal? DiscountPercent = null,
    [Range(0, double.MaxValue)] decimal? DiscountAmount = null);

public record CreateDocumentRequest(
    [Required] string DocumentType,
    [Required] Guid CustomerId,
    string? Description,
    DateTime? IssueDate,
    DateTime? DueDate,
    string? PaymentMethod,
    Guid? ParentDocumentId,
    Guid? OrderId,
    [MinLength(1)] IReadOnlyList<DocumentLineInput>? Lines,
    [Range(0, 100)] decimal? DiscountPercent = null,
    [Range(0, double.MaxValue)] decimal? DiscountAmount = null);

public record RecordPaymentRequest(
    string? PaymentMethod,
    DateTime? PaymentDate);

public record ReceiptPaymentLineInput(
    string PaymentType,
    [Range(0.01, double.MaxValue)] decimal Amount,
    string? Currency,
    DateTime? LineDate,
    string? GeneralDetail,
    string? DetailsJson);

public record UpdateReceiptRequest(
    string? Description,
    DateTime? IssueDate,
    int Version,
    [MinLength(1)] IReadOnlyList<ReceiptPaymentLineInput>? PaymentLines,
    bool Finalize = true);

public static class DocumentMappers
{
    public static DocumentDto ToDto(
        BusinessDocument d,
        BusinessDocument? parentCharge = null) => new(
        d.Id,
        d.DocumentType.ToString(),
        d.DocumentNumber,
        d.CustomerId,
        d.Customer.Name,
        d.OrderId,
        d.ParentDocumentId,
        d.Status.ToString(),
        d.Description,
        d.IssueDate,
        d.DueDate,
        d.TotalAmount,
        d.DiscountPercent,
        d.DiscountAmount,
        d.PaymentMethod,
        d.Lines.OrderBy(l => l.SortOrder).Select(l => new DocumentLineDto(
            l.Id,
            l.ProductId,
            l.Description,
            l.Quantity,
            l.UnitPrice,
            l.LineTotal,
            l.SortOrder)).ToList(),
        d.DocumentType == DocumentType.Receipt
            ? d.PaymentLines.OrderBy(p => p.SortOrder).Select(ToPaymentLineDto).ToList()
            : null,
        parentCharge?.TotalAmount,
        parentCharge?.DocumentNumber,
        d.Version,
        d.CreatedAt);

    public static ReceiptPaymentLineDto ToPaymentLineDto(ReceiptPaymentLine p) => new(
        p.Id,
        p.PaymentType.ToString(),
        p.Amount,
        p.Currency,
        p.LineDate,
        p.GeneralDetail,
        p.DetailsJson,
        p.SortOrder);

    public static ReceiptPaymentType ParsePaymentType(string value) =>
        Enum.TryParse<ReceiptPaymentType>(value, true, out var t)
            ? t
            : throw new ArgumentException("Invalid payment type.");

    public static DocumentType ParseType(string value) =>
        Enum.TryParse<DocumentType>(value, true, out var t)
            ? t
            : throw new ArgumentException("Invalid document type.");
}

public record SendDocumentEmailRequest(
    Guid ContactId,
    [Required][EmailAddress] string RecipientEmail,
    string? Subject,
    string? BodyHtml);

public record SendDocumentEmailResponse(bool Sent, bool Stub, string Message);
