using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using OrderManagement.Api.Data;
using OrderManagement.Api.Services;

/// <summary>
/// Delete posted purchase receipts and reverse unconsumed stock.
/// usage: DeletePurchaseReceipts [--dry-run] &lt;tenantId&gt; GR-00010 GR-00011 ...
/// </summary>

var cwd = Directory.GetCurrentDirectory();
var apiDir = Path.Combine(cwd, "src", "OrderManagement.Api");
if (!Directory.Exists(apiDir))
    apiDir = Path.GetFullPath(Path.Combine(cwd, "..", "..", "src", "OrderManagement.Api"));

var config = new ConfigurationBuilder()
    .SetBasePath(apiDir)
    .AddJsonFile("appsettings.json", optional: false)
    .AddJsonFile("appsettings.Development.json", optional: true)
    .Build();

var connectionString = config.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    Console.Error.WriteLine("DefaultConnection is not configured.");
    return 1;
}

var dryRun = args.Contains("--dry-run", StringComparer.OrdinalIgnoreCase);
var verifyTenant = args.Contains("--verify-tenant", StringComparer.OrdinalIgnoreCase);
var argsList = args.Where(a => !a.StartsWith("-")).ToList();

if (verifyTenant)
{
    if (argsList.Count != 1 || !Guid.TryParse(argsList[0], out var verifyId))
    {
        Console.WriteLine("usage: DeletePurchaseReceipts --verify-tenant <tenantId>");
        return 1;
    }

    await using var verifyDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
        .UseNpgsql(connectionString).Options);

    var receiptCount = await verifyDb.PurchaseReceipts.CountAsync(r => r.TenantId == verifyId);
    var grMoves = await verifyDb.StockMovements.CountAsync(m =>
        m.TenantId == verifyId && m.Notes != null && m.Notes.Contains("GR GR-0001"));
    var positiveBalances = await verifyDb.StockBalances
        .Where(b => b.Quantity > 0 && b.Warehouse.TenantId == verifyId)
        .CountAsync();
    var activeLots = await verifyDb.InventoryLots.CountAsync(l =>
        l.TenantId == verifyId && l.QuantityRemaining > 0);

    Console.WriteLine($"Receipts: {receiptCount}");
    Console.WriteLine($"Movements (GR-0001x): {grMoves}");
    Console.WriteLine($"Stock balances with qty>0: {positiveBalances}");
    Console.WriteLine($"FIFO lots with remaining qty: {activeLots}");
    return 0;
}

if (argsList.Count < 2)
{
    Console.WriteLine("usage: DeletePurchaseReceipts [--dry-run] <tenantId> GR-00010 [GR-00011 ...]");
    return 1;
}

if (!Guid.TryParse(argsList[0], out var tenantId))
{
    Console.Error.WriteLine("Invalid tenantId GUID.");
    return 1;
}

var receiptNumbers = argsList.Skip(1).ToList();

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseNpgsql(connectionString)
    .Options;

await using var db = new AppDbContext(options);

var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId);
if (tenant is null)
{
    Console.Error.WriteLine($"Tenant {tenantId} not found.");
    return 1;
}

var receipts = await db.PurchaseReceipts
    .Include(r => r.Lines)
    .ThenInclude(l => l.Product)
    .Where(r => r.TenantId == tenantId && receiptNumbers.Contains(r.ReceiptNumber))
    .ToListAsync();

Console.WriteLine($"Tenant: {tenant.BusinessName}");
Console.WriteLine(dryRun ? "Mode: DRY RUN" : "Mode: DELETE with stock reversal");
Console.WriteLine();

foreach (var number in receiptNumbers)
{
    var receipt = receipts.FirstOrDefault(r =>
        string.Equals(r.ReceiptNumber, number, StringComparison.OrdinalIgnoreCase));
    if (receipt is null)
    {
        Console.Error.WriteLine($"Not found: {number}");
        return 1;
    }

    Console.WriteLine($"{receipt.ReceiptNumber}  {receipt.Status}  {receipt.DocumentDate:yyyy-MM-dd}  {receipt.Currency}  lines={receipt.Lines.Count}");

    foreach (var line in receipt.Lines)
    {
        var lot = await db.InventoryLots.AsNoTracking().FirstOrDefaultAsync(l =>
            l.TenantId == tenantId &&
            l.SourceType == OrderManagement.Api.Entities.InventoryLotSource.PurchaseReceipt &&
            l.SourceId == line.Id);

        var balance = await db.StockBalances.AsNoTracking()
            .FirstOrDefaultAsync(b => b.ProductId == line.ProductId &&
                (lot == null || b.WarehouseId == lot.WarehouseId));

        Console.WriteLine(
            $"  {line.Product.ArticleCode,-10} qty={line.Quantity,6}  lotRemaining={lot?.QuantityRemaining.ToString() ?? "—",6}  balance={balance?.Quantity.ToString() ?? "—"}");
    }
}

if (dryRun)
{
    Console.WriteLine();
    Console.WriteLine("Dry run complete. Re-run without --dry-run to delete.");
    return 0;
}

var service = new PurchaseReceiptService(
    db,
    new WarehouseService(db),
    new InventoryCostService(db, new WarehouseService(db)),
    new ArticleSequenceService(db));

var deleted = await service.DeletePostedByNumbersAsync(tenantId, receiptNumbers, CancellationToken.None);

Console.WriteLine();
Console.WriteLine($"Deleted {deleted} receipt(s) with stock reversal.");
return 0;
