namespace OrderManagement.Api.Entities;

public class Customer
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    /// <summary>Display name in lists (שם הלקוח).</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Name printed on documents (שם על המסמך).</summary>
    public string? DocumentName { get; set; }

    public string? Nickname { get; set; }
    public string? ContactPerson { get; set; }
    public string? OsekNumber { get; set; }
    public string? TeudatZehut { get; set; }
    public string? BusinessCategory { get; set; }
    public string? PaymentTerms { get; set; }

    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? MobilePhone { get; set; }
    public string? Fax { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? ZipCode { get; set; }
    public string? Website { get; set; }

    public string? BankBeneficiary { get; set; }
    public string? BankCode { get; set; }
    public string? BankName { get; set; }
    public string? BankBranch { get; set; }
    public string? BankAccountNumber { get; set; }
    public string? BankSwift { get; set; }
    public string? BankAba { get; set; }
    public string? BankIban { get; set; }

    public string? LogoPath { get; set; }

    public decimal DefaultDiscountPercent { get; set; }
    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<CustomerContact> Contacts { get; set; } = new List<CustomerContact>();
}
