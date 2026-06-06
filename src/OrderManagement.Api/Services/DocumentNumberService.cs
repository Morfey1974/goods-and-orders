using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

/// <summary>
/// Document counters (quotes, orders, charge invoices, receipts) — plain numbers without prefix, like legacy YeshInvoice.
/// Product article codes still use <see cref="ArticleSequenceService"/> with CP-/FG- prefixes.
/// </summary>
public class DocumentNumberService(AppDbContext db)
{
    public static IReadOnlyList<DocumentSequenceKind> AllKinds { get; } =
    [
        DocumentSequenceKind.Quote,
        DocumentSequenceKind.Order,
        DocumentSequenceKind.ChargeInvoice,
        DocumentSequenceKind.Receipt,
    ];

    public static string PrefixFor(DocumentSequenceKind kind) => kind switch
    {
        DocumentSequenceKind.Quote => DocumentTypePrefixes.GetPrefix(DocumentType.Quote),
        DocumentSequenceKind.Order => "O",
        DocumentSequenceKind.ChargeInvoice => DocumentTypePrefixes.GetPrefix(DocumentType.ChargeInvoice),
        DocumentSequenceKind.Receipt => DocumentTypePrefixes.GetPrefix(DocumentType.Receipt),
        _ => "Q",
    };

    public static DocumentSequenceKind KindForDocumentType(DocumentType type) => type switch
    {
        DocumentType.Quote => DocumentSequenceKind.Quote,
        DocumentType.ChargeInvoice => DocumentSequenceKind.ChargeInvoice,
        DocumentType.Receipt => DocumentSequenceKind.Receipt,
        DocumentType.Order => DocumentSequenceKind.Order,
        _ => DocumentSequenceKind.Quote,
    };

    public async Task<string> AllocateNextAsync(Guid tenantId, DocumentType type, CancellationToken ct) =>
        await AllocateNextAsync(tenantId, KindForDocumentType(type), ct);

    public async Task<string> AllocateNextAsync(Guid tenantId, DocumentSequenceKind kind, CancellationToken ct)
    {
        var prefix = PrefixFor(kind);
        var seq = await GetOrCreateSequenceAsync(tenantId, prefix, ct);
        var number = seq.NextNumber;
        seq.NextNumber++;
        await db.SaveChangesAsync(ct);
        return Format(number);
    }

    public async Task BumpSequenceIfNeededAsync(Guid tenantId, DocumentSequenceKind kind, int usedNumber, CancellationToken ct)
    {
        if (usedNumber <= 0) return;
        var prefix = PrefixFor(kind);
        var seq = await GetOrCreateSequenceAsync(tenantId, prefix, ct);
        if (usedNumber >= seq.NextNumber)
            seq.NextNumber = usedNumber + 1;
        await db.SaveChangesAsync(ct);
    }

    public async Task SetNextNumberAsync(Guid tenantId, DocumentSequenceKind kind, int nextNumber, CancellationToken ct)
    {
        if (nextNumber < 1)
            throw new InvalidOperationException("Next number must be at least 1.");

        var prefix = PrefixFor(kind);
        var seq = await GetOrCreateSequenceAsync(tenantId, prefix, ct);
        seq.NextNumber = nextNumber;
        await db.SaveChangesAsync(ct);
    }

    public async Task<int> GetNextNumberAsync(Guid tenantId, DocumentSequenceKind kind, CancellationToken ct)
    {
        var prefix = PrefixFor(kind);
        var seq = await db.ArticleSequences
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.Prefix == prefix, ct);
        return seq?.NextNumber ?? 1;
    }

    public async Task<int?> GetMaxUsedNumberAsync(Guid tenantId, DocumentSequenceKind kind, CancellationToken ct)
    {
        DocumentType? docType = kind switch
        {
            DocumentSequenceKind.Quote => DocumentType.Quote,
            DocumentSequenceKind.ChargeInvoice => DocumentType.ChargeInvoice,
            DocumentSequenceKind.Receipt => DocumentType.Receipt,
            DocumentSequenceKind.Order => null,
            _ => null,
        };

        if (docType is { } dt)
        {
            var numbers = await db.BusinessDocuments
                .Where(d => d.TenantId == tenantId && d.DocumentType == dt)
                .Select(d => d.DocumentNumber)
                .ToListAsync(ct);
            return MaxParsed(numbers);
        }

        var orderNumbers = await db.Orders
            .Where(o => o.TenantId == tenantId)
            .Select(o => o.OrderNumber)
            .ToListAsync(ct);
        var chargeNumbers = await db.Orders
            .Where(o => o.TenantId == tenantId && o.ChargeInvoiceNumber != null)
            .Select(o => o.ChargeInvoiceNumber!)
            .ToListAsync(ct);
        return MaxParsed(orderNumbers.Concat(chargeNumbers));
    }

    public static string Format(int number) => number.ToString(System.Globalization.CultureInfo.InvariantCulture);

    public static int? TryParseNumber(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Trim();
        var dash = text.IndexOf('-');
        if (dash >= 0 && dash < text.Length - 1)
            text = text[(dash + 1)..].TrimStart('0');
        if (int.TryParse(text, System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture, out var n))
            return n;
        return null;
    }

    private static int? MaxParsed(IEnumerable<string> values)
    {
        int? max = null;
        foreach (var v in values)
        {
            var n = TryParseNumber(v);
            if (n is null) continue;
            max = max is null ? n : Math.Max(max.Value, n.Value);
        }
        return max;
    }

    private async Task<ArticleSequence> GetOrCreateSequenceAsync(Guid tenantId, string prefix, CancellationToken ct)
    {
        var seq = await db.ArticleSequences
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.Prefix == prefix, ct);
        if (seq is not null) return seq;

        seq = new ArticleSequence
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Prefix = prefix,
            NextNumber = 1,
        };
        db.ArticleSequences.Add(seq);
        return seq;
    }
}

public enum DocumentSequenceKind
{
    Quote = 0,
    Order = 1,
    ChargeInvoice = 2,
    Receipt = 3,
}
