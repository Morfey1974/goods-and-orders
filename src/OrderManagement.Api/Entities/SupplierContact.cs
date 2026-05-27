namespace OrderManagement.Api.Entities;

public class SupplierContact
{
    public Guid Id { get; set; }
    public Guid SupplierId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public int SortOrder { get; set; }

    public Supplier Supplier { get; set; } = null!;
}
