namespace OrderManagement.Api.Entities;

public class BusinessDocumentLine
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public BusinessDocument Document { get; set; } = null!;
    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
    public int SortOrder { get; set; }
}
