using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class InventoryCostService(AppDbContext db, WarehouseService warehouse)
{
    public static decimal RoundIls(decimal value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);

    public async Task<InventoryCostMethod> GetMethodAsync(Guid tenantId, CancellationToken ct)
    {
        var method = await db.Tenants
            .AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.InventoryCostMethod)
            .FirstOrDefaultAsync(ct);
        return method;
    }

    /// <summary>Receipt with FIFO lot (and WAC cache update).</summary>
    public async Task<(InventoryLot Lot, StockMovement Movement)> ReceiveAsync(
        Guid tenantId,
        Guid productId,
        Guid warehouseId,
        decimal quantity,
        decimal unitCostIls,
        DateTime receivedAt,
        InventoryLotSource source,
        Guid? sourceId,
        string? notes,
        CancellationToken ct)
    {
        quantity = StockQuantity.Normalize(quantity);
        unitCostIls = RoundIls(unitCostIls);
        if (quantity <= 0)
            throw new InvalidOperationException("Quantity must be positive.");
        if (unitCostIls <= 0)
            throw new InvalidOperationException("Unit cost in ILS must be positive.");

        var movementDate = DateTime.SpecifyKind(receivedAt.Date, DateTimeKind.Utc);
        var totalCost = RoundIls(unitCostIls * quantity);

        var lot = new InventoryLot
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ProductId = productId,
            WarehouseId = warehouseId,
            QuantityRemaining = quantity,
            UnitCostIls = unitCostIls,
            ReceivedAt = movementDate,
            SourceType = source,
            SourceId = sourceId,
            CreatedAt = DateTime.UtcNow
        };
        db.InventoryLots.Add(lot);

        await UpdateWacOnReceiptAsync(tenantId, productId, warehouseId, quantity, unitCostIls, ct);

        var movement = await warehouse.ApplyMovementAsync(
            tenantId,
            warehouseId,
            productId,
            StockMovementType.Receipt,
            quantity,
            notes,
            ct,
            movementDate,
            unitCostIls,
            totalCost);

        await db.SaveChangesAsync(ct);
        return (lot, movement);
    }

    /// <summary>Issue stock using tenant cost method (FIFO default).</summary>
    public async Task<StockMovement> IssueAsync(
        Guid tenantId,
        Guid productId,
        Guid warehouseId,
        decimal quantity,
        string? notes,
        DateTime movementDate,
        CancellationToken ct)
    {
        quantity = StockQuantity.Normalize(quantity);
        if (quantity <= 0)
            throw new InvalidOperationException("Quantity must be positive.");

        var method = await GetMethodAsync(tenantId, ct);
        var normalizedDate = DateTime.SpecifyKind(movementDate.Date, DateTimeKind.Utc);

        return method == InventoryCostMethod.Wac
            ? await IssueWacAsync(tenantId, productId, warehouseId, quantity, notes, normalizedDate, ct)
            : await IssueFifoAsync(tenantId, productId, warehouseId, quantity, notes, normalizedDate, ct);
    }

    public async Task<decimal> GetAvailableIssueQuantityAsync(
        Guid tenantId,
        Guid productId,
        Guid warehouseId,
        CancellationToken ct)
    {
        var method = await GetMethodAsync(tenantId, ct);
        if (method == InventoryCostMethod.Wac)
        {
            var balance = await db.StockBalances
                .AsNoTracking()
                .FirstOrDefaultAsync(b => b.WarehouseId == warehouseId && b.ProductId == productId, ct);
            return balance?.Quantity ?? 0m;
        }

        return await db.InventoryLots
            .AsNoTracking()
            .Where(l =>
                l.TenantId == tenantId &&
                l.ProductId == productId &&
                l.WarehouseId == warehouseId &&
                l.QuantityRemaining > 0)
            .SumAsync(l => l.QuantityRemaining, ct);
    }

    private async Task<StockMovement> IssueFifoAsync(
        Guid tenantId,
        Guid productId,
        Guid warehouseId,
        decimal quantity,
        string? notes,
        DateTime movementDate,
        CancellationToken ct)
    {
        var lots = await db.InventoryLots
            .Where(l =>
                l.TenantId == tenantId &&
                l.ProductId == productId &&
                l.WarehouseId == warehouseId &&
                l.QuantityRemaining > 0)
            .OrderBy(l => l.ReceivedAt)
            .ThenBy(l => l.CreatedAt)
            .ToListAsync(ct);

        var remaining = quantity;
        decimal totalCost = 0;
        var pendingAllocations = new List<(InventoryLot Lot, decimal Qty, decimal LineCost)>();

        foreach (var lot in lots)
        {
            if (remaining <= 0) break;

            var take = Math.Min(remaining, lot.QuantityRemaining);
            take = StockQuantity.Normalize(take);
            if (take <= 0) continue;

            lot.QuantityRemaining = StockQuantity.Normalize(lot.QuantityRemaining - take);
            var lineCost = RoundIls(take * lot.UnitCostIls);
            totalCost += lineCost;
            pendingAllocations.Add((lot, take, lineCost));
            remaining -= take;
        }

        if (remaining > 0)
        {
            var articleCode = await ProductRefFormatter.ArticleCodeAsync(db, tenantId, productId, ct);
            throw new InvalidOperationException(
                $"Insufficient stock for {articleCode} (missing {StockQuantity.Normalize(remaining)} units).");
        }

        totalCost = RoundIls(totalCost);
        var unitCost = RoundIls(totalCost / quantity);

        var movement = await warehouse.ApplyMovementAsync(
            tenantId,
            warehouseId,
            productId,
            StockMovementType.Issue,
            quantity,
            notes,
            ct,
            movementDate,
            unitCost,
            totalCost);

        foreach (var (lot, take, lineCost) in pendingAllocations)
        {
            db.InventoryLotAllocations.Add(new InventoryLotAllocation
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                StockMovementId = movement.Id,
                InventoryLotId = lot.Id,
                Quantity = take,
                UnitCostIls = lot.UnitCostIls,
                TotalCostIls = lineCost
            });
        }

        await db.SaveChangesAsync(ct);
        return movement;
    }

    private async Task<StockMovement> IssueWacAsync(
        Guid tenantId,
        Guid productId,
        Guid warehouseId,
        decimal quantity,
        string? notes,
        DateTime movementDate,
        CancellationToken ct)
    {
        var avg = await db.InventoryAverageCosts
            .FirstOrDefaultAsync(
                c => c.TenantId == tenantId && c.ProductId == productId && c.WarehouseId == warehouseId,
                ct);

        if (avg is null || avg.UnitCostIls <= 0)
        {
            throw new InvalidOperationException(
                "No average cost defined for this product. Post a purchase receipt or opening balance first.");
        }

        var unitCost = avg.UnitCostIls;
        var totalCost = RoundIls(unitCost * quantity);

        return await warehouse.ApplyMovementAsync(
            tenantId,
            warehouseId,
            productId,
            StockMovementType.Issue,
            quantity,
            notes,
            ct,
            movementDate,
            unitCost,
            totalCost);
    }

    private async Task UpdateWacOnReceiptAsync(
        Guid tenantId,
        Guid productId,
        Guid warehouseId,
        decimal incomingQty,
        decimal incomingUnitCost,
        CancellationToken ct)
    {
        var balance = await db.StockBalances
            .FirstOrDefaultAsync(b => b.WarehouseId == warehouseId && b.ProductId == productId, ct);

        var existingQty = balance?.Quantity ?? 0;
        var row = await db.InventoryAverageCosts
            .FirstOrDefaultAsync(
                c => c.TenantId == tenantId && c.ProductId == productId && c.WarehouseId == warehouseId,
                ct);

        if (row is null)
        {
            db.InventoryAverageCosts.Add(new InventoryAverageCost
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ProductId = productId,
                WarehouseId = warehouseId,
                UnitCostIls = incomingUnitCost,
                UpdatedAt = DateTime.UtcNow
            });
            return;
        }

        var totalQty = existingQty + incomingQty;
        if (totalQty <= 0)
        {
            row.UnitCostIls = incomingUnitCost;
        }
        else
        {
            var existingValue = existingQty * row.UnitCostIls;
            var incomingValue = incomingQty * incomingUnitCost;
            row.UnitCostIls = RoundIls((existingValue + incomingValue) / totalQty);
        }

        row.UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>Undo a sale issue: restore FIFO lots (if any) and stock balance, then remove the movement.</summary>
    public async Task ReverseIssueAsync(Guid tenantId, Guid movementId, CancellationToken ct)
    {
        var movement = await db.StockMovements
            .FirstOrDefaultAsync(m => m.Id == movementId && m.TenantId == tenantId, ct);
        if (movement is null || movement.MovementType != StockMovementType.Issue)
            return;

        var allocations = await db.InventoryLotAllocations
            .Include(a => a.Lot)
            .Where(a => a.StockMovementId == movementId && a.TenantId == tenantId)
            .ToListAsync(ct);

        foreach (var allocation in allocations)
        {
            allocation.Lot.QuantityRemaining = StockQuantity.Normalize(
                allocation.Lot.QuantityRemaining + allocation.Quantity);
        }

        if (allocations.Count > 0)
            db.InventoryLotAllocations.RemoveRange(allocations);

        var balance = await warehouse.GetOrCreateBalanceAsync(
            movement.WarehouseId,
            movement.ProductId,
            ct);
        balance.Quantity = StockQuantity.Normalize(balance.Quantity + movement.Quantity);

        db.StockMovements.Remove(movement);
        await db.SaveChangesAsync(ct);
    }

    public static decimal ResolveLineUnitCostIls(
        string? receiptCurrency,
        decimal? unitPrice,
        decimal? unitCostIls)
    {
        if (unitCostIls is > 0)
            return RoundIls(unitCostIls.Value);

        var currency = string.IsNullOrWhiteSpace(receiptCurrency)
            ? "ILS"
            : receiptCurrency.Trim().ToUpperInvariant();

        if (currency is "ILS" or "NIS" && unitPrice is > 0)
            return RoundIls(unitPrice.Value);

        throw new InvalidOperationException(
            "Unit cost in ILS is required for stock items when the receipt currency is not ILS.");
    }
}
