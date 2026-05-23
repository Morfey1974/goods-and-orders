namespace OrderManagement.Api.Entities;

public class Warehouse
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public WarehouseKind Kind { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
