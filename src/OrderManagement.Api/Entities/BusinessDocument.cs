namespace OrderManagement.Api.Entities;

public class BusinessDocument
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public DocumentType DocumentType { get; set; }
    public string DocumentNumber { get; set; } = string.Empty;
    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public Guid? OrderId { get; set; }
    public Order? Order { get; set; }
    public Guid? ParentDocumentId { get; set; }
    public BusinessDocument? ParentDocument { get; set; }
    public DocumentStatus Status { get; set; } = DocumentStatus.Draft;
    public string? Description { get; set; }
    public DateTime IssueDate { get; set; }
    public DateTime? DueDate { get; set; }
    public decimal TotalAmount { get; set; }
    public string? PaymentMethod { get; set; }
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<BusinessDocumentLine> Lines { get; set; } = new List<BusinessDocumentLine>();
}
