namespace OrderManagement.Api.Entities;

public class Product
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string ArticleCode { get; set; } = string.Empty;
    /// <summary>מק"ט из старой системы (для импорта).</summary>
    public string? LegacySku { get; set; }
    public ProductType ProductType { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>Relative path under uploads root, e.g. tenantId/productId.jpg</summary>
    public string? ImagePath { get; set; }
    public decimal UnitPrice { get; set; }
    public bool ShowBomInQuote { get; set; }
    public bool ShowBomInInvoice { get; set; }
    /// <summary>When false, warehouse balances and receipt/issue movements are skipped.</summary>
    public bool TrackInventory { get; set; } = false;
    /// <summary>Explicit warehouse for stock; when null, defaults by product type.</summary>
    public Guid? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<BomLine> BomLines { get; set; } = new List<BomLine>();
}
