namespace OrderManagement.Api.Entities;

/// <summary>Cached weighted-average unit cost (WAC) per product and warehouse.</summary>
public class InventoryAverageCost
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ProductId { get; set; }
    public Guid WarehouseId { get; set; }

    public decimal UnitCostIls { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Product Product { get; set; } = null!;
    public Warehouse Warehouse { get; set; } = null!;
}
