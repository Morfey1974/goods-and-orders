namespace OrderManagement.Api.Entities;

public class Supplier
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? LegalName { get; set; }
    public string? CountryCode { get; set; }
    public string? TaxId { get; set; }

    public string? ContactPerson { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? MobilePhone { get; set; }
    public string? Fax { get; set; }
    public string? Website { get; set; }

    public string? Address { get; set; }
    public string? City { get; set; }
    public string? StateRegion { get; set; }
    public string? ZipCode { get; set; }

    public string? BankBeneficiary { get; set; }
    public string? BankName { get; set; }
    public string? BankBranch { get; set; }
    public string? BankAccountNumber { get; set; }
    public string? BankSwift { get; set; }
    public string? BankIban { get; set; }

    public string DefaultCurrency { get; set; } = "ILS";
    public string? Notes { get; set; }

    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<SupplierContact> Contacts { get; set; } = new List<SupplierContact>();
}
