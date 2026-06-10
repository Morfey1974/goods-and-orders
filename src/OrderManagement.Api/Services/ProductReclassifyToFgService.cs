using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public record ProductReclassifyLineResult(
    string OldArticleCode,
    string NewArticleCode,
    string ProductName,
    decimal QuantityMoved,
    bool Success,
    string? Error);

public record ProductReclassifyBatchResult(
    IReadOnlyList<ProductReclassifyLineResult> Lines,
    int ArticleSequenceFgNextNumber);

public static class ProductReclassifyToFgService
{
    /// <summary>
    /// Renames CP-* articles to FG-* (same number), sets FinishedGood, assigns FG warehouse,
    /// moves balances/lots/WAC/purchase lines/stock movements to finished-goods warehouse.
    /// Does not create stock movements.
    /// </summary>
    public static async Task<ProductReclassifyBatchResult> ReclassifyAsync(
        AppDbContext db,
        Guid tenantId,
        IReadOnlyList<string> oldArticleCodes,
        bool dryRun,
        CancellationToken ct = default)
    {
        var warehouseService = new WarehouseService(db);
        var (componentsWh, finishedWh) = await warehouseService.EnsureWarehousesAsync(tenantId, ct);

        var results = new List<ProductReclassifyLineResult>();
        var now = DateTime.UtcNow;

        foreach (var oldCode in oldArticleCodes.Select(c => c.Trim()).Where(c => c.Length > 0))
        {
            var newCode = ToFgArticleCode(oldCode);
            if (newCode is null)
            {
                results.Add(new ProductReclassifyLineResult(oldCode, "?", "?", 0, false, "Invalid CP article format."));
                continue;
            }

            var product = await db.Products
                .FirstOrDefaultAsync(p => p.TenantId == tenantId && p.ArticleCode == oldCode, ct);

            if (product is null)
            {
                results.Add(new ProductReclassifyLineResult(oldCode, newCode, "?", 0, false, "Product not found."));
                continue;
            }

            var newTaken = await db.Products.AnyAsync(
                p => p.TenantId == tenantId && p.ArticleCode == newCode && p.Id != product.Id, ct);
            if (newTaken)
            {
                results.Add(new ProductReclassifyLineResult(
                    oldCode, newCode, product.Name, 0, false, $"{newCode} already exists."));
                continue;
            }

            var balances = await db.StockBalances
                .Where(b => b.ProductId == product.Id)
                .ToListAsync(ct);

            var qtyFromOther = balances
                .Where(b => b.WarehouseId != finishedWh.Id)
                .Sum(b => b.Quantity);

            var fgBalance = balances.FirstOrDefault(b => b.WarehouseId == finishedWh.Id);
            var fgQtyBefore = fgBalance?.Quantity ?? 0;
            var fgQtyAfter = fgQtyBefore + qtyFromOther;

            if (!dryRun)
            {
                product.ArticleCode = newCode;
                product.ProductType = ProductType.FinishedGood;
                product.WarehouseId = finishedWh.Id;
                product.Version++;
                product.UpdatedAt = now;

                foreach (var b in balances.Where(b => b.WarehouseId != finishedWh.Id))
                    b.Quantity = 0;

                if (fgQtyAfter > 0)
                {
                    if (fgBalance is null)
                    {
                        db.StockBalances.Add(new StockBalance
                        {
                            Id = Guid.NewGuid(),
                            WarehouseId = finishedWh.Id,
                            ProductId = product.Id,
                            Quantity = fgQtyAfter,
                        });
                    }
                    else
                    {
                        fgBalance.Quantity = fgQtyAfter;
                    }
                }
                else if (fgBalance is not null)
                {
                    fgBalance.Quantity = 0;
                }

                var lots = await db.InventoryLots
                    .Where(l => l.TenantId == tenantId && l.ProductId == product.Id && l.WarehouseId != finishedWh.Id)
                    .ToListAsync(ct);
                foreach (var lot in lots)
                    lot.WarehouseId = finishedWh.Id;

                var receiptLines = await db.PurchaseReceiptLines
                    .Where(l => l.ProductId == product.Id && l.WarehouseId != finishedWh.Id)
                    .ToListAsync(ct);
                foreach (var line in receiptLines)
                    line.WarehouseId = finishedWh.Id;

                var movements = await db.StockMovements
                    .Where(m => m.TenantId == tenantId && m.ProductId == product.Id && m.WarehouseId != finishedWh.Id)
                    .ToListAsync(ct);
                foreach (var movement in movements)
                    movement.WarehouseId = finishedWh.Id;

                var wacRows = await db.InventoryAverageCosts
                    .Where(c => c.TenantId == tenantId && c.ProductId == product.Id)
                    .ToListAsync(ct);
                var fgWac = wacRows.FirstOrDefault(c => c.WarehouseId == finishedWh.Id);
                var otherWac = wacRows.Where(c => c.WarehouseId != finishedWh.Id).ToList();
                if (otherWac.Count > 0)
                {
                    var bestOther = otherWac.OrderByDescending(c => c.UpdatedAt).First();
                    if (fgWac is null && bestOther.UnitCostIls > 0)
                    {
                        db.InventoryAverageCosts.Add(new InventoryAverageCost
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            ProductId = product.Id,
                            WarehouseId = finishedWh.Id,
                            UnitCostIls = bestOther.UnitCostIls,
                            UpdatedAt = now,
                        });
                    }
                    db.InventoryAverageCosts.RemoveRange(otherWac);
                }
            }

            results.Add(new ProductReclassifyLineResult(
                oldCode, newCode, product.Name, qtyFromOther, true, null));
        }

        var newFgCodes = results.Where(r => r.Success).Select(r => r.NewArticleCode).ToList();
        var fgNext = await BumpFgArticleSequenceAsync(db, tenantId, newFgCodes, dryRun, ct);

        if (!dryRun && results.Any(r => r.Success))
            await db.SaveChangesAsync(ct);

        return new ProductReclassifyBatchResult(results, fgNext);
    }

    public static string? ToFgArticleCode(string oldCode)
    {
        if (!oldCode.StartsWith("CP-", StringComparison.OrdinalIgnoreCase))
            return null;
        var suffix = oldCode[3..];
        if (suffix.Length == 0 || !suffix.All(char.IsDigit))
            return null;
        return $"FG-{suffix}";
    }

    private static async Task<int> BumpFgArticleSequenceAsync(
        AppDbContext db,
        Guid tenantId,
        IReadOnlyList<string> additionalFgCodes,
        bool dryRun,
        CancellationToken ct)
    {
        const string prefix = "FG";
        var maxFromProducts = await db.Products
            .Where(p => p.TenantId == tenantId && p.ArticleCode.StartsWith(prefix + "-"))
            .Select(p => p.ArticleCode)
            .ToListAsync(ct);

        var maxNum = 0;
        foreach (var code in maxFromProducts.Concat(additionalFgCodes))
        {
            if (TryParseArticleNumber(code, prefix, out var n) && n > maxNum)
                maxNum = n;
        }

        var requiredNext = maxNum + 1;
        var seq = await db.ArticleSequences
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.Prefix == prefix, ct);

        if (seq is null)
        {
            if (!dryRun)
            {
                seq = new ArticleSequence
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    Prefix = prefix,
                    NextNumber = requiredNext,
                };
                db.ArticleSequences.Add(seq);
            }
            return requiredNext;
        }

        if (seq.NextNumber < requiredNext && !dryRun)
            seq.NextNumber = requiredNext;

        return Math.Max(seq.NextNumber, requiredNext);
    }

    private static bool TryParseArticleNumber(string articleCode, string prefix, out int number)
    {
        number = 0;
        if (!articleCode.StartsWith(prefix + "-", StringComparison.OrdinalIgnoreCase))
            return false;
        var part = articleCode[(prefix.Length + 1)..];
        return int.TryParse(part, out number);
    }
}
