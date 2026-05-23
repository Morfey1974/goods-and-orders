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
    string? PaymentMethod,
    IReadOnlyList<DocumentLineDto> Lines,
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

public record CreateDocumentRequest(
    [Required] string DocumentType,
    [Required] Guid CustomerId,
    string? Description,
    DateTime? IssueDate,
    DateTime? DueDate,
    string? PaymentMethod,
    Guid? ParentDocumentId,
    Guid? OrderId,
    [MinLength(1)] IReadOnlyList<DocumentLineInput>? Lines);

public record RecordPaymentRequest(
    string? PaymentMethod,
    DateTime? PaymentDate);

public static class DocumentMappers
{
    public static DocumentDto ToDto(BusinessDocument d) => new(
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
        d.PaymentMethod,
        d.Lines.OrderBy(l => l.SortOrder).Select(l => new DocumentLineDto(
            l.Id,
            l.ProductId,
            l.Description,
            l.Quantity,
            l.UnitPrice,
            l.LineTotal,
            l.SortOrder)).ToList(),
        d.Version,
        d.CreatedAt);

    public static DocumentType ParseType(string value) =>
        Enum.TryParse<DocumentType>(value, true, out var t)
            ? t
            : throw new ArgumentException("Invalid document type.");
}
