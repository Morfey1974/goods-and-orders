using System.ComponentModel.DataAnnotations;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Dto;

public record TenantProfileDto(
    Guid Id,
    string BusinessName,
    string OwnerFullName,
    string? OsekNumber,
    string? TeudatZehut,
    string Email,
    string? Phone,
    string? Address,
    string? BankBeneficiary,
    string? BankName,
    string? BankBranch,
    string? BankAccountNumber,
    string? BankDetails,
    string DefaultLanguage,
    string TaxRegime,
    string SubscriptionStatus,
    DateTime RegisteredAt,
    DateTime TrialEndsAt,
    int Version);

public record UpdateTenantRequest(
    [Required][MinLength(1)] string BusinessName,
    [Required][MinLength(1)] string OwnerFullName,
    string? OsekNumber,
    [Required][MinLength(1)] string TeudatZehut,
    string? Phone,
    string? Address,
    [Required] string DefaultLanguage,
    int Version);

public record UpdateBankDetailsRequest(
    [Required][MinLength(1)] string BankBeneficiary,
    [Required][MinLength(1)] string BankName,
    string? BankBranch,
    [Required][MinLength(1)] string BankAccountNumber,
    int Version);

public static class TenantMapper
{
    public static TenantProfileDto ToDto(Tenant t) => new(
        t.Id,
        t.BusinessName,
        t.OwnerFullName,
        t.OsekNumber,
        t.TeudatZehut,
        t.Email,
        t.Phone,
        t.Address,
        t.BankBeneficiary,
        t.BankName,
        t.BankBranch,
        t.BankAccountNumber,
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
            lines.Add($"Beneficiary: {t.BankBeneficiary}");
        if (!string.IsNullOrWhiteSpace(t.BankName))
            lines.Add($"Bank: {t.BankName}");
        if (!string.IsNullOrWhiteSpace(t.BankBranch))
            lines.Add($"Branch: {t.BankBranch}");
        if (!string.IsNullOrWhiteSpace(t.BankAccountNumber))
            lines.Add($"Account: {t.BankAccountNumber}");
        return string.Join(Environment.NewLine, lines);
    }
}
