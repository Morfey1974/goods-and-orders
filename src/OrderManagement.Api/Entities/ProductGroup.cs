namespace OrderManagement.Api.Entities;

public class ProductGroup
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ProductGroupMember> Members { get; set; } = new List<ProductGroupMember>();
}

public class ProductGroupMember
{
    public Guid ProductGroupId { get; set; }
    public ProductGroup Group { get; set; } = null!;
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;
}
