namespace OrderManagement.Api.Entities;

public class BomLine
{
    public Guid Id { get; set; }
    public Guid ParentProductId { get; set; }
    public Guid ComponentProductId { get; set; }
    public decimal Quantity { get; set; }

    public Product ParentProduct { get; set; } = null!;
    public Product ComponentProduct { get; set; } = null!;
}
