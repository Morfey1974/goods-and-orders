using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

/// <summary>Moves stock rows to the system warehouse matching product type (CP/SP vs FG/BD).</summary>
public static class StockBalanceRepairService
{
    public static async Task RepairTenantAsync(AppDbContext db, Guid tenantId, CancellationToken ct = default)
    {
        var warehouses = await db.Warehouses.Where(w => w.TenantId == tenantId).ToListAsync(ct);
        var components = warehouses.FirstOrDefault(w => w.Kind == WarehouseKind.Components);
        var finished = warehouses.FirstOrDefault(w => w.Kind == WarehouseKind.FinishedGoods);
        if (components is null || finished is null) return;

        var balances = await (
            from b in db.StockBalances
            join p in db.Products on b.ProductId equals p.Id
            where p.TenantId == tenantId
            select new { Balance = b, p.ProductType, p.Id }
        ).ToListAsync(ct);

        foreach (var row in balances)
        {
            var targetId = ProductTypePrefixes.GetWarehouseKind(row.ProductType) == WarehouseKind.FinishedGoods
                ? finished.Id
                : components.Id;

            if (row.Balance.WarehouseId == targetId) continue;

            var existing = await db.StockBalances.FirstOrDefaultAsync(
                b => b.WarehouseId == targetId && b.ProductId == row.Id, ct);

            if (existing is not null)
            {
                existing.Quantity += row.Balance.Quantity;
                db.StockBalances.Remove(row.Balance);
            }
            else
            {
                row.Balance.WarehouseId = targetId;
            }
        }

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync(ct);
    }

    public static async Task RepairAllAsync(AppDbContext db, CancellationToken ct = default)
    {
        var tenantIds = await db.Warehouses.Select(w => w.TenantId).Distinct().ToListAsync(ct);
        foreach (var tenantId in tenantIds)
            await RepairTenantAsync(db, tenantId, ct);
    }
}
