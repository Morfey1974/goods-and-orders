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
        BusinessDocument? sourceChargeForReceipt)
    {
        var displayNumber = StripDocumentPrefix(document.DocumentNumber);
        var (title, footerLabel) = TitleLabels(document.DocumentType);
        var tableBanner = BuildTableBanner(document, sourceQuote, sourceChargeForReceipt);

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
                    sku = product.LegacySku ?? product.ArticleCode;

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
        BusinessDocument? sourceChargeForReceipt)
    {
        return document.DocumentType switch
        {
            DocumentType.Quote => FormatProjectLine(document.Description),
            DocumentType.ChargeInvoice => BuildChargeInvoiceBanner(sourceQuote),
            DocumentType.Receipt => BuildReceiptBanner(sourceChargeForReceipt, sourceQuote),
            _ => null
        };
    }

    private static string? BuildChargeInvoiceBanner(BusinessDocument? sourceQuote)
    {
        if (sourceQuote is null)
            return null;

        var quoteNum = StripDocumentPrefix(sourceQuote.DocumentNumber);
        var parts = new List<string> { $"חשבון חיוב זה הוצא על בסיס הצעת מחיר מס׳ {quoteNum}" };
        var project = FormatProjectLine(sourceQuote.Description);
        if (!string.IsNullOrWhiteSpace(project))
            parts.Add(project);
        return string.Join(" | ", parts);
    }

    private static string? BuildReceiptBanner(BusinessDocument? sourceCharge, BusinessDocument? sourceQuote)
    {
        if (sourceCharge is null)
            return null;

        var chargeNum = StripDocumentPrefix(sourceCharge.DocumentNumber);
        var parts = new List<string> { $"קבלה זו הוצאה על בסיס חשבון חיוב מס׳ {chargeNum}" };
        var project = FormatProjectLine(sourceQuote?.Description ?? sourceCharge.Description);
        if (!string.IsNullOrWhiteSpace(project))
            parts.Add(project);
        return string.Join(" | ", parts);
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
