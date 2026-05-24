namespace OrderManagement.Api.Entities;

/// <summary>Contact person at customer (איש קשר).</summary>
public class CustomerContact
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public int SortOrder { get; set; }

    public Customer? Customer { get; set; }
}
