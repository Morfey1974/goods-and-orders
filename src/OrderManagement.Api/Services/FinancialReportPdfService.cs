using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;

namespace OrderManagement.Api.Services;

public class FinancialReportPdfService(
    AppDbContext db,
    IncomeReportService incomeReport,
    ExpenseReportService expenseReport,
    TenantFileService files)
{
    public async Task<byte[]> GenerateIncomeAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        var report = await incomeReport.BuildAsync(tenantId, from, to, ct);
        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var model = Pdf.FinancialReportPdfBuilder.BuildIncome(tenant, logoPath, report);
        return Pdf.FinancialReportPdfRenderer.Render(model);
    }

    public async Task<byte[]> GenerateExpenseAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        var report = await expenseReport.BuildAsync(tenantId, from, to, ct);
        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var model = Pdf.FinancialReportPdfBuilder.BuildExpense(tenant, logoPath, report);
        return Pdf.FinancialReportPdfRenderer.Render(model);
    }

    private string? ResolveAssetPath(string? relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return null;
        var absolute = files.GetAbsolutePath(relativePath);
        return File.Exists(absolute) ? absolute : null;
    }
}
