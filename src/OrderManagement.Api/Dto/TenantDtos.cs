using System.ComponentModel.DataAnnotations;

using OrderManagement.Api.Entities;



namespace OrderManagement.Api.Dto;



public record TenantProfileDto(

    Guid Id,

    string BusinessName,

    string? BusinessNickname,

    string? BusinessCategory,

    string OwnerFullName,

    string? OsekNumber,

    string? TeudatZehut,

    string Email,

    string? Phone,

    string? MobilePhone,

    string? Fax,

    string? Address,

    string? City,

    string? ZipCode,

    string? Website,

    string? BusinessField,

    string? BankBeneficiary,

    string? BankCode,

    string? BankName,

    string? BankBranch,

    string? BankAccountNumber,

    string? BankSwift,

    string? BankAba,

    string? BankIban,

    bool ShowBankOnDocuments,

    string? BankDetails,

    string DefaultLanguage,

    string TaxRegime,

    string SubscriptionStatus,

    DateTime RegisteredAt,

    DateTime TrialEndsAt,

    int Version);



public record UpdateTenantRequest(

    [Required][MinLength(1)] string BusinessName,

    string? BusinessNickname,

    string? BusinessCategory,

    [Required][MinLength(1)] string OwnerFullName,

    string? OsekNumber,

    [Required][MinLength(1)] string TeudatZehut,

    [Required][EmailAddress] string Email,

    string? Phone,

    string? MobilePhone,

    string? Fax,

    string? Address,

    string? City,

    string? ZipCode,

    string? Website,

    string? BusinessField,

    [Required] string DefaultLanguage,

    int Version);



public record UpdateBankDetailsRequest(

    [Required][MinLength(1)] string BankBeneficiary,

    [Required][MinLength(1)] string BankCode,

    string? BankName,

    string? BankBranch,

    [Required][MinLength(1)] string BankAccountNumber,

    string? BankSwift,

    string? BankAba,

    string? BankIban,

    bool ShowBankOnDocuments,

    int Version);



public static class TenantMapper

{

    public static TenantProfileDto ToDto(Tenant t) => new(

        t.Id,

        t.BusinessName,

        t.BusinessNickname,

        t.BusinessCategory,

        t.OwnerFullName,

        t.OsekNumber,

        t.TeudatZehut,

        t.Email,

        t.Phone,

        t.MobilePhone,

        t.Fax,

        t.Address,

        t.City,

        t.ZipCode,

        t.Website,

        t.BusinessField,

        t.BankBeneficiary,

        t.BankCode,

        t.BankName,

        t.BankBranch,

        t.BankAccountNumber,

        t.BankSwift,

        t.BankAba,

        t.BankIban,

        t.ShowBankOnDocuments,

        t.BankDetails,

        t.DefaultLanguage,

        t.TaxRegime.ToString(),

        t.SubscriptionStatus.ToString(),

        t.RegisteredAt,

        t.TrialEndsAt,

        t.Version);



    public static string ComposeBankDetails(Tenant t)

    {

        var lines = new List<string>();

        if (!string.IsNullOrWhiteSpace(t.BankBeneficiary))

            lines.Add($"Beneficiary / מוטב: {t.BankBeneficiary.Trim()}");

        if (!string.IsNullOrWhiteSpace(t.BankCode) || !string.IsNullOrWhiteSpace(t.BankName))

        {

            var bank = string.Join(" ", new[] { t.BankCode?.Trim(), t.BankName?.Trim() }.Where(s => !string.IsNullOrEmpty(s)));

            lines.Add($"Bank / בנק: {bank}");

        }

        if (!string.IsNullOrWhiteSpace(t.BankBranch))

            lines.Add($"Branch / סניף: {t.BankBranch.Trim()}");

        if (!string.IsNullOrWhiteSpace(t.BankAccountNumber))

            lines.Add($"Account / חשבון: {t.BankAccountNumber.Trim()}");

        if (!string.IsNullOrWhiteSpace(t.BankIban))

            lines.Add($"IBAN: {t.BankIban.Trim()}");

        if (!string.IsNullOrWhiteSpace(t.BankSwift))

            lines.Add($"SWIFT: {t.BankSwift.Trim()}");

        if (!string.IsNullOrWhiteSpace(t.BankAba))

            lines.Add($"ABA: {t.BankAba.Trim()}");

        return string.Join(Environment.NewLine, lines);

    }

}


