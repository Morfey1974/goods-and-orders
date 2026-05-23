namespace OrderManagement.Api.Entities;

public class TenantComplianceDocument
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public TenantComplianceDocumentKind Kind { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/pdf";
    public long FileSizeBytes { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

    public Tenant? Tenant { get; set; }
}
