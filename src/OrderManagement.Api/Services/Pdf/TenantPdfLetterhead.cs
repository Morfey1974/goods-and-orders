using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services.Pdf;

public sealed record TenantPdfLetterheadModel(
    string SupplierName,
    string? SupplierTagline,
    string? SupplierTaxLine,
    string? SupplierAddress,
    string? SupplierMobile,
    string? SupplierEmail,
    string? SupplierWebsite,
    string? LogoFilePath);

public static class TenantPdfLetterheadBuilder
{
    public static TenantPdfLetterheadModel Build(Tenant tenant, string? logoAbsolutePath) => new(
        tenant.BusinessName,
        tenant.BusinessCategory ?? tenant.BusinessField,
        FormatSupplierTaxLine(tenant),
        FormatAddress(tenant.Address, tenant.City, tenant.ZipCode),
        tenant.MobilePhone ?? tenant.Phone,
        tenant.Email,
        tenant.Website,
        logoAbsolutePath);

    private static string? FormatSupplierTaxLine(Tenant tenant)
    {
        var number = tenant.OsekNumber ?? tenant.TeudatZehut;
        if (string.IsNullOrWhiteSpace(number)) return null;

        var label = tenant.TaxRegime switch
        {
            TaxRegime.Patur => "פטור עוסק",
            TaxRegime.Murshe => "עוסק מורשה",
            _ => "ח.פ"
        };
        return $"{number.Trim()} : {label}";
    }

    private static string? FormatAddress(string? street, string? city, string? zip)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(street)) parts.Add(street.Trim());
        if (!string.IsNullOrWhiteSpace(city)) parts.Add(city.Trim());
        if (!string.IsNullOrWhiteSpace(zip)) parts.Add(zip.Trim());
        if (parts.Count == 0) return null;
        var line = string.Join(", ", parts);
        if (!line.Contains("ישראל", StringComparison.OrdinalIgnoreCase))
            line += ", ישראל";
        return line;
    }
}
