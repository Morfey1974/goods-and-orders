namespace OrderManagement.Api.Entities;

public class PurchaseReceiptDocument
{
    public Guid Id { get; set; }
    public Guid PurchaseReceiptId { get; set; }

    public string FilePath { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public PurchaseReceipt PurchaseReceipt { get; set; } = null!;
}
