namespace OrderManagement.Api.Entities;

public class ReceiptPaymentLine
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public BusinessDocument Document { get; set; } = null!;
    public ReceiptPaymentType PaymentType { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "ILS";
    public DateTime? LineDate { get; set; }
    public string? GeneralDetail { get; set; }
    /// <summary>JSON object with payment-type-specific fields (bank, check, card, etc.).</summary>
    public string? DetailsJson { get; set; }
    public int SortOrder { get; set; }
}
