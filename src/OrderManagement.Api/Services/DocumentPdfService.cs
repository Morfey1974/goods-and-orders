using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Services.Pdf;

namespace OrderManagement.Api.Services;

public class DocumentPdfService(AppDbContext db, TenantFileService files, DocumentService documents)
{
    private static readonly HashSet<DocumentType> SupportedTypes =
    [
        DocumentType.Quote,
        DocumentType.ChargeInvoice,
        DocumentType.Receipt
    ];

    public async Task<byte[]> GenerateAsync(Guid tenantId, Guid documentId, CancellationToken ct)
    {
        var doc = await db.BusinessDocuments
            .Include(d => d.Customer)
            .Include(d => d.Lines)
            .Include(d => d.PaymentLines)
            .FirstOrDefaultAsync(d => d.Id == documentId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        if (!SupportedTypes.Contains(doc.DocumentType))
            throw new InvalidOperationException("PDF template is not available for this document type.");

        await documents.SyncDraftChargeFromParentQuoteAsync(doc, ct);
        if (doc.Lines.Count == 0)
            await db.Entry(doc).Collection(d => d.Lines).LoadAsync(ct);

        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        IReadOnlyList<BusinessDocument>? sourceChargesForReceipt = null;
        BusinessDocument? sourceQuote = null;
        BusinessDocument linesSource = doc;

        if (doc.DocumentType == DocumentType.Receipt)
        {
            sourceChargesForReceipt = await db.ReceiptChargeAllocations
                .AsNoTracking()
                .Include(a => a.ChargeInvoice)
                .Where(a => a.ReceiptId == doc.Id)
                .OrderBy(a => a.ChargeInvoice.DocumentNumber)
                .Select(a => a.ChargeInvoice)
                .ToListAsync(ct);

            if (sourceChargesForReceipt.Count == 0 && doc.ParentDocumentId is { } chargeId)
            {
                var legacyCharge = await db.BusinessDocuments
                    .AsNoTracking()
                    .FirstOrDefaultAsync(d => d.Id == chargeId && d.TenantId == tenantId, ct)
                    ?? throw new InvalidOperationException("Parent charge invoice not found.");
                if (legacyCharge.DocumentType != DocumentType.ChargeInvoice)
                    throw new InvalidOperationException("Receipt parent must be a charge invoice.");
                sourceChargesForReceipt = [legacyCharge];
            }

            if (sourceChargesForReceipt.Count == 0)
                throw new InvalidOperationException("Receipt has no linked charge invoices.");

            sourceQuote = await ResolveSourceQuoteAsync(sourceChargesForReceipt[0], tenantId, ct);
        }
        else if (doc.DocumentType == DocumentType.ChargeInvoice)
        {
            sourceQuote = await ResolveSourceQuoteAsync(doc, tenantId, ct);
        }

        var productIds = doc.DocumentType == DocumentType.Receipt
            ? new List<Guid>()
            : linesSource.Lines.Where(l => l.ProductId.HasValue).Select(l => l.ProductId!.Value).Distinct().ToList();
        var products = productIds.Count == 0
            ? new Dictionary<Guid, Product>()
            : await db.Products.Where(p => p.TenantId == tenantId && productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, ct);

        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var signaturePath = ResolveAssetPath(tenant.SignaturePath);

        var model = BusinessDocumentPdfBuilder.Build(
            doc,
            linesSource,
            tenant,
            doc.Customer,
            products,
            logoPath,
            signaturePath,
            sourceQuote,
            sourceChargesForReceipt);

        return BusinessDocumentPdfRenderer.Render(model);
    }

    public async Task<byte[]> GenerateBrandingSampleAsync(Guid tenantId, CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var signaturePath = ResolveAssetPath(tenant.SignaturePath);

        var model = BusinessDocumentPdfBuilder.BuildBrandingSample(tenant, logoPath, signaturePath);
        return BusinessDocumentPdfRenderer.Render(model);
    }

    private async Task<BusinessDocument?> ResolveSourceQuoteAsync(
        BusinessDocument charge,
        Guid tenantId,
        CancellationToken ct)
    {
        if (charge.ParentDocumentId is not { } parentId)
            return null;

        var parent = await db.BusinessDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == parentId && d.TenantId == tenantId, ct);

        return parent?.DocumentType == DocumentType.Quote ? parent : null;
    }

    private string? ResolveAssetPath(string? relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return null;
        var absolute = files.GetAbsolutePath(relativePath);
        return File.Exists(absolute) ? absolute : null;
    }
}
