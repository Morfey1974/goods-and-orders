namespace OrderManagement.Api.Entities;

/// <summary>Operating or home-mixed business expense (not inventory / not COGS).</summary>
public class BusinessExpense
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    public DateTime ExpenseDate { get; set; }
    public bool IsHomeMixed { get; set; }
    public HomeExpenseType? HomeExpenseType { get; set; }
    public OperatingExpenseType? OperatingExpenseType { get; set; }

    public string Description { get; set; } = string.Empty;
    public decimal AmountIls { get; set; }
    public string? VendorName { get; set; }
    public string? InvoiceReference { get; set; }
    public string? Notes { get; set; }

    /// <summary>When set, expense was auto-created from a posted purchase receipt consumable line.</summary>
    public Guid? PurchaseReceiptLineId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<BusinessExpenseDocument> Documents { get; set; } = new List<BusinessExpenseDocument>();
}
