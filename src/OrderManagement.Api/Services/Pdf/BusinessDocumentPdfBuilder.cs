using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services.Pdf;

public static class BusinessDocumentPdfBuilder
{
    public static BusinessDocumentPdfModel Build(
        BusinessDocument document,
        BusinessDocument linesSource,
        Tenant tenant,
        Customer customer,
        IReadOnlyDictionary<Guid, Product> productsById,
        string? logoAbsolutePath,
        string? signatureAbsolutePath,
        BusinessDocument? sourceQuote,
        IReadOnlyList<BusinessDocument>? sourceChargesForReceipt)
    {
        var displayNumber = StripDocumentPrefix(document.DocumentNumber);
        var (title, footerLabel) = TitleLabels(document.DocumentType);
        var tableBanner = BuildTableBanner(document, sourceQuote, sourceChargesForReceipt);

        List<BusinessDocumentPdfLine> pdfLines;
        decimal? subtotal = null;
        decimal? discountValue = null;
        string? discountLabel = null;
        decimal totalAmount;
        BusinessDocumentPdfLinesKind linesKind;
        string totalFooterLabel;

        if (document.DocumentType == DocumentType.Receipt)
        {
            linesKind = BusinessDocumentPdfLinesKind.ReceiptPayments;
            totalFooterLabel = "סה״כ שולם";
            var paymentLines = document.PaymentLines.OrderBy(p => p.SortOrder).ToList();
            pdfLines = BuildReceiptPaymentPdfLines(paymentLines);
            totalAmount = paymentLines.Count > 0
                ? paymentLines.Sum(p => p.Amount)
                : document.TotalAmount;
        }
        else
        {
            linesKind = BusinessDocumentPdfLinesKind.Products;
            totalFooterLabel = "סה\"כ לתשלום";
            var lines = linesSource.Lines.OrderBy(l => l.SortOrder).ToList();
            var lineSubtotal = lines.Sum(l => l.LineTotal);
            subtotal = lineSubtotal;

            var discountDoc = linesSource;
            if (discountDoc.DiscountPercent is { } pct and > 0)
            {
                discountValue = Math.Round(lineSubtotal * pct / 100m, 2);
                discountLabel = $"הנחה {pct:0.##}%";
            }
            else if (discountDoc.DiscountAmount is { } amt and > 0)
            {
                discountValue = amt;
                discountLabel = "הנחה";
            }

            pdfLines = new List<BusinessDocumentPdfLine>();
            var row = 1;
            foreach (var line in lines)
            {
                string? sku = null;
                if (line.ProductId is { } pid && productsById.TryGetValue(pid, out var product))
                {
                    sku = product.ArticleCode;
                    if (string.IsNullOrWhiteSpace(sku))
                        sku = product.LegacySku;
                }

                pdfLines.Add(new BusinessDocumentPdfLine(
                    row++,
                    line.Description,
                    sku,
                    line.Quantity,
                    line.UnitPrice,
                    line.LineTotal));
            }

            totalAmount = linesSource.TotalAmount;
        }

        return new BusinessDocumentPdfModel(
            title,
            footerLabel,
            displayNumber,
            document.DocumentNumber,
            document.IssueDate,
            totalAmount,
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
            tableBanner,
            logoAbsolutePath,
            signatureAbsolutePath,
            pdfLines,
            linesKind,
            totalFooterLabel);
    }

    private static List<BusinessDocumentPdfLine> BuildReceiptPaymentPdfLines(
        IReadOnlyList<ReceiptPaymentLine> paymentLines)
    {
        var pdfLines = new List<BusinessDocumentPdfLine>();
        var row = 1;
        foreach (var pl in paymentLines)
        {
            pdfLines.Add(new BusinessDocumentPdfLine(
                row++,
                string.Empty,
                null,
                0,
                0,
                pl.Amount,
                ReceiptPaymentPdfFormatter.TypeLabel(pl.PaymentType),
                ReceiptPaymentPdfFormatter.FormatLineDate(pl.LineDate),
                ReceiptPaymentPdfFormatter.FormatDetail(pl)));
        }
        return pdfLines;
    }

    private static (string Title, string FooterLabel) TitleLabels(DocumentType type) => type switch
    {
        DocumentType.Quote => ("הצעת מחיר", "הצעת מחיר"),
        DocumentType.ChargeInvoice => ("חשבון חיוב", "חשבון חיוב"),
        DocumentType.Receipt => ("קבלה", "קבלה"),
        _ => throw new InvalidOperationException("Unsupported document type for PDF.")
    };

    private static string? BuildTableBanner(
        BusinessDocument document,
        BusinessDocument? sourceQuote,
        IReadOnlyList<BusinessDocument>? sourceChargesForReceipt)
    {
        return document.DocumentType switch
        {
            DocumentType.Quote => FormatProjectLine(document.Description),
            DocumentType.ChargeInvoice => BuildChargeInvoiceBanner(document, sourceQuote),
            DocumentType.Receipt => BuildReceiptBanner(sourceChargesForReceipt, sourceQuote),
            _ => null
        };
    }

    private static string? BuildChargeInvoiceBanner(BusinessDocument charge, BusinessDocument? sourceQuote)
    {
        var project = ResolveProjectBannerText(charge, sourceQuote);

        if (sourceQuote is null)
            return project;

        var quoteNum = StripDocumentPrefix(sourceQuote.DocumentNumber);
        // Source quote first (RTL line start), then project description.
        var parts = new List<string> { $"יצא מתוך הצעת מחיר מס׳ {quoteNum}" };
        if (!string.IsNullOrWhiteSpace(project))
            parts.Add(project);
        return string.Join(" | ", parts);
    }

    /// <summary>Charge description wins (may include PO / updates); then quote; append client order ref only if absent.</summary>
    private static string? ResolveProjectBannerText(BusinessDocument charge, BusinessDocument? sourceQuote)
    {
        var project = FormatProjectLine(charge.Description);
        if (string.IsNullOrWhiteSpace(project))
            project = FormatProjectLine(sourceQuote?.Description);

        var rawRef = charge.ClientOrderReference?.Trim();
        if (string.IsNullOrWhiteSpace(rawRef))
            rawRef = sourceQuote?.ClientOrderReference?.Trim();

        if (string.IsNullOrWhiteSpace(rawRef))
            return project;

        if (!string.IsNullOrWhiteSpace(project) && BannerAlreadyContainsClientOrder(project, rawRef))
            return project;

        var orderRef = FormatClientOrderBannerPart(rawRef);
        if (string.IsNullOrWhiteSpace(project))
            return orderRef;

        return $"{project} {orderRef}";
    }

    private static bool BannerAlreadyContainsClientOrder(string project, string clientOrderReference)
    {
        if (project.Contains(clientOrderReference, StringComparison.OrdinalIgnoreCase))
            return true;

        var normalizedProject = NormalizeBannerTextForCompare(project);
        var normalizedRef = NormalizeBannerTextForCompare(clientOrderReference);
        if (normalizedProject.Contains(normalizedRef, StringComparison.OrdinalIgnoreCase))
            return true;

        var formattedRef = FormatClientOrderBannerPart(clientOrderReference);
        if (!string.IsNullOrWhiteSpace(formattedRef) &&
            normalizedProject.Contains(NormalizeBannerTextForCompare(formattedRef), StringComparison.OrdinalIgnoreCase))
            return true;

        return false;
    }

    private static string NormalizeBannerTextForCompare(string value) =>
        value
            .Replace('\u05F3', '\'')
            .Replace('׳', '\'')
            .Replace("מס׳", "מס'", StringComparison.Ordinal);

    private static string? FormatClientOrderBannerPart(string? clientOrderReference)
    {
        if (string.IsNullOrWhiteSpace(clientOrderReference))
            return null;

        var reference = clientOrderReference.Trim();
        if (reference.Contains("הזמנה", StringComparison.Ordinal))
            return reference;

        return $"מס׳ הזמנה {reference}";
    }

    private static string? BuildReceiptBanner(
        IReadOnlyList<BusinessDocument>? sourceCharges,
        BusinessDocument? sourceQuote)
    {
        if (sourceCharges is null or { Count: 0 })
            return null;

        if (sourceCharges.Count == 1)
        {
            var sourceCharge = sourceCharges[0];
            var chargeNum = StripDocumentPrefix(sourceCharge.DocumentNumber);
            var project = ResolveProjectBannerText(sourceCharge, sourceQuote);
            var parts = new List<string> { $"קבלה זו הוצאה על בסיס חשבון חיוב מס׳ {chargeNum}" };
            if (!string.IsNullOrWhiteSpace(project))
                parts.Add(project);
            return string.Join(" | ", parts);
        }

        var nums = string.Join(", ", sourceCharges.Select(c => StripDocumentPrefix(c.DocumentNumber)));
        return $"קבלה זו הוצאה על בסיס חשבונות עסקה מס׳ {nums}";
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
        var first = description
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault();
        if (string.IsNullOrWhiteSpace(first)) return null;
        return NormalizeProjectBannerLine(first.Trim());
    }

    /// <summary>לפרויקט prefix before Latin project name (fixes reversed bidi like "MAPI_PHARMA לפרויקט").</summary>
    private static string NormalizeProjectBannerLine(string line)
    {
        const string prefix = "לפרויקט";
        if (line.StartsWith(prefix, StringComparison.Ordinal))
        {
            var rest = line[prefix.Length..].TrimStart();
            return string.IsNullOrEmpty(rest) ? prefix : $"{prefix} {rest}";
        }

        if (line.EndsWith(prefix, StringComparison.Ordinal))
        {
            var name = line[..^prefix.Length].Trim().TrimEnd('-', '–', ':', ' ');
            return string.IsNullOrEmpty(name) ? prefix : $"{prefix} {name}";
        }

        return line;
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
            TaxRegime.Patur => "עוסק פטור",
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

    /// <summary>Sample quote PDF for branding preview (logo + signature on tenant documents).</summary>
    public static BusinessDocumentPdfModel BuildBrandingSample(
        Tenant tenant,
        string? logoAbsolutePath,
        string? signatureAbsolutePath)
    {
        var lines = new List<BusinessDocumentPdfLine>
        {
            new(1, "תיאור שירות לדוגמה", "SKU-001", 1m, 1500m, 1500m),
            new(2, "פריט נוסף — הצעת מחיר", "SKU-002", 2m, 750m, 1500m),
        };

        return new BusinessDocumentPdfModel(
            "הצעת מחיר",
            "הצעת מחיר",
            "00001",
            "Q-00001",
            DateTime.UtcNow.Date,
            3000m,
            null,
            null,
            null,
            "שם לקוח לדוגמה בע\"מ",
            FormatAddress("רחוב לדוגמה 1", "תל אביב", null),
            "512345678",
            "03-1234567",
            null,
            tenant.BusinessName,
            tenant.BusinessCategory ?? tenant.BusinessField,
            FormatSupplierTaxLine(tenant),
            FormatAddress(tenant.Address, tenant.City, tenant.ZipCode),
            tenant.MobilePhone ?? tenant.Phone,
            tenant.Email,
            tenant.Website,
            "לפרויקט דוגמה — תצוגה מקדימה של מיתוג",
            logoAbsolutePath,
            signatureAbsolutePath,
            lines,
            BusinessDocumentPdfLinesKind.Products,
            "סה\"כ לתשלום");
    }
}
