namespace OrderManagement.Api.Entities;

public class PurchaseReceiptLine
{
    public Guid Id { get; set; }
    public Guid PurchaseReceiptId { get; set; }
    public Guid ProductId { get; set; }
    public Guid? WarehouseId { get; set; }

    public decimal Quantity { get; set; }
    public decimal? UnitPrice { get; set; }
    public string? SupplierSku { get; set; }
    public string? Notes { get; set; }
    public int SortOrder { get; set; }

    public PurchaseReceipt PurchaseReceipt { get; set; } = null!;
    public Product Product { get; set; } = null!;
}
