using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public partial class DocumentImportService(AppDbContext db, DocumentNumberService documentNumbers)
{
    public async Task<DocumentImportResultDto> ImportYeshCsvAsync(Guid tenantId, Stream csvStream, CancellationToken ct)
    {
        var rows = ParseCsv(csvStream);
        if (rows.Count == 0)
            return new DocumentImportResultDto(0, 0, 0, [new DocumentImportErrorDto(1, "File is empty or has no data rows.")]);

        var customers = await db.Customers.Where(c => c.TenantId == tenantId).ToListAsync(ct);
        var imported = 0;
        var skipped = 0;
        var linked = 0;
        var errors = new List<DocumentImportErrorDto>();

        var quoteIds = await ExistingNumberMapAsync(tenantId, DocumentType.Quote, ct);
        var chargeIds = await ExistingNumberMapAsync(tenantId, DocumentType.ChargeInvoice, ct);
        var receiptIds = await ExistingNumberMapAsync(tenantId, DocumentType.Receipt, ct);

        var pendingLinks = new List<(Guid DocId, DocumentType Type, string Description)>();

        foreach (var row in rows)
        {
            var docType = DetectDocumentType(row.DocumentType);
            if (docType is null)
            {
                errors.Add(new DocumentImportErrorDto(row.LineNo, $"Unknown document type: {row.DocumentType}"));
                continue;
            }

            if (row.Number <= 0)
            {
                errors.Add(new DocumentImportErrorDto(row.LineNo, "Missing document number."));
                continue;
            }

            var map = docType switch
            {
                DocumentType.Quote => quoteIds,
                DocumentType.ChargeInvoice => chargeIds,
                DocumentType.Receipt => receiptIds,
                _ => quoteIds,
            };

            if (map.ContainsKey(row.Number))
            {
                skipped++;
                continue;
            }

            var customer = FindCustomer(customers, row.CustomerName, row.CustomerId);
            if (customer is null)
            {
                errors.Add(new DocumentImportErrorDto(row.LineNo,
                    $"Customer not found: {row.CustomerName} ({row.CustomerId})."));
                continue;
            }

            if (!TryParseDate(row.IssueDate, out var issueDate))
            {
                errors.Add(new DocumentImportErrorDto(row.LineNo, $"Invalid date: {row.IssueDate}"));
                continue;
            }

            TryParseDate(row.DueDate, out var dueDate);

            var now = DateTime.UtcNow;
            var doc = new BusinessDocument
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                DocumentType = docType.Value,
                DocumentNumber = DocumentNumberService.Format(row.Number),
                CustomerId = customer.Id,
                Description = string.IsNullOrWhiteSpace(row.Description) ? null : row.Description.Trim(),
                IssueDate = issueDate,
                DueDate = dueDate == default ? null : dueDate,
                TotalAmount = row.Amount,
                Status = docType switch
                {
                    DocumentType.Quote => DocumentStatus.Sent,
                    DocumentType.ChargeInvoice => DocumentStatus.Open,
                    DocumentType.Receipt => DocumentStatus.Closed,
                    _ => DocumentStatus.Draft,
                },
                CreatedAt = now,
                UpdatedAt = now,
            };

            var lineDesc = string.IsNullOrWhiteSpace(row.Description) ? "Imported total" : row.Description.Trim();
            doc.Lines.Add(new BusinessDocumentLine
            {
                Id = Guid.NewGuid(),
                Description = lineDesc,
                Quantity = 1,
                UnitPrice = row.Amount,
                LineTotal = row.Amount,
                SortOrder = 0,
            });

            if (docType == DocumentType.Receipt)
            {
                doc.PaymentLines.Add(new ReceiptPaymentLine
                {
                    Id = Guid.NewGuid(),
                    DocumentId = doc.Id,
                    PaymentType = MapPaymentType(row.PaymentMethod),
                    Amount = row.Amount,
                    LineDate = issueDate,
                    SortOrder = 0,
                });
            }

            db.BusinessDocuments.Add(doc);

            if (docType == DocumentType.Quote)
                quoteIds[row.Number] = doc.Id;
            else if (docType == DocumentType.ChargeInvoice)
                chargeIds[row.Number] = doc.Id;
            else if (docType == DocumentType.Receipt)
                receiptIds[row.Number] = doc.Id;

            pendingLinks.Add((doc.Id, docType.Value, row.Description ?? string.Empty));
            await documentNumbers.BumpSequenceIfNeededAsync(
                tenantId, DocumentNumberService.KindForDocumentType(docType.Value), row.Number, ct);

            imported++;
        }

        await db.SaveChangesAsync(ct);

        foreach (var (docId, type, description) in pendingLinks)
        {
            if (type == DocumentType.ChargeInvoice)
            {
                var quoteNum = ExtractFirstQuoteNumber(description);
                if (quoteNum is null || !quoteIds.TryGetValue(quoteNum.Value, out var parentId)) continue;
                var doc = await db.BusinessDocuments.FirstAsync(d => d.Id == docId, ct);
                doc.ParentDocumentId = parentId;
                linked++;
            }
            else if (type == DocumentType.Receipt)
            {
                var chargeNum = ExtractFirstChargeNumber(description);
                if (chargeNum is null || !chargeIds.TryGetValue(chargeNum.Value, out var parentId)) continue;
                var doc = await db.BusinessDocuments.FirstAsync(d => d.Id == docId, ct);
                doc.ParentDocumentId = parentId;
                linked++;
            }
        }

        if (linked > 0)
            await db.SaveChangesAsync(ct);

        return new DocumentImportResultDto(imported, skipped, linked, errors);
    }

    private async Task<Dictionary<int, Guid>> ExistingNumberMapAsync(
        Guid tenantId,
        DocumentType type,
        CancellationToken ct)
    {
        var docs = await db.BusinessDocuments
            .Where(d => d.TenantId == tenantId && d.DocumentType == type)
            .Select(d => new { d.Id, d.DocumentNumber })
            .ToListAsync(ct);

        var map = new Dictionary<int, Guid>();
        foreach (var d in docs)
        {
            var n = DocumentNumberService.TryParseNumber(d.DocumentNumber);
            if (n is not null)
                map[n.Value] = d.Id;
        }
        return map;
    }

    private static Customer? FindCustomer(IReadOnlyList<Customer> customers, string name, string idText)
    {
        var id = idText.Trim();
        if (!string.IsNullOrEmpty(id))
        {
            var byOsek = customers.FirstOrDefault(c =>
                string.Equals(c.OsekNumber?.Trim(), id, StringComparison.OrdinalIgnoreCase));
            if (byOsek is not null) return byOsek;

            var byTeudat = customers.FirstOrDefault(c =>
                string.Equals(c.TeudatZehut?.Trim(), id, StringComparison.OrdinalIgnoreCase));
            if (byTeudat is not null) return byTeudat;
        }

        var normalized = NormalizeName(name);
        return customers.FirstOrDefault(c => NormalizeName(c.Name) == normalized)
            ?? customers.FirstOrDefault(c => NormalizeName(c.DocumentName ?? "") == normalized);
    }

    private static string NormalizeName(string value) =>
        value.Trim().Replace("\"", "", StringComparison.Ordinal).Replace("  ", " ", StringComparison.Ordinal);

    private static DocumentType? DetectDocumentType(string raw)
    {
        var t = raw.Trim();
        if (t.Contains("הצעת מחיר", StringComparison.Ordinal)) return DocumentType.Quote;
        if (t.Contains("קבלה", StringComparison.Ordinal)) return DocumentType.Receipt;
        if (t.Contains("חשבון", StringComparison.Ordinal) || t.Contains("חשבונית", StringComparison.Ordinal))
            return DocumentType.ChargeInvoice;
        return null;
    }

    private static ReceiptPaymentType MapPaymentType(string raw)
    {
        if (int.TryParse(raw.Trim(), out var code))
        {
            return code switch
            {
                1 => ReceiptPaymentType.Cash,
                2 => ReceiptPaymentType.Check,
                3 => ReceiptPaymentType.BankTransfer,
                4 => ReceiptPaymentType.CreditCard,
                _ => ReceiptPaymentType.Other,
            };
        }
        return ReceiptPaymentType.Other;
    }

    private static bool TryParseDate(string raw, out DateTime utc)
    {
        utc = default;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        if (DateTime.TryParseExact(raw.Trim(), "dd-MM-yyyy", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var local))
        {
            utc = DateTime.SpecifyKind(local.Date, DateTimeKind.Utc);
            return true;
        }
        return false;
    }

    private static int? ExtractFirstQuoteNumber(string text)
    {
        foreach (Match m in QuoteNumberRegex().Matches(text))
        {
            if (int.TryParse(m.Groups[1].Value, out var n))
                return n;
        }
        return null;
    }

    private static int? ExtractFirstChargeNumber(string text)
    {
        foreach (Match m in ChargeNumberRegex().Matches(text))
        {
            if (int.TryParse(m.Groups[1].Value, out var n))
                return n;
        }
        var listMatch = ChargeListRegex().Match(text);
        if (listMatch.Success)
        {
            var first = listMatch.Groups[1].Value
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .FirstOrDefault();
            if (first is not null && int.TryParse(first, out var n))
                return n;
        }
        return null;
    }

    [GeneratedRegex(@"הצעת\s*מחיר[^0-9]{0,20}(\d{2,6})", RegexOptions.IgnoreCase)]
    private static partial Regex QuoteNumberRegex();

    [GeneratedRegex(@"(?:מ)?חשבון\s*עסקה\s*(\d{2,6})", RegexOptions.IgnoreCase)]
    private static partial Regex ChargeNumberRegex();

    [GeneratedRegex(@"חשבונ(?:י)?ות\s*עסקה\s*מס(?:'|\s*')?\s*([\d,\s]+)", RegexOptions.IgnoreCase)]
    private static partial Regex ChargeListRegex();

    private sealed record ImportRow(
        int LineNo,
        string Status,
        int Number,
        string DocumentType,
        string CustomerName,
        string CustomerId,
        string Description,
        string PaymentMethod,
        string IssueDate,
        string DueDate,
        decimal Amount);

    private static List<ImportRow> ParseCsv(Stream stream)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var rows = new List<ImportRow>();
        var lineNo = 0;
        var seenHeader = false;

        while (!reader.EndOfStream)
        {
            var line = reader.ReadLine();
            lineNo++;
            if (string.IsNullOrWhiteSpace(line)) continue;

            var fields = ParseCsvLine(line);
            if (fields.Count == 0) continue;

            if (!seenHeader && IsHeader(fields))
            {
                seenHeader = true;
                continue;
            }

            if (fields.Count < 14)
            {
                if (fields.Count >= 1 && fields[0].Contains("פתוח", StringComparison.Ordinal))
                    fields = ParseWrappedRow(fields[0]);
                else
                    continue;
            }

            if (fields.Count < 14) continue;

            if (!int.TryParse(fields[1].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var number))
                continue;

            if (!decimal.TryParse(fields[13].Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var amount))
                amount = 0;

            rows.Add(new ImportRow(
                lineNo,
                fields[0].Trim(),
                number,
                fields[2].Trim(),
                fields[3].Trim(),
                fields[4].Trim(),
                fields.Count > 9 ? fields[9].Trim() : string.Empty,
                fields.Count > 10 ? fields[10].Trim() : "0",
                fields.Count > 11 ? fields[11].Trim() : string.Empty,
                fields.Count > 12 ? fields[12].Trim() : string.Empty,
                amount));
        }

        return rows;
    }

    private static List<string> ParseWrappedRow(string wrapped)
    {
        var inner = wrapped.Trim();
        if (inner.StartsWith('"') && inner.EndsWith('"'))
            inner = inner[1..^1];
        inner = inner.Replace("\"\"", "\"", StringComparison.Ordinal);
        return ParseCsvLine(inner);
    }

    private static bool IsHeader(IReadOnlyList<string> fields) =>
        fields.Any(f => f.Contains("סוג מסמך", StringComparison.Ordinal) || f.Contains("מס'", StringComparison.Ordinal));

    private static List<string> ParseCsvLine(string line)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    sb.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (c == ',' && !inQuotes)
            {
                result.Add(sb.ToString());
                sb.Clear();
                continue;
            }

            sb.Append(c);
        }

        result.Add(sb.ToString());
        return result;
    }
}
