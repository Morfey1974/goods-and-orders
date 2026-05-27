using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;
using OrderManagement.Api.Services.Pdf;

namespace OrderManagement.Api.Services;

public class WarehouseReportPdfService(
    AppDbContext db,
    WarehouseService warehouseService,
    TenantFileService files)
{
    public async Task<byte[]> GenerateBalancesAsync(
        Guid tenantId,
        Guid? warehouseId,
        bool includeZero,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        await warehouseService.EnsureSystemWarehousesAsync(tenantId, ct);

        var balances = await LoadBalancesAsync(tenantId, warehouseId, ct);
        var warehouses = await LoadReportWarehousesAsync(tenantId, warehouseId, ct);
        string? filterName = null;
        if (warehouseId.HasValue)
        {
            filterName = warehouses.FirstOrDefault()?.Name;
        }

        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var model = WarehouseReportPdfBuilder.BuildBalances(
            tenant, logoPath, balances, warehouses, filterName, includeZero);
        return WarehouseReportPdfRenderer.Render(model);
    }

    public async Task<byte[]> GenerateMovementsAsync(
        Guid tenantId,
        Guid? warehouseId,
        Guid? productId,
        DateTime? from,
        DateTime? to,
        int limit,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct)
            ?? throw new InvalidOperationException("Tenant not found.");

        var movements = await LoadMovementsAsync(tenantId, warehouseId, productId, from, to, limit, ct);
        string? filterName = null;
        if (warehouseId.HasValue)
        {
            filterName = await db.Warehouses
                .Where(w => w.TenantId == tenantId && w.Id == warehouseId.Value)
                .Select(w => w.Name)
                .FirstOrDefaultAsync(ct);
        }

        var logoPath = ResolveAssetPath(tenant.LogoPath);
        var model = WarehouseReportPdfBuilder.BuildMovements(
            tenant, logoPath, movements, filterName, from, to);
        return WarehouseReportPdfRenderer.Render(model);
    }

    private async Task<List<StockBalanceDto>> LoadBalancesAsync(
        Guid tenantId,
        Guid? warehouseId,
        CancellationToken ct)
    {
        var query =
            from b in db.StockBalances
            join p in db.Products on b.ProductId equals p.Id
            join w in db.Warehouses on b.WarehouseId equals w.Id
            where p.TenantId == tenantId && w.TenantId == tenantId
            select new { b, p, w };

        if (warehouseId.HasValue)
            query = query.Where(x => x.b.WarehouseId == warehouseId);

        return await query
            .OrderBy(x => x.w.Name)
            .ThenBy(x => x.p.ArticleCode)
            .Select(x => new StockBalanceDto(
                x.b.ProductId,
                x.p.ArticleCode,
                x.p.Name,
                x.p.ProductType.ToString(),
                x.b.Quantity,
                x.w.Id,
                x.w.Name))
            .ToListAsync(ct);
    }

    private async Task<List<WarehouseReportWarehouseRef>> LoadReportWarehousesAsync(
        Guid tenantId,
        Guid? warehouseId,
        CancellationToken ct)
    {
        var query = db.Warehouses.Where(w => w.TenantId == tenantId && w.IsActive);
        if (warehouseId.HasValue)
            query = query.Where(w => w.Id == warehouseId);

        return await query
            .OrderBy(w => w.Kind == WarehouseKind.Components ? 0 : w.Kind == WarehouseKind.FinishedGoods ? 1 : 2)
            .ThenBy(w => w.Name)
            .Select(w => new WarehouseReportWarehouseRef(w.Id, w.Name))
            .ToListAsync(ct);
    }

    private async Task<List<StockMovementDto>> LoadMovementsAsync(
        Guid tenantId,
        Guid? warehouseId,
        Guid? productId,
        DateTime? from,
        DateTime? to,
        int limit,
        CancellationToken ct)
    {
        var query =
            from m in db.StockMovements
            join p in db.Products on m.ProductId equals p.Id
            join w in db.Warehouses on m.WarehouseId equals w.Id
            where m.TenantId == tenantId
            select new { m, p, w };

        if (productId.HasValue) query = query.Where(x => x.m.ProductId == productId);
        if (warehouseId.HasValue) query = query.Where(x => x.m.WarehouseId == warehouseId);

        var fromUtc = ReportDateRange.StartUtc(from);
        var toExclusiveUtc = ReportDateRange.EndExclusiveUtc(to);
        if (fromUtc.HasValue) query = query.Where(x => x.m.CreatedAt >= fromUtc.Value);
        if (toExclusiveUtc.HasValue) query = query.Where(x => x.m.CreatedAt < toExclusiveUtc.Value);

        return await query
            .OrderByDescending(x => x.m.CreatedAt)
            .Take(Math.Clamp(limit, 1, 1000))
            .Select(x => new StockMovementDto(
                x.m.Id,
                x.p.ArticleCode,
                x.p.Name,
                x.m.MovementType.ToString(),
                x.m.Quantity,
                x.m.BalanceAfter,
                x.m.Notes,
                x.m.CreatedAt,
                x.w.Id,
                x.w.Name))
            .ToListAsync(ct);
    }

    private string? ResolveAssetPath(string? relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return null;
        var absolute = files.GetAbsolutePath(relativePath);
        return File.Exists(absolute) ? absolute : null;
    }
}
