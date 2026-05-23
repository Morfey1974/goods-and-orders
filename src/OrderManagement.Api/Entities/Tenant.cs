namespace OrderManagement.Api.Entities;

public class Tenant
{
    public Guid Id { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    public string OwnerFullName { get; set; } = string.Empty;
    public string? OsekNumber { get; set; }
    public string? TeudatZehut { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? BankBeneficiary { get; set; }
    public string? BankName { get; set; }
    public string? BankBranch { get; set; }
    public string? BankAccountNumber { get; set; }
    /// <summary>Сводный текст для PDF (формируется из полей банка).</summary>
    public string? BankDetails { get; set; }
    public string DefaultLanguage { get; set; } = "he";
    public TaxRegime TaxRegime { get; set; } = TaxRegime.Patur;
    public SubscriptionStatus SubscriptionStatus { get; set; } = SubscriptionStatus.Trial;
    public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;
    public DateTime TrialEndsAt { get; set; }
    public DateTime? SubscriptionPaidUntil { get; set; }
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
