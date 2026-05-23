using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class WarehouseService(AppDbContext db)
{
    public const string ComponentsWarehouseName = "Склад комплектующих";
    public const string FinishedGoodsWarehouseName = "Склад готовых изделий";

    public async Task EnsureSystemWarehousesAsync(Guid tenantId, CancellationToken ct)
    {
        await EnsureWarehousesAsync(tenantId, ct);
        await StockBalanceRepairService.RepairTenantAsync(db, tenantId, ct);
    }

    public async Task<List<Warehouse>> ListAllAsync(Guid tenantId, CancellationToken ct)
    {
        await EnsureWarehousesAsync(tenantId, ct);
        return await db.Warehouses
            .Where(w => w.TenantId == tenantId)
            .OrderByDescending(w => w.Kind != WarehouseKind.Custom)
            .ThenBy(w => w.Kind)
            .ThenBy(w => w.Name)
            .ToListAsync(ct);
    }

    public async Task<(Warehouse Components, Warehouse FinishedGoods)> EnsureWarehousesAsync(
        Guid tenantId,
        CancellationToken ct)
    {
        var list = await db.Warehouses.Where(w => w.TenantId == tenantId).ToListAsync(ct);

        var components = list.Where(w => w.Kind == WarehouseKind.Components).OrderBy(w => w.CreatedAt).FirstOrDefault();
        var finished = list.Where(w => w.Kind == WarehouseKind.FinishedGoods).OrderByDescending(w => w.IsDefault).ThenBy(w => w.CreatedAt).FirstOrDefault();

        if (components is null)
        {
            components = new Warehouse
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                Kind = WarehouseKind.Components,
                Name = ComponentsWarehouseName,
                Description = ComponentsWarehouseName,
                IsDefault = false,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
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
                Name = FinishedGoodsWarehouseName,
                Description = FinishedGoodsWarehouseName,
                IsDefault = true,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            db.Warehouses.Add(finished);
        }

        if (components.Id == finished.Id)
            throw new InvalidOperationException("Warehouse configuration error.");

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync(ct);

        return (components, finished);
    }

    public async Task<Warehouse> CreateCustomAsync(
        Guid tenantId,
        string name,
        string? description,
        bool isActive,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Warehouse name is required.");

        await EnsureWarehousesAsync(tenantId, ct);

        var exists = await db.Warehouses.AnyAsync(
            w => w.TenantId == tenantId && w.Name == name.Trim(), ct);
        if (exists)
            throw new InvalidOperationException("A warehouse with this name already exists.");

        var wh = new Warehouse
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Kind = WarehouseKind.Custom,
            Name = name.Trim(),
            Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
            IsActive = isActive,
            IsDefault = false,
            CreatedAt = DateTime.UtcNow
        };
        db.Warehouses.Add(wh);
        await db.SaveChangesAsync(ct);
        return wh;
    }

    public async Task<Warehouse> UpdateAsync(
        Guid tenantId,
        Guid id,
        string name,
        string? description,
        bool isActive,
        CancellationToken ct)
    {
        var wh = await db.Warehouses.FirstOrDefaultAsync(w => w.Id == id && w.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Warehouse not found.");

        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Warehouse name is required.");

        var duplicate = await db.Warehouses.AnyAsync(
            w => w.TenantId == tenantId && w.Name == name.Trim() && w.Id != id, ct);
        if (duplicate)
            throw new InvalidOperationException("A warehouse with this name already exists.");

        wh.Name = name.Trim();
        wh.Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        wh.IsActive = isActive;

        if (wh.Kind.IsSystem() && !isActive)
            throw new InvalidOperationException("System warehouses cannot be deactivated.");

        await db.SaveChangesAsync(ct);
        return wh;
    }

    public async Task DeleteCustomAsync(Guid tenantId, Guid id, CancellationToken ct)
    {
        var wh = await db.Warehouses.FirstOrDefaultAsync(w => w.Id == id && w.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Warehouse not found.");

        if (wh.Kind.IsSystem())
            throw new InvalidOperationException("System warehouses cannot be deleted.");

        var hasStock = await db.StockBalances.AnyAsync(b => b.WarehouseId == id && b.Quantity != 0, ct);
        if (hasStock)
            throw new InvalidOperationException("Cannot delete warehouse with non-zero stock.");

        var hasMovements = await db.StockMovements.AnyAsync(m => m.WarehouseId == id, ct);
        if (hasMovements)
            throw new InvalidOperationException("Cannot delete warehouse with movement history.");

        db.Warehouses.Remove(wh);
        await db.SaveChangesAsync(ct);
    }

    public async Task<Warehouse?> GetByIdAsync(Guid tenantId, Guid warehouseId, CancellationToken ct) =>
        await db.Warehouses.FirstOrDefaultAsync(w => w.Id == warehouseId && w.TenantId == tenantId, ct);

    public async Task<Warehouse> GetForProductTypeAsync(Guid tenantId, ProductType type, CancellationToken ct)
    {
        var (components, finished) = await EnsureWarehousesAsync(tenantId, ct);
        return ProductTypePrefixes.GetWarehouseKind(type) == WarehouseKind.FinishedGoods
            ? finished
            : components;
    }

    public async Task<Warehouse> GetForProductAsync(Guid tenantId, Product product, CancellationToken ct) =>
        await GetForProductTypeAsync(tenantId, product.ProductType, ct);

    public async Task<Warehouse> ResolveReceiptWarehouseAsync(
        Guid tenantId,
        Product product,
        Guid? warehouseId,
        CancellationToken ct)
    {
        if (warehouseId is { } wid)
        {
            var wh = await GetByIdAsync(tenantId, wid, ct)
                ?? throw new InvalidOperationException("Warehouse not found.");
            if (!wh.IsActive)
                throw new InvalidOperationException("Warehouse is not active.");
            return wh;
        }

        return await GetForProductAsync(tenantId, product, ct);
    }

    [Obsolete("Use EnsureWarehousesAsync or GetForProductTypeAsync.")]
    public async Task<Warehouse> GetOrCreateDefaultAsync(Guid tenantId, CancellationToken ct)
    {
        var (_, finished) = await EnsureWarehousesAsync(tenantId, ct);
        return finished;
    }

    public async Task<StockBalance> GetOrCreateBalanceAsync(Guid warehouseId, Guid productId, CancellationToken ct)
    {
        var balance = await db.StockBalances
            .FirstOrDefaultAsync(b => b.WarehouseId == warehouseId && b.ProductId == productId, ct);

        if (balance is not null) return balance;

        balance = new StockBalance
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            ProductId = productId,
            Quantity = 0
        };
        db.StockBalances.Add(balance);
        await db.SaveChangesAsync(ct);
        return balance;
    }

    public async Task<StockMovement> ApplyMovementAsync(
        Guid tenantId,
        Guid warehouseId,
        Guid productId,
        StockMovementType type,
        decimal quantity,
        string? notes,
        CancellationToken ct)
    {
        if (quantity <= 0)
            throw new InvalidOperationException("Quantity must be positive.");

        var balance = await GetOrCreateBalanceAsync(warehouseId, productId, ct);

        if (type == StockMovementType.Adjustment)
        {
            balance.Quantity = quantity;
        }
        else
        {
            var delta = type == StockMovementType.Receipt ? quantity : -quantity;
            balance.Quantity += delta;
            if (balance.Quantity < 0)
                throw new InvalidOperationException("Insufficient stock.");
        }

        var movement = new StockMovement
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            ProductId = productId,
            MovementType = type,
            Quantity = quantity,
            BalanceAfter = balance.Quantity,
            Notes = notes,
            CreatedAt = DateTime.UtcNow
        };

        db.StockMovements.Add(movement);
        await db.SaveChangesAsync(ct);
        return movement;
    }
}
