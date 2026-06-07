using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;

namespace OrderManagement.Api.Services;

public class InventoryValuationPdfService(
    AppDbContext db,
    InventoryValuationService valuation,
    TenantFileService files)
{
    public async Task<byte[]> GenerateAsync(
        Guid tenantId,
        DateTime? asOf,
        bool detailed,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        var report = await valuation.BuildCurrentAsync(tenantId, asOf, detailed, ct);
        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var model = Pdf.InventoryValuationPdfBuilder.Build(tenant, logoPath, report);
        return Pdf.InventoryValuationPdfRenderer.Render(model);
    }

    private string? ResolveAssetPath(string? relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return null;
        var absolute = files.GetAbsolutePath(relativePath);
        return File.Exists(absolute) ? absolute : null;
    }
}
