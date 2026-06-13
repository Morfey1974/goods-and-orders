using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

/// <summary>Moves stock rows and FIFO lots to the system warehouse matching product type (CP/SP vs FG/BD).</summary>
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
            var targetId = TargetWarehouseId(row.ProductType, components.Id, finished.Id);

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

        var lots = await (
            from l in db.InventoryLots
            join p in db.Products on l.ProductId equals p.Id
            where p.TenantId == tenantId
            select new { Lot = l, p.ProductType }
        ).ToListAsync(ct);

        foreach (var row in lots)
        {
            var targetId = TargetWarehouseId(row.ProductType, components.Id, finished.Id);
            if (row.Lot.WarehouseId != targetId)
                row.Lot.WarehouseId = targetId;
        }

        var avgCosts = await (
            from c in db.InventoryAverageCosts
            join p in db.Products on c.ProductId equals p.Id
            where p.TenantId == tenantId
            select new { Cost = c, p.ProductType, p.Id }
        ).ToListAsync(ct);

        foreach (var row in avgCosts)
        {
            var targetId = TargetWarehouseId(row.ProductType, components.Id, finished.Id);
            if (row.Cost.WarehouseId == targetId) continue;

            var existing = await db.InventoryAverageCosts.FirstOrDefaultAsync(
                c => c.TenantId == tenantId && c.ProductId == row.Id && c.WarehouseId == targetId, ct);

            if (existing is not null)
            {
                db.InventoryAverageCosts.Remove(row.Cost);
            }
            else
            {
                row.Cost.WarehouseId = targetId;
            }
        }

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync(ct);
    }

    private static Guid TargetWarehouseId(ProductType productType, Guid componentsId, Guid finishedId) =>
        ProductTypePrefixes.GetWarehouseKind(productType) == WarehouseKind.FinishedGoods
            ? finishedId
            : componentsId;

    public static async Task RepairAllAsync(AppDbContext db, CancellationToken ct = default)
    {
        var tenantIds = await db.Warehouses.Select(w => w.TenantId).Distinct().ToListAsync(ct);
        foreach (var tenantId in tenantIds)
            await RepairTenantAsync(db, tenantId, ct);
    }
}
