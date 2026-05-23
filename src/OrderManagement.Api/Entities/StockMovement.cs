namespace OrderManagement.Api.Entities;

public class StockMovement
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid ProductId { get; set; }
    public StockMovementType MovementType { get; set; }
    public decimal Quantity { get; set; }
    public decimal BalanceAfter { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Product Product { get; set; } = null!;
}
