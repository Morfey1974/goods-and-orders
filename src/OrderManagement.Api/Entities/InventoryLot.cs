namespace OrderManagement.Api.Entities;

/// <summary>FIFO cost layer — one receipt batch at a fixed ILS unit cost.</summary>
public class InventoryLot
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ProductId { get; set; }
    public Guid WarehouseId { get; set; }

    public decimal QuantityRemaining { get; set; }
    public decimal UnitCostIls { get; set; }
    public DateTime ReceivedAt { get; set; }

    public InventoryLotSource SourceType { get; set; }
    public Guid? SourceId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Product Product { get; set; } = null!;
    public Warehouse Warehouse { get; set; } = null!;
}
