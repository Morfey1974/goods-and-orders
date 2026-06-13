namespace OrderManagement.Api.Entities;

/// <summary>Links a receipt to one or more charge invoices with the allocated amount.</summary>
public class ReceiptChargeAllocation
{
    public Guid Id { get; set; }
    public Guid ReceiptId { get; set; }
    public BusinessDocument Receipt { get; set; } = null!;
    public Guid ChargeInvoiceId { get; set; }
    public BusinessDocument ChargeInvoice { get; set; } = null!;
    public decimal AllocatedAmount { get; set; }
}
