using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Helpers;
using OrderManagement.Api.Services.Pdf;

namespace OrderManagement.Api.Services;

public class ProfitAndLossReportPdfService(
    AppDbContext db,
    ProfitAndLossReportService report,
    TenantFileService files)
{
    public async Task<byte[]> GenerateAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        PlCogsMethod cogsMethod,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        var data = await report.BuildAsync(tenantId, from, to, cogsMethod, ct);
        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var model = ProfitAndLossReportPdfBuilder.Build(tenant, logoPath, data);
        return ProfitAndLossReportPdfRenderer.Render(model);
    }

    private string? ResolveAssetPath(string? relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return null;
        var absolute = files.GetAbsolutePath(relativePath);
        return File.Exists(absolute) ? absolute : null;
    }
}
