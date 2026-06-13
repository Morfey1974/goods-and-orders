using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using OrderManagement.Api.Data;
using OrderManagement.Api.Services;

var argsList = args.Where(a => !a.StartsWith('-')).ToList();
if (argsList.Count == 0)
{
    Console.Error.WriteLine("usage: RepairAssemblyStock repair [ASM-00001]");
    Console.Error.WriteLine("       RepairAssemblyStock add-component ASM-00001 CP-00161 1");
    Console.Error.WriteLine("       RepairAssemblyStock sync-recipe ASM-00001");
    return 1;
}

var mode = argsList[0].Equals("add-component", StringComparison.OrdinalIgnoreCase)
    ? "add"
    : argsList[0].Equals("sync-recipe", StringComparison.OrdinalIgnoreCase)
        ? "sync-recipe"
        : "repair";
var assemblyNumber = mode is "add" or "sync-recipe"
    ? argsList.ElementAtOrDefault(1)
    : argsList.ElementAtOrDefault(0) ?? "ASM-00001";
var componentArticle = mode == "add" ? argsList.ElementAtOrDefault(2) : null;
var perUnitArg = mode == "add" ? argsList.ElementAtOrDefault(3) : null;

if (mode == "add" && (assemblyNumber is null || componentArticle is null || perUnitArg is null))
{
    Console.Error.WriteLine("usage: RepairAssemblyStock add-component ASM-00001 CP-00161 1");
    return 1;
}

if (mode == "sync-recipe" && assemblyNumber is null)
{
    Console.Error.WriteLine("usage: RepairAssemblyStock sync-recipe ASM-00001");
    return 1;
}

if (!decimal.TryParse(perUnitArg?.Replace(',', '.'), System.Globalization.NumberStyles.Any,
        System.Globalization.CultureInfo.InvariantCulture, out var perUnitQty) && mode == "add")
{
    Console.Error.WriteLine("Invalid per-unit quantity.");
    return 1;
}

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

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseNpgsql(connectionString)
    .Options;

await using var db = new AppDbContext(options);

var assembly = await db.StockAssemblies
    .AsNoTracking()
    .FirstOrDefaultAsync(a => a.AssemblyNumber == assemblyNumber);
if (assembly is null)
{
    Console.Error.WriteLine($"Assembly {assemblyNumber} not found.");
    return 1;
}

await using var scopeDb = new AppDbContext(options);
var warehouse = new WarehouseService(scopeDb);
var inventoryCost = new InventoryCostService(scopeDb, warehouse);
var assemblyService = new AssemblyService(scopeDb, warehouse, inventoryCost, new ArticleSequenceService(scopeDb));

try
{
    if (mode == "add")
    {
        var component = await db.Products.AsNoTracking()
            .FirstOrDefaultAsync(p => p.ArticleCode == componentArticle && p.TenantId == assembly.TenantId);
        if (component is null)
        {
            Console.Error.WriteLine($"Product {componentArticle} not found.");
            return 1;
        }

        Console.WriteLine(
            $"Adding {componentArticle} × {perUnitQty} per unit to {assemblyNumber} (tenant {assembly.TenantId})…");
        await assemblyService.AddPostedComponentLineAsync(
            assembly.TenantId, assembly.Id, component.Id, perUnitQty, CancellationToken.None);
    }
    else if (mode == "sync-recipe")
    {
        Console.WriteLine($"Syncing output product recipe from {assemblyNumber} (tenant {assembly.TenantId})…");
        await assemblyService.SyncOutputProductRecipeFromAssemblyAsync(
            assembly.TenantId, assembly.Id, CancellationToken.None);
    }
    else
    {
        Console.WriteLine($"Repairing under-issued components for {assemblyNumber} (tenant {assembly.TenantId})…");
        await assemblyService.RepairUnderIssuedComponentsAsync(assembly.TenantId, assembly.Id, CancellationToken.None);
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Failed: {ex.Message}");
    return 1;
}

var lines = await (
    from l in db.StockAssemblyLines.AsNoTracking()
    join p in db.Products.AsNoTracking() on l.ProductId equals p.Id
    join a in db.StockAssemblies.AsNoTracking() on l.StockAssemblyId equals a.Id
    where a.AssemblyNumber == assemblyNumber
    orderby l.SortOrder
    select new { p.ArticleCode, l.Quantity, a.OutputQuantity, l.IssueMovementId }
).ToListAsync();

Console.WriteLine("\nСтроки сборки (на 1 изд. × кол-во изделий = списано):");
foreach (var line in lines)
{
    var total = AssemblyService.ComponentTotalQuantity(line.Quantity, line.OutputQuantity);
    Console.WriteLine($"  {line.ArticleCode}: {line.Quantity} × {line.OutputQuantity} = {total}");
}

Console.WriteLine("\nОстатки на складе:");
var codes = lines.Select(l => l.ArticleCode).ToList();
codes.Add("CP-00091");
var balances = await (
    from sb in db.StockBalances.AsNoTracking()
    join p in db.Products.AsNoTracking() on sb.ProductId equals p.Id
    join w in db.Warehouses.AsNoTracking() on sb.WarehouseId equals w.Id
    where codes.Contains(p.ArticleCode)
    orderby p.ArticleCode
    select new { p.ArticleCode, sb.Quantity, w.Name }
).ToListAsync();

foreach (var b in balances)
    Console.WriteLine($"  {b.ArticleCode}: {b.Quantity} ({b.Name})");

var lot = await (
    from il in db.InventoryLots.AsNoTracking()
    join a in db.StockAssemblies.AsNoTracking() on il.Id equals a.OutputLotId
    where a.AssemblyNumber == assemblyNumber
    select new { il.UnitCostIls, il.QuantityRemaining }
).FirstOrDefaultAsync();
if (lot is not null)
    Console.WriteLine($"\nСебестоимость CP-00091 (партия): {lot.UnitCostIls:F2} ₪/шт., остаток партии: {lot.QuantityRemaining}");

Console.WriteLine("\nГотово.");
return 0;
