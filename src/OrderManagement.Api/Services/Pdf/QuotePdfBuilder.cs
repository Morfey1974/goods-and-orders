using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services.Pdf;

public static class QuotePdfBuilder
{
    public static QuotePdfModel Build(
        BusinessDocument document,
        Tenant tenant,
        Customer customer,
        IReadOnlyDictionary<Guid, Product> productsById,
        string? logoAbsolutePath,
        string? signatureAbsolutePath)
    {
        var displayNumber = StripDocumentPrefix(document.DocumentNumber);
        var lines = document.Lines.OrderBy(l => l.SortOrder).ToList();
        var subtotal = lines.Sum(l => l.LineTotal);
        decimal? discountValue = null;
        string? discountLabel = null;

        if (document.DiscountPercent is { } pct and > 0)
        {
            discountValue = Math.Round(subtotal * pct / 100m, 2);
            discountLabel = $"הנחה {pct:0.##}%";
        }
        else if (document.DiscountAmount is { } amt and > 0)
        {
            discountValue = amt;
            discountLabel = "הנחה";
        }

        var pdfLines = new List<QuotePdfLine>();
        var row = 1;
        foreach (var line in lines)
        {
            string? sku = null;
            if (line.ProductId is { } pid && productsById.TryGetValue(pid, out var product))
                sku = product.LegacySku ?? product.ArticleCode;

            pdfLines.Add(new QuotePdfLine(
                row++,
                line.Description,
                sku,
                line.Quantity,
                line.UnitPrice,
                line.LineTotal));
        }

        return new QuotePdfModel(
            displayNumber,
            document.DocumentNumber,
            document.IssueDate,
            document.TotalAmount,
            discountValue > 0 ? subtotal : null,
            discountValue,
            discountLabel,
            customer.DocumentName ?? customer.Name,
            FormatAddress(customer.Address, customer.City, customer.ZipCode),
            FormatCustomerId(customer),
            customer.Phone ?? customer.MobilePhone,
            customer.Website,
            tenant.BusinessName,
            tenant.BusinessCategory ?? tenant.BusinessField,
            FormatSupplierTaxLine(tenant),
            FormatAddress(tenant.Address, tenant.City, tenant.ZipCode),
            tenant.MobilePhone ?? tenant.Phone,
            tenant.Email,
            tenant.Website,
            FormatProjectLine(document.Description),
            logoAbsolutePath,
            signatureAbsolutePath,
            pdfLines);
    }

    public static string StripDocumentPrefix(string documentNumber)
    {
        var idx = documentNumber.IndexOf('-');
        return idx >= 0 && idx < documentNumber.Length - 1
            ? documentNumber[(idx + 1)..]
            : documentNumber;
    }

    private static string? FormatProjectLine(string? description)
    {
        if (string.IsNullOrWhiteSpace(description)) return null;
        var text = description.Trim();
        if (text.Contains("לפרויקט", StringComparison.OrdinalIgnoreCase))
            return text;
        return $"לפרויקט {text}";
    }

    private static string? FormatCustomerId(Customer customer)
    {
        if (!string.IsNullOrWhiteSpace(customer.OsekNumber))
            return customer.OsekNumber.Trim();
        if (!string.IsNullOrWhiteSpace(customer.TeudatZehut))
            return customer.TeudatZehut.Trim();
        return null;
    }

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
