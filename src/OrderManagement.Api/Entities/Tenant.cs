namespace OrderManagement.Api.Entities;

public class Tenant
{
    public Guid Id { get; set; }
    public string BusinessName { get; set; } = string.Empty;
    /// <summary>Short display name (כינוי בית העסק).</summary>
    public string? BusinessNickname { get; set; }
    /// <summary>Business style / category line on documents.</summary>
    public string? BusinessCategory { get; set; }
    public string OwnerFullName { get; set; } = string.Empty;
    public string? OsekNumber { get; set; }
    public string? TeudatZehut { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? MobilePhone { get; set; }
    public string? Fax { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? ZipCode { get; set; }
    public string? Website { get; set; }
    /// <summary>Field of business (תחום עיסוק).</summary>
    public string? BusinessField { get; set; }
    public string? BankBeneficiary { get; set; }
    /// <summary>Israeli bank code (קוד בנק), e.g. 31.</summary>
    public string? BankCode { get; set; }
    public string? BankName { get; set; }
    public string? BankBranch { get; set; }
    public string? BankAccountNumber { get; set; }
    public string? BankSwift { get; set; }
    public string? BankAba { get; set; }
    public string? BankIban { get; set; }
    public bool ShowBankOnDocuments { get; set; } = true;
    /// <summary>Сводный текст для PDF (формируется из полей банка).</summary>
    public string? BankDetails { get; set; }
    /// <summary>Relative path under uploads root for company logo.</summary>
    public string? LogoPath { get; set; }
    /// <summary>Relative path under uploads root for signature image.</summary>
    public string? SignaturePath { get; set; }
    public string DefaultLanguage { get; set; } = "he";
    public TaxRegime TaxRegime { get; set; } = TaxRegime.Patur;
    /// <summary>Default withholding tax percent (ניכוי במקור) for receipts.</summary>
    public decimal? WithholdingTaxPercent { get; set; }
    public SubscriptionStatus SubscriptionStatus { get; set; } = SubscriptionStatus.Trial;
    public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;
    public DateTime TrialEndsAt { get; set; }
    public DateTime? SubscriptionPaidUntil { get; set; }
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
