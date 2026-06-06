using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;

namespace OrderManagement.Api.Services;

/// <summary>Clears all warehouse quantities, movements, FIFO layers and WAC — products remain.</summary>
public static class StockInventoryResetService
{
    public record Result(
        int LotAllocationsDeleted,
        int LotsDeleted,
        int AverageCostsDeleted,
        int MovementsDeleted,
        int BalancesDeleted,
        int OrdersStockFlagReset,
        int ProductsTrackInventoryReset);

    public static async Task<Result> ClearAllAsync(AppDbContext db, Guid? tenantId = null, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        IQueryable<Entities.InventoryLotAllocation> allocations = db.InventoryLotAllocations;
        IQueryable<Entities.InventoryLot> lots = db.InventoryLots;
        IQueryable<Entities.InventoryAverageCost> averages = db.InventoryAverageCosts;
        IQueryable<Entities.StockMovement> movements = db.StockMovements;
        IQueryable<Entities.StockBalance> balances = db.StockBalances;
        IQueryable<Entities.Order> orders = db.Orders;
        IQueryable<Entities.Product> products = db.Products;

        if (tenantId is not null)
        {
            allocations = allocations.Where(x => x.TenantId == tenantId);
            lots = lots.Where(x => x.TenantId == tenantId);
            averages = averages.Where(x => x.TenantId == tenantId);
            movements = movements.Where(x => x.TenantId == tenantId);
            balances = balances.Where(b => db.Products.Any(p => p.Id == b.ProductId && p.TenantId == tenantId));
            orders = orders.Where(x => x.TenantId == tenantId);
            products = products.Where(x => x.TenantId == tenantId);
        }

        var lotAllocationsDeleted = await allocations.ExecuteDeleteAsync(ct);
        var lotsDeleted = await lots.ExecuteDeleteAsync(ct);
        var averageCostsDeleted = await averages.ExecuteDeleteAsync(ct);
        var movementsDeleted = await movements.ExecuteDeleteAsync(ct);
        var balancesDeleted = await balances.ExecuteDeleteAsync(ct);
        var ordersStockFlagReset = await orders.ExecuteUpdateAsync(
            s => s.SetProperty(o => o.StockDeducted, false),
            ct);
        var productsTrackInventoryReset = await products.ExecuteUpdateAsync(
            s => s.SetProperty(p => p.TrackInventory, false),
            ct);

        await tx.CommitAsync(ct);

        return new Result(
            lotAllocationsDeleted,
            lotsDeleted,
            averageCostsDeleted,
            movementsDeleted,
            balancesDeleted,
            ordersStockFlagReset,
            productsTrackInventoryReset);
    }
}
