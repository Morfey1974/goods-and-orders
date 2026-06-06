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
    /// <summary>Business date of the movement (may differ from CreatedAt for backdated documents).</summary>
    public DateTime MovementDate { get; set; } = DateTime.UtcNow;
    public decimal? UnitCost { get; set; }
    public decimal? TotalCost { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Product Product { get; set; } = null!;
}
