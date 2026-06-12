using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Services.Pdf;

namespace OrderManagement.Api.Services;

public class Form1342PdfService(
    AppDbContext db,
    Form1342ReportService reportService,
    TenantFileService files)
{
    public async Task<byte[]> GenerateAsync(Guid tenantId, int taxYear, CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        var report = await reportService.BuildAsync(tenantId, taxYear, ct);
        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var model = Form1342PdfBuilder.Build(tenant, logoPath, report);
        return Form1342PdfRenderer.Render(model);
    }

    private string? ResolveAssetPath(string? relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return null;
        var absolute = files.GetAbsolutePath(relativePath);
        return File.Exists(absolute) ? absolute : null;
    }
}
