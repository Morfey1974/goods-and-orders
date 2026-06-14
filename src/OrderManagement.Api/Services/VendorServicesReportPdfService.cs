using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Services.Pdf;

namespace OrderManagement.Api.Services;

public class VendorServicesReportPdfService(
    AppDbContext db,
    VendorServicesReportService report,
    TenantFileService files)
{
    public async Task<byte[]> GenerateAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        var data = await report.BuildAsync(tenantId, from, to, ct);
        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var model = VendorServicesReportPdfBuilder.Build(tenant, logoPath, data);
        return VendorServicesReportPdfRenderer.Render(model);
    }

    private string? ResolveAssetPath(string? relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return null;
        var absolute = files.GetAbsolutePath(relativePath);
        return File.Exists(absolute) ? absolute : null;
    }
}
