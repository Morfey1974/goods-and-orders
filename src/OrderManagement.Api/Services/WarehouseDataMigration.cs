using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

/// <summary>Moves legacy single-warehouse balances to CP/FG split warehouses.</summary>
public static class WarehouseDataMigration
{
    public static async Task ApplyAsync(AppDbContext db, CancellationToken ct = default)
    {
        var tenantIds = await db.Products.Select(p => p.TenantId)
            .Union(db.Warehouses.Select(w => w.TenantId))
            .Distinct()
            .ToListAsync(ct);

        foreach (var tenantId in tenantIds)
            await MigrateTenantAsync(db, tenantId, ct);
    }

    private static async Task MigrateTenantAsync(AppDbContext db, Guid tenantId, CancellationToken ct)
    {
        var warehouses = await db.Warehouses.Where(w => w.TenantId == tenantId).ToListAsync(ct);

        Warehouse? components = warehouses.FirstOrDefault(w => w.Kind == WarehouseKind.Components);
        Warehouse? finished = warehouses.FirstOrDefault(w => w.Kind == WarehouseKind.FinishedGoods);

        var legacy = warehouses.FirstOrDefault(w => w.Kind == default && w.Name == "Main")
                     ?? warehouses.FirstOrDefault(w => w.IsDefault)
                     ?? warehouses.FirstOrDefault();

        if (finished is null && legacy is not null)
        {
            legacy.Kind = WarehouseKind.FinishedGoods;
            legacy.Name = WarehouseService.FinishedGoodsWarehouseName;
            legacy.IsDefault = true;
            finished = legacy;
        }

        if (components is null)
        {
            components = new Warehouse
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                Kind = WarehouseKind.Components,
                Name = WarehouseService.ComponentsWarehouseName,
                IsDefault = false
            };
            db.Warehouses.Add(components);
        }

        if (finished is null)
        {
            finished = new Warehouse
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                Kind = WarehouseKind.FinishedGoods,
                Name = WarehouseService.FinishedGoodsWarehouseName,
                IsDefault = true
            };
            db.Warehouses.Add(finished);
        }

        await db.SaveChangesAsync(ct);

        if (legacy is null || legacy.Id == components.Id || legacy.Id == finished.Id)
            return;

        var balances = await (
            from b in db.StockBalances
            join p in db.Products on b.ProductId equals p.Id
            where b.WarehouseId == legacy.Id && p.TenantId == tenantId
            select new { Balance = b, p.ProductType }
        ).ToListAsync(ct);

        foreach (var row in balances)
        {
            var targetWh = ProductTypePrefixes.GetWarehouseKind(row.ProductType) == WarehouseKind.FinishedGoods
                ? finished
                : components;

            var existing = await db.StockBalances.FirstOrDefaultAsync(
                b => b.WarehouseId == targetWh.Id && b.ProductId == row.Balance.ProductId, ct);

            if (existing is not null)
            {
                existing.Quantity += row.Balance.Quantity;
                db.StockBalances.Remove(row.Balance);
            }
            else
            {
                row.Balance.WarehouseId = targetWh.Id;
            }
        }

        var orphanLegacy = await db.StockBalances
            .Where(b => b.WarehouseId == legacy.Id)
            .ToListAsync(ct);
        if (orphanLegacy.Count == 0 && !warehouses.Any(w => w.Id == legacy.Id && w != legacy))
        {
            // keep legacy row if other tenants share - only delete if empty and only legacy wh
        }

        if (orphanLegacy.Count == 0)
            db.Warehouses.Remove(legacy);

        await db.SaveChangesAsync(ct);
    }
}
