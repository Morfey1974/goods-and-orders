namespace OrderManagement.Api.Entities;

public class Order
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public OrderStatus Status { get; set; } = OrderStatus.Draft;
    public string? Notes { get; set; }
    /// <summary>חשבון חיוב / חשבון עסקה (H-) — for עוסק פטור treated the same.</summary>
    public string? ChargeInvoiceNumber { get; set; }
    /// <summary>When H- was issued; stock is deducted at this moment.</summary>
    public DateTime? ChargeInvoiceIssuedAt { get; set; }
    public bool StockDeducted { get; set; }
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<OrderLine> Lines { get; set; } = new List<OrderLine>();
}
