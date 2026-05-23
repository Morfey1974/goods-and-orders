namespace OrderManagement.Api.Entities;

public class ArticleSequence
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Prefix { get; set; } = string.Empty;
    public int NextNumber { get; set; } = 1;
}
