using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class ProductImportService(
    AppDbContext db,
    ArticleSequenceService articles,
    WarehouseService warehouse)
{
    public async Task<ProductImportResultDto> ImportCsvAsync(
        Guid tenantId,
        Stream csvStream,
        string defaultProductType,
        bool importStock,
        CancellationToken ct)
    {
        ProductType type;
        try
        {
            type = CatalogMappers.ParseProductType(defaultProductType);
        }
        catch
        {
            type = ProductType.ComponentPart;
        }

        await warehouse.EnsureWarehousesAsync(tenantId, ct);
        var existingLegacy = await db.Products
            .Where(p => p.TenantId == tenantId && p.LegacySku != null)
            .Select(p => p.LegacySku!)
            .ToHashSetAsync(ct);

        var imported = 0;
        var skipped = 0;
        var errors = new List<ProductImportErrorDto>();
        var lineNo = 0;

        using var reader = new StreamReader(csvStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);

        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync(ct);
            lineNo++;
            if (string.IsNullOrWhiteSpace(line)) continue;

            var row = ParseLine(line);
            if (row is null)
            {
                errors.Add(new ProductImportErrorDto(lineNo, "Could not parse line."));
                continue;
            }

            if (IsHeaderRow(row))
                continue;

            if (string.IsNullOrWhiteSpace(row.LegacySku) || string.IsNullOrWhiteSpace(row.Name))
            {
                errors.Add(new ProductImportErrorDto(lineNo, "Missing SKU or name."));
                continue;
            }

            if (existingLegacy.Contains(row.LegacySku))
            {
                errors.Add(new ProductImportErrorDto(lineNo, $"SKU {row.LegacySku} already imported."));
                skipped++;
                continue;
            }

            try
            {
                var productType = DetectProductType(row.Name, type);
                var articleCode = await articles.AllocateNextAsync(tenantId, productType, ct);
                var now = DateTime.UtcNow;

                var product = new Product
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ArticleCode = articleCode,
                    LegacySku = row.LegacySku,
                    ProductType = productType,
                    Name = row.Name.Trim(),
                    Description = $"Imported. Legacy SKU: {row.LegacySku}",
                    UnitPrice = row.UnitPrice,
                    IsActive = row.IsActive,
                    CreatedAt = now,
                    UpdatedAt = now
                };

                db.Products.Add(product);
                await db.SaveChangesAsync(ct);
                existingLegacy.Add(row.LegacySku);

                if (importStock && row.Quantity > 0 && ProductTypePrefixes.TracksStock(productType))
                {
                    var wh = await warehouse.GetForProductTypeAsync(tenantId, productType, ct);
                    await warehouse.GetOrCreateBalanceAsync(wh.Id, product.Id, ct);
                    await warehouse.ApplyMovementAsync(
                        tenantId, wh.Id, product.Id,
                        StockMovementType.Receipt, row.Quantity,
                        "Import from legacy system", ct);
                }

                imported++;
            }
            catch (Exception ex)
            {
                errors.Add(new ProductImportErrorDto(lineNo, ex.Message));
            }
        }

        return new ProductImportResultDto(imported, skipped, errors.Count, errors);
    }

    private static bool IsHeaderRow(ImportRow row) =>
        row.LegacySku.Contains("מק", StringComparison.OrdinalIgnoreCase) ||
        row.LegacySku.Equals("SKU", StringComparison.OrdinalIgnoreCase) ||
        row.Name.Contains("שם", StringComparison.OrdinalIgnoreCase);

    private static ProductType DetectProductType(string name, ProductType fallback)
    {
        var n = name.ToLowerInvariant();
        if (n.Contains("שירות") || n.Contains("услуг") || n.Contains("монтаж") || n.Contains("service"))
            return ProductType.Service;
        return fallback;
    }

    private static ImportRow? ParseLine(string line)
    {
        line = line.Trim();
        if (line.Length == 0) return null;

        var parts = SplitCsvLine(line);
        // Excel: вся строка в одной ячейке
        if (parts.Count == 1 && (parts[0].Contains(',') || parts[0].Contains(';')))
        {
            var sep = parts[0].Contains(';') && !parts[0].Contains(',') ? ';' : ',';
            parts = parts[0].Split(sep).Select(p => p.Trim().Trim('"')).ToList();
        }
        if (parts.Count < 2) return null;

        var legacySku = parts[0].Trim().Trim('"');
        var name = parts[1].Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(legacySku) || string.IsNullOrWhiteSpace(name))
            return null;

        decimal unitPrice = 0;
        decimal quantity = 0;

        // מטבע ILS обычно в колонке 3, цена — следующая числовая после ILS
        for (var i = 2; i < parts.Count; i++)
        {
            var cell = parts[i].Trim();
            if (cell.Equals("ILS", StringComparison.OrdinalIgnoreCase) && i + 1 < parts.Count &&
                TryDecimal(parts[i + 1], out var price))
            {
                unitPrice = price;
                break;
            }
        }
        if (unitPrice == 0 && parts.Count > 4 && TryDecimal(parts[4], out var p4))
            unitPrice = p4;

        // Количество: последнее подходящее число перед статусом (не цена)
        for (var i = parts.Count - 1; i >= 2; i--)
        {
            var cell = parts[i].Trim();
            if (!TryDecimal(cell, out var num) || num <= 0) continue;
            if (IsStatusToken(cell)) continue;
            quantity = num;
            break;
        }

        var isActive = ParseIsActive(parts);

        return new ImportRow(legacySku, name, unitPrice, quantity, isActive);
    }

    private static bool ParseIsActive(List<string> parts)
    {
        // По умолчанию активен; неактивен только при явной пометке
        for (var i = parts.Count - 1; i >= Math.Max(0, parts.Count - 3); i--)
        {
            var cell = parts[i].Trim();
            if (string.IsNullOrEmpty(cell) || TryDecimal(cell, out _)) continue;
            if (cell.Contains("לא פעיל", StringComparison.OrdinalIgnoreCase) ||
                cell.Contains("inactive", StringComparison.OrdinalIgnoreCase) ||
                cell.Contains("לא במלאי", StringComparison.OrdinalIgnoreCase))
                return false;
            if (cell.Contains("פעיל", StringComparison.OrdinalIgnoreCase) ||
                cell.Equals("active", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return true;
    }

    private static bool IsStatusToken(string cell) =>
        cell.Contains("פעיל", StringComparison.OrdinalIgnoreCase) ||
        cell.Contains("לא", StringComparison.OrdinalIgnoreCase) ||
        cell.Contains("active", StringComparison.OrdinalIgnoreCase);

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

    private static bool TryDecimal(string s, out decimal value)
    {
        s = s.Trim();
        if (string.IsNullOrEmpty(s))
        {
            value = 0;
            return false;
        }
        return decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out value) ||
               decimal.TryParse(s, NumberStyles.Any, CultureInfo.GetCultureInfo("he-IL"), out value);
    }

    private sealed record ImportRow(string LegacySku, string Name, decimal UnitPrice, decimal Quantity, bool IsActive);
}
