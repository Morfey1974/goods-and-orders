using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

/// <summary>Import suppliers from Yesh / legacy CSV export (Hebrew headers, שם הספק).</summary>
public class SupplierImportService(AppDbContext db)
{
    private static readonly string[][] HeaderNameKeys = [["שם הספק", "supplier name", "name"]];
    private static readonly string[][] HeaderLegalKeys = [["בית העסק", "legal"]];
    private static readonly string[][] HeaderEmailKeys = [["דואר אלקטרוני", "email"]];
    private static readonly string[][] HeaderTaxKeys = [["מספר עוסק", "vat", "tax"]];
    private static readonly string[][] HeaderCreatedKeys = [["תאריך יצירה", "created"]];
    private static readonly string[][] HeaderStatusKeys = [["סטטוס", "status"]];
    private static readonly string[][] HeaderAddressKeys = [["כתובת", "address"]];
    private static readonly string[][] HeaderZipKeys = [["מיקוד", "zip"]];
    private static readonly string[][] HeaderCityKeys = [["עיר", "city"]];
    private static readonly string[][] HeaderCountryKeys = [["קוד מדינה", "country"]];
    private static readonly string[][] HeaderPhoneKeys = [["טלפון", "phone"]];
    private static readonly string[][] HeaderFaxKeys = [["פקס", "fax"]];
    private static readonly string[][] HeaderMobileKeys = [["טלפון נייד", "mobile"]];
    private static readonly string[][] HeaderExternalIdKeys = [["מזהה לקוח", "external id"]];

    public async Task<SupplierImportResultDto> ImportCsvAsync(
        Guid tenantId,
        Stream csvStream,
        bool updateExisting,
        CancellationToken ct)
    {
        var imported = 0;
        var updated = 0;
        var skipped = 0;
        var errors = new List<ProductImportErrorDto>();
        var lineNo = 0;
        ColumnMap? columns = null;

        var existingByName = new Dictionary<string, Supplier>(StringComparer.Ordinal);
        foreach (var s in await db.Suppliers.Where(x => x.TenantId == tenantId).ToListAsync(ct))
            existingByName.TryAdd(NormalizeName(s.Name), s);

        using var reader = new StreamReader(csvStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);

        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync(ct);
            lineNo++;
            if (string.IsNullOrWhiteSpace(line)) continue;

            var cells = ParseCsvRecord(line);
            if (cells.Count == 0) continue;

            if (columns is null)
            {
                if (LooksLikeHeader(cells))
                {
                    columns = ColumnMap.FromHeader(cells);
                    continue;
                }

                columns = ColumnMap.YeshProvidersDefault();
            }

            var row = MapRow(cells, columns);
            if (string.IsNullOrWhiteSpace(row.Name))
            {
                errors.Add(new ProductImportErrorDto(lineNo, "Missing supplier name."));
                continue;
            }

            var dedupeKey = NormalizeName(row.Name);
            if (existingByName.TryGetValue(dedupeKey, out var existing))
            {
                if (!updateExisting)
                {
                    skipped++;
                    continue;
                }

                try
                {
                    ApplyRow(existing, row);
                    existing.Version++;
                    existing.UpdatedAt = DateTime.UtcNow;
                    await db.SaveChangesAsync(ct);
                    updated++;
                }
                catch (Exception ex)
                {
                    errors.Add(new ProductImportErrorDto(lineNo, ex.Message));
                }

                continue;
            }

            try
            {
                var now = DateTime.UtcNow;
                var supplier = new Supplier
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CreatedAt = row.CreatedAt ?? now,
                    UpdatedAt = now
                };
                ApplyRow(supplier, row);

                db.Suppliers.Add(supplier);
                await db.SaveChangesAsync(ct);

                existingByName[dedupeKey] = supplier;
                imported++;
            }
            catch (Exception ex)
            {
                errors.Add(new ProductImportErrorDto(lineNo, ex.Message));
            }
        }

        if (columns is null)
            errors.Add(new ProductImportErrorDto(0, "File is empty or has no data rows."));

        return new SupplierImportResultDto(imported, updated, skipped, errors.Count, errors);
    }

    private static void ApplyRow(Supplier s, ParsedRow row)
    {
        s.Name = row.Name;
        s.LegalName = row.LegalName;
        s.Email = row.Email;
        s.TaxId = row.TaxId;
        s.Phone = row.Phone;
        s.MobilePhone = row.MobilePhone;
        s.Fax = row.Fax;
        s.Address = row.Address;
        s.City = row.City;
        s.ZipCode = row.ZipCode;
        s.CountryCode = row.CountryCode;
        s.DefaultCurrency = row.CountryCode == "IL" ? "ILS" : "USD";
        s.Notes = row.Notes;
        s.IsActive = true;
        if (row.CreatedAt.HasValue)
            s.CreatedAt = row.CreatedAt.Value;
    }

    private static ParsedRow MapRow(List<string> cells, ColumnMap col)
    {
        var name = col.Get(cells, col.Name);

        return new ParsedRow(
            Name: name,
            LegalName: NullIfEmpty(col.Get(cells, col.LegalName)),
            Email: NullIfEmpty(col.Get(cells, col.Email)),
            TaxId: NullIfEmpty(NormalizeTaxId(col.Get(cells, col.TaxId))),
            Phone: NullIfEmpty(col.Get(cells, col.Phone)),
            MobilePhone: NullIfEmpty(col.Get(cells, col.Mobile)),
            Fax: NullIfEmpty(col.Get(cells, col.Fax)),
            Address: NullIfEmpty(col.Get(cells, col.Address)),
            City: NullIfEmpty(col.Get(cells, col.City)),
            ZipCode: NullIfEmpty(col.Get(cells, col.Zip)),
            CountryCode: NormalizeCountry(col.Get(cells, col.Country)),
            Notes: null,
            IsActive: ParseStatus(col.Get(cells, col.Status)),
            CreatedAt: ParseDate(col.Get(cells, col.Created)));
    }

    private static string NormalizeName(string name) => name.Trim().ToLowerInvariant();

    private static string? NormalizeTaxId(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var digits = Regex.Replace(raw, @"\D", "");
        return digits.Length > 0 ? digits : raw.Trim();
    }

    private static string? NormalizeCountry(string? raw)
    {
        var c = NullIfEmpty(raw);
        if (c is null) return null;
        return c.Length > 2 ? c[..2].ToUpperInvariant() : c.ToUpperInvariant();
    }

    private static bool ParseStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return true;
        if (status.Contains("לא פעיל", StringComparison.OrdinalIgnoreCase) ||
            status.Contains("inactive", StringComparison.OrdinalIgnoreCase))
            return false;
        return true;
    }

    private static DateTime? ParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (DateTime.TryParseExact(raw.Trim(), ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd"],
                CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
            return DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        if (DateTime.TryParse(raw, CultureInfo.GetCultureInfo("he-IL"), DateTimeStyles.AssumeUniversal, out dt))
            return DateTime.SpecifyKind(dt.Date, DateTimeKind.Utc);
        return null;
    }

    private static string? NullIfEmpty(string? s) =>
        string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static bool LooksLikeHeader(List<string> cells) =>
        cells.Any(c => c.Contains("שם הספק", StringComparison.OrdinalIgnoreCase));

    private static List<string> ParseCsvRecord(string line)
    {
        line = line.Trim();
        if (line.Length == 0) return [];

        var parts = SplitCsvLine(line);
        if (parts.Count == 1 && parts[0].Contains(','))
            parts = SplitCsvLine(UnwrapOuterQuotes(parts[0]));

        return parts.Select(NormalizeCell).ToList();
    }

    private static string UnwrapOuterQuotes(string s)
    {
        var t = s.Trim();
        if (t.Length >= 2 && t[0] == '"' && t[^1] == '"')
            return t[1..^1].Replace("\"\"", "\"");
        return t;
    }

    private static string NormalizeCell(string cell)
    {
        var t = cell.Trim();
        if (t.Length >= 2 && t[0] == '"' && t[^1] == '"')
            t = t[1..^1];
        return t.Replace("\"\"", "\"").Trim();
    }

    private static List<string> SplitCsvLine(string line)
    {
        var delimiter = line.Count(c => c == ';') > line.Count(c => c == ',') ? ';' : ',';
        var result = new List<string>();
        var current = new StringBuilder();
        var inQuotes = false;

        foreach (var ch in line)
        {
            if (ch == '"')
            {
                inQuotes = !inQuotes;
                continue;
            }
            if (ch == delimiter && !inQuotes)
            {
                result.Add(current.ToString());
                current.Clear();
                continue;
            }
            current.Append(ch);
        }
        result.Add(current.ToString());
        return result;
    }

    private sealed record ParsedRow(
        string Name,
        string? LegalName,
        string? Email,
        string? TaxId,
        string? Phone,
        string? MobilePhone,
        string? Fax,
        string? Address,
        string? City,
        string? ZipCode,
        string? CountryCode,
        string? Notes,
        bool IsActive,
        DateTime? CreatedAt);

    private sealed class ColumnMap
    {
        public int Name { get; init; }
        public int LegalName { get; init; }
        public int Email { get; init; }
        public int TaxId { get; init; }
        public int Created { get; init; }
        public int Status { get; init; }
        public int Address { get; init; }
        public int Zip { get; init; }
        public int City { get; init; }
        public int Country { get; init; }
        public int Phone { get; init; }
        public int Fax { get; init; }
        public int Mobile { get; init; }
        public int ExternalId { get; init; }

        public string Get(List<string> cells, int index)
        {
            if (index < 0 || index >= cells.Count) return string.Empty;
            return cells[index];
        }

        public static ColumnMap FromHeader(List<string> header)
        {
            int Idx(string[][] keys)
            {
                for (var i = 0; i < header.Count; i++)
                {
                    var h = header[i].Trim();
                    foreach (var aliases in keys)
                    {
                        if (aliases.Any(a => h.Contains(a, StringComparison.OrdinalIgnoreCase)))
                            return i;
                    }
                }
                return -1;
            }

            var defaults = YeshProvidersDefault();
            int Pick(int idx, int fallback) => idx >= 0 ? idx : fallback;

            return new ColumnMap
            {
                Name = Pick(Idx(HeaderNameKeys), defaults.Name),
                LegalName = Pick(Idx(HeaderLegalKeys), defaults.LegalName),
                Email = Pick(Idx(HeaderEmailKeys), defaults.Email),
                TaxId = Pick(Idx(HeaderTaxKeys), defaults.TaxId),
                Created = Pick(Idx(HeaderCreatedKeys), defaults.Created),
                Status = Pick(Idx(HeaderStatusKeys), defaults.Status),
                Address = Pick(Idx(HeaderAddressKeys), defaults.Address),
                Zip = Pick(Idx(HeaderZipKeys), defaults.Zip),
                City = Pick(Idx(HeaderCityKeys), defaults.City),
                Country = Pick(Idx(HeaderCountryKeys), defaults.Country),
                Phone = Pick(Idx(HeaderPhoneKeys), defaults.Phone),
                Fax = Pick(Idx(HeaderFaxKeys), defaults.Fax),
                Mobile = Pick(Idx(HeaderMobileKeys), defaults.Mobile),
                ExternalId = Pick(Idx(HeaderExternalIdKeys), defaults.ExternalId),
            };
        }

        public static ColumnMap YeshProvidersDefault() => new()
        {
            Name = 0,
            LegalName = 1,
            Email = 2,
            TaxId = 3,
            Created = 4,
            Status = 5,
            Address = 6,
            Zip = 7,
            City = 8,
            Country = 11,
            Phone = 13,
            Fax = 14,
            Mobile = 15,
            ExternalId = 10,
        };
    }
}
