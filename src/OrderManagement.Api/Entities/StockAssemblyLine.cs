namespace OrderManagement.Api.Entities;

public class StockAssemblyLine
{
    public Guid Id { get; set; }
    public Guid StockAssemblyId { get; set; }
    public Guid ProductId { get; set; }
    /// <summary>Quantity per one output unit; total issue = Quantity × assembly output qty at post.</summary>
    public decimal Quantity { get; set; }
    public int SortOrder { get; set; }
    public Guid? IssueMovementId { get; set; }

    public StockAssembly StockAssembly { get; set; } = null!;
    public Product Product { get; set; } = null!;
}
