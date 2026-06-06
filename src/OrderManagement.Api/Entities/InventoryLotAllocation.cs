namespace OrderManagement.Api.Entities;

/// <summary>Portion of an issue movement consumed from a specific FIFO lot.</summary>
public class InventoryLotAllocation
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid StockMovementId { get; set; }
    public Guid InventoryLotId { get; set; }

    public decimal Quantity { get; set; }
    public decimal UnitCostIls { get; set; }
    public decimal TotalCostIls { get; set; }

    public InventoryLot Lot { get; set; } = null!;
    public StockMovement StockMovement { get; set; } = null!;
}
