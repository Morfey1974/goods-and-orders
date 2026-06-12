namespace OrderManagement.Api.Entities;

/// <summary>Fixed asset (נכס קבוע) with linear annual depreciation (פחת).</summary>
public class FixedAsset
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime PurchaseDate { get; set; }
    public decimal CostIls { get; set; }
    public DepreciationAssetCategory Category { get; set; }
    public decimal AnnualDepreciationPercent { get; set; }
    public string? VendorName { get; set; }
    public string? InvoiceReference { get; set; }
    public string? Notes { get; set; }
    public bool IsDisposed { get; set; }
    public DateTime? DisposedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<FixedAssetDocument> Documents { get; set; } = new List<FixedAssetDocument>();
}
