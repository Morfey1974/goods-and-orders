using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Dto;

public record SupplierContactDto(
    Guid Id,
    string FullName,
    string? Phone,
    string? Email,
    int SortOrder);

public record SupplierContactInput(
    string? FullName,
    string? Phone,
    string? Email);

public record SupplierDto(
    Guid Id,
    string Name,
    string? LegalName,
    string? CountryCode,
    string? TaxId,
    string? ContactPerson,
    string? Email,
    string? Phone,
    string? MobilePhone,
    string? Fax,
    string? Website,
    string? Address,
    string? City,
    string? StateRegion,
    string? ZipCode,
    string? BankBeneficiary,
    string? BankName,
    string? BankBranch,
    string? BankAccountNumber,
    string? BankSwift,
    string? BankIban,
    string DefaultCurrency,
    string? Notes,
    bool IsActive,
    DateTime CreatedAt,
    int Version,
    IReadOnlyList<SupplierContactDto> Contacts);

public record CreateSupplierRequest(
    [Required][MinLength(1)] string Name,
    string? LegalName,
    string? CountryCode,
    string? TaxId,
    string? ContactPerson,
    string? Email,
    string? Phone,
    string? MobilePhone,
    string? Fax,
    string? Website,
    string? Address,
    string? City,
    string? StateRegion,
    string? ZipCode,
    string? BankBeneficiary,
    string? BankName,
    string? BankBranch,
    string? BankAccountNumber,
    string? BankSwift,
    string? BankIban,
    string? DefaultCurrency,
    string? Notes,
    IReadOnlyList<SupplierContactInput>? Contacts);

public record SupplierImportResultDto(
    int ImportedCount,
    int UpdatedCount,
    int SkippedCount,
    int ErrorCount,
    IReadOnlyList<ProductImportErrorDto> Errors);

public record UpdateSupplierRequest(
    [Required][MinLength(1)] string Name,
    string? LegalName,
    string? CountryCode,
    string? TaxId,
    string? ContactPerson,
    string? Email,
    string? Phone,
    string? MobilePhone,
    string? Fax,
    string? Website,
    string? Address,
    string? City,
    string? StateRegion,
    string? ZipCode,
    string? BankBeneficiary,
    string? BankName,
    string? BankBranch,
    string? BankAccountNumber,
    string? BankSwift,
    string? BankIban,
    string? DefaultCurrency,
    string? Notes,
    bool IsActive,
    int Version,
    IReadOnlyList<SupplierContactInput>? Contacts);

public static class SupplierMappers
{
    public static SupplierDto ToDto(Supplier s) => new(
        s.Id,
        s.Name,
        s.LegalName,
        s.CountryCode,
        s.TaxId,
        s.ContactPerson,
        s.Email,
        s.Phone,
        s.MobilePhone,
        s.Fax,
        s.Website,
        s.Address,
        s.City,
        s.StateRegion,
        s.ZipCode,
        s.BankBeneficiary,
        s.BankName,
        s.BankBranch,
        s.BankAccountNumber,
        s.BankSwift,
        s.BankIban,
        s.DefaultCurrency,
        s.Notes,
        s.IsActive,
        s.CreatedAt,
        s.Version,
        s.Contacts
            .OrderBy(c => c.SortOrder)
            .Select(c => new SupplierContactDto(c.Id, c.FullName, c.Phone, c.Email, c.SortOrder))
            .ToList());

    public static void ApplyFields(Supplier s, UpdateSupplierRequest request)
    {
        s.Name = request.Name.Trim();
        s.LegalName = TrimOrNull(request.LegalName);
        s.CountryCode = NormalizeCountry(request.CountryCode);
        s.TaxId = TrimOrNull(request.TaxId);
        s.ContactPerson = TrimOrNull(request.ContactPerson);
        s.Email = TrimOrNull(request.Email);
        s.Phone = TrimOrNull(request.Phone);
        s.MobilePhone = TrimOrNull(request.MobilePhone);
        s.Fax = TrimOrNull(request.Fax);
        s.Website = TrimOrNull(request.Website);
        s.Address = TrimOrNull(request.Address);
        s.City = TrimOrNull(request.City);
        s.StateRegion = TrimOrNull(request.StateRegion);
        s.ZipCode = TrimOrNull(request.ZipCode);
        s.BankBeneficiary = TrimOrNull(request.BankBeneficiary);
        s.BankName = TrimOrNull(request.BankName);
        s.BankBranch = TrimOrNull(request.BankBranch);
        s.BankAccountNumber = TrimOrNull(request.BankAccountNumber);
        s.BankSwift = TrimOrNull(request.BankSwift);
        s.BankIban = TrimOrNull(request.BankIban);
        s.DefaultCurrency = NormalizeCurrency(request.DefaultCurrency);
        s.Notes = TrimOrNull(request.Notes);
    }

    public static void ApplyFields(Supplier s, CreateSupplierRequest request)
    {
        s.Name = request.Name.Trim();
        s.LegalName = TrimOrNull(request.LegalName);
        s.CountryCode = NormalizeCountry(request.CountryCode);
        s.TaxId = TrimOrNull(request.TaxId);
        s.ContactPerson = TrimOrNull(request.ContactPerson);
        s.Email = TrimOrNull(request.Email);
        s.Phone = TrimOrNull(request.Phone);
        s.MobilePhone = TrimOrNull(request.MobilePhone);
        s.Fax = TrimOrNull(request.Fax);
        s.Website = TrimOrNull(request.Website);
        s.Address = TrimOrNull(request.Address);
        s.City = TrimOrNull(request.City);
        s.StateRegion = TrimOrNull(request.StateRegion);
        s.ZipCode = TrimOrNull(request.ZipCode);
        s.BankBeneficiary = TrimOrNull(request.BankBeneficiary);
        s.BankName = TrimOrNull(request.BankName);
        s.BankBranch = TrimOrNull(request.BankBranch);
        s.BankAccountNumber = TrimOrNull(request.BankAccountNumber);
        s.BankSwift = TrimOrNull(request.BankSwift);
        s.BankIban = TrimOrNull(request.BankIban);
        s.DefaultCurrency = NormalizeCurrency(request.DefaultCurrency);
        s.Notes = TrimOrNull(request.Notes);
    }

    public static async Task SyncContactsAsync(
        AppDbContext db,
        Guid supplierId,
        IReadOnlyList<SupplierContactInput>? contacts,
        CancellationToken ct)
    {
        await db.SupplierContacts.Where(c => c.SupplierId == supplierId).ExecuteDeleteAsync(ct);
        if (contacts is null || contacts.Count == 0) return;

        var order = 0;
        foreach (var input in contacts)
        {
            var name = input.FullName?.Trim() ?? "";
            var phone = TrimOrNull(input.Phone);
            var email = TrimOrNull(input.Email);
            if (string.IsNullOrEmpty(name) && phone is null && email is null) continue;

            db.SupplierContacts.Add(new SupplierContact
            {
                Id = Guid.NewGuid(),
                SupplierId = supplierId,
                FullName = string.IsNullOrEmpty(name) ? (email ?? phone ?? "—") : name,
                Phone = phone,
                Email = email,
                SortOrder = order++
            });
        }
    }

    private static string? TrimOrNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? NormalizeCountry(string? code)
    {
        var c = TrimOrNull(code);
        return c is null ? null : c.ToUpperInvariant();
    }

    private static string NormalizeCurrency(string? currency)
    {
        var c = TrimOrNull(currency) ?? "ILS";
        return c.Length > 3 ? c[..3].ToUpperInvariant() : c.ToUpperInvariant();
    }
}
