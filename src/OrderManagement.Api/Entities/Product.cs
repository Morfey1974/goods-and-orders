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
    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<BomLine> BomLines { get; set; } = new List<BomLine>();
}
