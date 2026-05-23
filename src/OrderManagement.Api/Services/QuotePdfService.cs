using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Services.Pdf;

namespace OrderManagement.Api.Services;

public class QuotePdfService(AppDbContext db, TenantFileService files)
{
    public async Task<byte[]> GenerateAsync(Guid tenantId, Guid documentId, CancellationToken ct)
    {
        var doc = await db.BusinessDocuments
            .Include(d => d.Customer)
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == documentId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        if (doc.DocumentType != DocumentType.Quote)
            throw new InvalidOperationException("PDF template is available for price quotes only.");

        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        var productIds = doc.Lines.Where(l => l.ProductId.HasValue).Select(l => l.ProductId!.Value).Distinct().ToList();
        var products = productIds.Count == 0
            ? new Dictionary<Guid, Product>()
            : await db.Products.Where(p => p.TenantId == tenantId && productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, ct);

        string? logoPath = null;
        if (!string.IsNullOrEmpty(tenant.LogoPath))
        {
            var absolute = files.GetAbsolutePath(tenant.LogoPath);
            if (File.Exists(absolute))
                logoPath = absolute;
        }

        string? signaturePath = null;
        if (!string.IsNullOrEmpty(tenant.SignaturePath))
        {
            var absolute = files.GetAbsolutePath(tenant.SignaturePath);
            if (File.Exists(absolute))
                signaturePath = absolute;
        }

        var model = QuotePdfBuilder.Build(doc, tenant, doc.Customer, products, logoPath, signaturePath);
        return QuotePdfRenderer.Render(model);
    }
}
