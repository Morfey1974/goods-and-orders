namespace OrderManagement.Api.Entities;

public class StockAssembly
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string AssemblyNumber { get; set; } = string.Empty;
    public DateTime AssemblyDate { get; set; }
    public Guid OutputProductId { get; set; }
    public Guid OutputWarehouseId { get; set; }
    public decimal OutputQuantity { get; set; }
    /// <summary>Extra ₪ for batch (labor, overhead) added to output unit cost.</summary>
    public decimal AdditionalCostIls { get; set; }
    public string? Notes { get; set; }
    public StockAssemblyStatus Status { get; set; } = StockAssemblyStatus.Draft;
    public DateTime? PostedAt { get; set; }
    public Guid? OutputLotId { get; set; }
    public Guid? OutputMovementId { get; set; }
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Product OutputProduct { get; set; } = null!;
    public Warehouse OutputWarehouse { get; set; } = null!;
    public ICollection<StockAssemblyLine> Lines { get; set; } = new List<StockAssemblyLine>();
}
