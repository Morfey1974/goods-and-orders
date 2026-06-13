using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

/// <summary>
/// Recalculates <see cref="StockMovement.BalanceAfter"/> by business date (MovementDate, then CreatedAt),
/// not posting order — backdated issues/receipts otherwise show impossible running balances.
/// </summary>
public static class StockMovementBalanceRepairService
{
    public static async Task RepairAllAsync(AppDbContext db, CancellationToken ct = default)
    {
        var tenantIds = await db.StockMovements.Select(m => m.TenantId).Distinct().ToListAsync(ct);
        foreach (var tenantId in tenantIds)
            await RepairTenantAsync(db, tenantId, ct);
    }

    public static async Task RepairTenantAsync(AppDbContext db, Guid tenantId, CancellationToken ct = default) =>
        await RepairAsync(db, tenantId, warehouseId: null, productId: null, ct);

    public static async Task RepairProductWarehouseAsync(
        AppDbContext db,
        Guid tenantId,
        Guid warehouseId,
        Guid productId,
        CancellationToken ct) =>
        await RepairAsync(db, tenantId, warehouseId, productId, ct);

    private static async Task RepairAsync(
        AppDbContext db,
        Guid tenantId,
        Guid? warehouseId,
        Guid? productId,
        CancellationToken ct)
    {
        var query = db.StockMovements.Where(m => m.TenantId == tenantId);
        if (warehouseId.HasValue)
            query = query.Where(m => m.WarehouseId == warehouseId.Value);
        if (productId.HasValue)
            query = query.Where(m => m.ProductId == productId.Value);

        var movements = await query
            .OrderBy(m => m.WarehouseId)
            .ThenBy(m => m.ProductId)
            .ThenBy(m => m.MovementDate)
            .ThenBy(m => m.CreatedAt)
            .ToListAsync(ct);

        if (movements.Count == 0) return;

        Guid? groupWarehouse = null;
        Guid? groupProduct = null;
        decimal running = 0;
        var changed = false;

        foreach (var movement in movements)
        {
            if (movement.WarehouseId != groupWarehouse || movement.ProductId != groupProduct)
            {
                groupWarehouse = movement.WarehouseId;
                groupProduct = movement.ProductId;
                running = 0;
            }

            running = ApplyMovement(running, movement);
            var normalized = StockQuantity.Normalize(running);
            if (movement.BalanceAfter != normalized)
            {
                movement.BalanceAfter = normalized;
                changed = true;
            }
        }

        if (!changed) return;

        await db.SaveChangesAsync(ct);
    }

    internal static decimal ApplyMovement(decimal running, StockMovement movement) =>
        movement.MovementType switch
        {
            StockMovementType.Receipt => running + movement.Quantity,
            StockMovementType.Issue => running - movement.Quantity,
            StockMovementType.Adjustment => movement.Quantity,
            _ => running,
        };
}
