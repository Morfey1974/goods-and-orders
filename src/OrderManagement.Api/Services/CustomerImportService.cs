using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

/// <summary>Import customers from Yesh / legacy CSV export (Hebrew headers).</summary>
public class CustomerImportService(AppDbContext db)
{
    private static readonly string[] HeaderNameKeys = ["שם הלקוח", "name", "customer name"];
    private static readonly string[] HeaderEmailKeys = ["דואר אלקטרוני", "email"];
    private static readonly string[] HeaderIdKeys = ["תעודת זהות/ח.פ", "ת.ז", "ח.פ", "id"];
    private static readonly string[] HeaderCreatedKeys = ["תאריך יצירה", "created"];
    private static readonly string[] HeaderStatusKeys = ["סטטוס", "status"];
    private static readonly string[] HeaderAddressKeys = ["כתובת", "address"];
    private static readonly string[] HeaderZipKeys = ["מיקוד", "zip"];
    private static readonly string[] HeaderCityKeys = ["עיר", "city"];
    private static readonly string[] HeaderPhoneKeys = ["טלפון", "phone"];
    private static readonly string[] HeaderFaxKeys = ["פקס", "fax"];
    private static readonly string[] HeaderMobileKeys = ["טלפון נייד", "mobile"];
    private static readonly string[] HeaderContactKeys = ["שם איש קשר", "contact"];
    private static readonly string[] HeaderNotesKeys = ["הערות", "notes"];

    public async Task<CustomerImportResultDto> ImportCsvAsync(
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

        var existingByName = new Dictionary<string, Customer>(StringComparer.Ordinal);
        foreach (var c in await db.Customers.Where(x => x.TenantId == tenantId).ToListAsync(ct))
        {
            var key = NormalizeName(c.Name);
            existingByName.TryAdd(key, c);
        }

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

                columns = ColumnMap.YeshDefault();
            }

            var row = MapRow(cells, columns);
            if (string.IsNullOrWhiteSpace(row.Name))
            {
                errors.Add(new ProductImportErrorDto(lineNo, "Missing customer name."));
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
                var customer = new Customer
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CreatedAt = row.CreatedAt ?? now,
                    UpdatedAt = now
                };
                ApplyRow(customer, row);

                db.Customers.Add(customer);
                await db.SaveChangesAsync(ct);

                existingByName[dedupeKey] = customer;

                imported++;
            }
            catch (Exception ex)
            {
                errors.Add(new ProductImportErrorDto(lineNo, ex.Message));
            }
        }

        if (columns is null)
            errors.Add(new ProductImportErrorDto(0, "File is empty or has no data rows."));

        return new CustomerImportResultDto(imported, updated, skipped, errors.Count, errors);
    }

    private static void ApplyRow(Customer c, ParsedRow row)
    {
        c.Name = row.Name;
        c.DocumentName = row.DocumentName;
        c.Email = row.Email;
        c.Phone = row.Phone;
        c.MobilePhone = row.MobilePhone;
        c.Fax = row.Fax;
        c.Address = row.Address;
        c.City = row.City;
        c.ZipCode = row.ZipCode;
        c.ContactPerson = row.ContactPerson;
        c.OsekNumber = row.OsekNumber;
        c.TeudatZehut = row.TeudatZehut;
        c.BusinessCategory = row.Notes;
        c.IsActive = row.IsActive;
        if (row.CreatedAt.HasValue)
            c.CreatedAt = row.CreatedAt.Value;
    }

    private static ParsedRow MapRow(List<string> cells, ColumnMap col)
    {
        var name = col.Get(cells, col.Name);
        var idRaw = col.Get(cells, col.IdNumber);
        ParseIdNumber(idRaw, out var teudat, out var osek);

        return new ParsedRow(
            Name: name,
            DocumentName: string.IsNullOrWhiteSpace(name) ? null : name,
            Email: NullIfEmpty(col.Get(cells, col.Email)),
            Phone: NullIfEmpty(col.Get(cells, col.Phone)),
            MobilePhone: NullIfEmpty(col.Get(cells, col.Mobile)),
            Fax: NullIfEmpty(col.Get(cells, col.Fax)),
            Address: NullIfEmpty(col.Get(cells, col.Address)),
            City: NullIfEmpty(col.Get(cells, col.City)),
            ZipCode: NullIfEmpty(col.Get(cells, col.Zip)),
            ContactPerson: NullIfEmpty(col.Get(cells, col.Contact)),
            Notes: NullIfEmpty(col.Get(cells, col.Notes)),
            OsekNumber: osek,
            TeudatZehut: teudat,
            IsActive: ParseStatus(col.Get(cells, col.Status)),
            CreatedAt: ParseDate(col.Get(cells, col.Created)));
    }

    private static string NormalizeName(string name) =>
        name.Trim().ToLowerInvariant();

    private static void ParseIdNumber(string? raw, out string? teudat, out string? osek)
    {
        teudat = null;
        osek = null;
        if (string.IsNullOrWhiteSpace(raw)) return;

        var digits = Regex.Replace(raw, @"\D", "");
        if (digits.Length == 0) return;

        if (digits.Length <= 9)
            teudat = digits.PadLeft(9, '0');
        else
            osek = digits;
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
        cells.Any(c => c.Contains("שם הלקוח", StringComparison.OrdinalIgnoreCase) ||
                     c.Contains("דואר אלקטרוני", StringComparison.OrdinalIgnoreCase));

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
        string? DocumentName,
        string? Email,
        string? Phone,
        string? MobilePhone,
        string? Fax,
        string? Address,
        string? City,
        string? ZipCode,
        string? ContactPerson,
        string? Notes,
        string? OsekNumber,
        string? TeudatZehut,
        bool IsActive,
        DateTime? CreatedAt);

    private sealed class ColumnMap
    {
        public int Name { get; init; }
        public int Email { get; init; }
        public int IdNumber { get; init; }
        public int Created { get; init; }
        public int Status { get; init; }
        public int Address { get; init; }
        public int Zip { get; init; }
        public int City { get; init; }
        public int Phone { get; init; }
        public int Fax { get; init; }
        public int Mobile { get; init; }
        public int Contact { get; init; }
        public int Notes { get; init; }

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

            var defaults = YeshDefault();
            int Pick(int idx, int fallback) => idx >= 0 ? idx : fallback;

            return new ColumnMap
            {
                Name = Pick(Idx([HeaderNameKeys]), defaults.Name),
                Email = Pick(Idx([HeaderEmailKeys]), defaults.Email),
                IdNumber = Pick(Idx([HeaderIdKeys]), defaults.IdNumber),
                Created = Pick(Idx([HeaderCreatedKeys]), defaults.Created),
                Status = Pick(Idx([HeaderStatusKeys]), defaults.Status),
                Address = Pick(Idx([HeaderAddressKeys]), defaults.Address),
                Zip = Pick(Idx([HeaderZipKeys]), defaults.Zip),
                City = Pick(Idx([HeaderCityKeys]), defaults.City),
                Phone = Pick(Idx([HeaderPhoneKeys]), defaults.Phone),
                Fax = Pick(Idx([HeaderFaxKeys]), defaults.Fax),
                Mobile = Pick(Idx([HeaderMobileKeys]), defaults.Mobile),
                Contact = Pick(Idx([HeaderContactKeys]), defaults.Contact),
                Notes = Pick(Idx([HeaderNotesKeys]), defaults.Notes),
            };
        }

        public static ColumnMap YeshDefault() => new()
        {
            Name = 0,
            Email = 1,
            IdNumber = 2,
            Created = 3,
            Status = 4,
            Address = 5,
            Zip = 6,
            City = 7,
            Phone = 13,
            Fax = 14,
            Mobile = 15,
            Contact = 18,
            Notes = 19,
        };
    }
}
