using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using OrderManagement.Api.Data;
using OrderManagement.Api.Services;

var cwd = Directory.GetCurrentDirectory();
var apiDir = Path.Combine(cwd, "src", "OrderManagement.Api");
if (!Directory.Exists(apiDir))
{
    apiDir = Path.GetFullPath(Path.Combine(cwd, "..", "..", "src", "OrderManagement.Api"));
}
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

Guid? tenantId = null;
if (args.Length > 0)
{
    if (!Guid.TryParse(args[0], out var parsed))
    {
        Console.Error.WriteLine("usage: ClearStockData [tenantId]");
        return 1;
    }
    tenantId = parsed;
}

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseNpgsql(connectionString)
    .Options;

await using var db = new AppDbContext(options);

Console.WriteLine(tenantId is null
    ? "Clearing stock data for ALL tenants..."
    : $"Clearing stock data for tenant {tenantId}...");

var result = await StockInventoryResetService.ClearAllAsync(db, tenantId);

Console.WriteLine($"Lot allocations deleted: {result.LotAllocationsDeleted}");
Console.WriteLine($"FIFO lots deleted: {result.LotsDeleted}");
Console.WriteLine($"WAC records deleted: {result.AverageCostsDeleted}");
Console.WriteLine($"Stock movements deleted: {result.MovementsDeleted}");
Console.WriteLine($"Stock balances deleted: {result.BalancesDeleted}");
Console.WriteLine($"Orders StockDeducted reset: {result.OrdersStockFlagReset}");
Console.WriteLine($"Products TrackInventory reset: {result.ProductsTrackInventoryReset}");
Console.WriteLine("Done. Products and warehouses are unchanged; quantities are zero.");

return 0;
