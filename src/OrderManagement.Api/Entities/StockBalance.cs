namespace OrderManagement.Api.Entities;

public class StockBalance
{
    public Guid Id { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid ProductId { get; set; }
    public decimal Quantity { get; set; }

    public Warehouse Warehouse { get; set; } = null!;
    public Product Product { get; set; } = null!;
}
