namespace OrderManagement.Api.Entities;

public class PurchaseReceipt
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SupplierId { get; set; }

    public string ReceiptNumber { get; set; } = string.Empty;
    public string? SupplierInvoiceNumber { get; set; }
    public DateTime DocumentDate { get; set; }
    public string Currency { get; set; } = "ILS";
    public decimal? TotalAmount { get; set; }
    public string? Notes { get; set; }

    public PurchaseReceiptStatus Status { get; set; } = PurchaseReceiptStatus.Draft;
    public DateTime? PostedAt { get; set; }

    public string? DocumentPath { get; set; }
    public string? DocumentFileName { get; set; }
    public string? DocumentContentType { get; set; }

    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Supplier Supplier { get; set; } = null!;
    public ICollection<PurchaseReceiptLine> Lines { get; set; } = new List<PurchaseReceiptLine>();
    /// <summary>When true, landed cost lines are allocated into product unitCostIls on post.</summary>
    public bool ApplyLandedCosts { get; set; }
    public ICollection<PurchaseReceiptLandedCostLine> LandedCostLines { get; set; } =
        new List<PurchaseReceiptLandedCostLine>();
    public ICollection<PurchaseReceiptDocument> Documents { get; set; } =
        new List<PurchaseReceiptDocument>();
}
