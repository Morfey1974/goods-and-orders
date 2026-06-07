namespace OrderManagement.Api.Entities;

/// <summary>
/// Additional import costs (logistics, customs, tax) on a purchase receipt.
/// Allocated to product line unitCostIls on post; supplier is the service provider (e.g. FedEx).
/// </summary>
public class PurchaseReceiptLandedCostLine
{
    public Guid Id { get; set; }
    public Guid PurchaseReceiptId { get; set; }
    public Guid SupplierId { get; set; }

    public PurchaseReceiptLandedCostCategory Category { get; set; } = PurchaseReceiptLandedCostCategory.Logistics;
    public string Currency { get; set; } = "ILS";
    public decimal Amount { get; set; }
    /// <summary>Resolved in ILS when posted (for reporting).</summary>
    public decimal? AmountIls { get; set; }
    public string? Notes { get; set; }
    public int SortOrder { get; set; }

    public PurchaseReceipt PurchaseReceipt { get; set; } = null!;
    public Supplier Supplier { get; set; } = null!;
}
