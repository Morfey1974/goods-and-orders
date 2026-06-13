namespace OrderManagement.Api.Entities;

/// <summary>Production recipe: components consumed per 1 unit of output product (separate from sales BOM).</summary>
public class AssemblyRecipeLine
{
    public Guid Id { get; set; }
    public Guid ParentProductId { get; set; }
    public Guid ComponentProductId { get; set; }
    public decimal Quantity { get; set; }

    public Product ParentProduct { get; set; } = null!;
    public Product ComponentProduct { get; set; } = null!;
}
