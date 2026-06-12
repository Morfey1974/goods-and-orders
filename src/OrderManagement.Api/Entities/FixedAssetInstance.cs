namespace OrderManagement.Api.Entities;

/// <summary>Depreciable fixed asset instance (נכס קבוע) — created from a purchase receipt line or migrated manually.</summary>
public class FixedAssetInstance
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    public Guid? PurchaseReceiptId { get; set; }
    public PurchaseReceipt? PurchaseReceipt { get; set; }
    public Guid? PurchaseReceiptLineId { get; set; }
    public PurchaseReceiptLine? PurchaseReceiptLine { get; set; }

    public DateTime AcquisitionDate { get; set; }
    public DateTime InServiceDate { get; set; }

    /// <summary>Original cost (full invoice amount for עוסק פטור).</summary>
    public decimal OriginalCostIls { get; set; }
    /// <summary>Additions/improvements during the tax year (טופס 1342 col 4).</summary>
    public decimal ChangesCostIls { get; set; }

    public DepreciationAssetCategory Category { get; set; }
    public decimal AnnualDepreciationPercent { get; set; }
    public decimal BusinessUsePercent { get; set; } = 100m;

    public FixedAssetInstanceStatus Status { get; set; } = FixedAssetInstanceStatus.Active;
    public DateTime? DisposedAt { get; set; }

    public string? VendorName { get; set; }
    public string? InvoiceReference { get; set; }
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
