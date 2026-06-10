namespace OrderManagement.Api.Dto;

public record IncomeReportLineDto(
    Guid ReceiptId,
    string DocumentNumber,
    DateTime ReceiptDate,
    string CustomerName,
    DateTime PaymentDate,
    string PaymentType,
    string Currency,
    decimal Amount,
    decimal AmountIls,
    string? Detail);

public record IncomeReportDto(
    DateTime? From,
    DateTime? To,
    IReadOnlyList<IncomeReportLineDto> Lines,
    decimal GrandTotalIls,
    int ReceiptCount);

public record ExpenseReportLineDto(
    Guid PurchaseReceiptId,
    string ReceiptNumber,
    DateTime DocumentDate,
    string SupplierName,
    string? SupplierInvoiceNumber,
    string Currency,
    decimal? AmountOriginal,
    decimal AmountIls,
    int LineCount);

public record ExpenseReportDto(
    DateTime? From,
    DateTime? To,
    IReadOnlyList<ExpenseReportLineDto> Lines,
    decimal GrandTotalIls,
    int ReceiptCount);
