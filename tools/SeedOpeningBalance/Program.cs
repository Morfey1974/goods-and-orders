using Microsoft.EntityFrameworkCore;

using Microsoft.Extensions.Configuration;

using OrderManagement.Api.Data;

using OrderManagement.Api.Entities;

using OrderManagement.Api.Services;



/// <summary>

/// One-time seed: YeshInvoice «ספירת מלאי» PDF 31.12.2024 → opening balance in DB.

/// usage: SeedOpeningBalance [--dry-run] [tenantId]

/// </summary>



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



var dryRun = args.Contains("--dry-run", StringComparer.OrdinalIgnoreCase);

var tenantArg = args.FirstOrDefault(a => !a.StartsWith("-", StringComparison.Ordinal));



var options = new DbContextOptionsBuilder<AppDbContext>()

    .UseNpgsql(connectionString)

    .Options;



await using var db = new AppDbContext(options);



if (string.IsNullOrWhiteSpace(tenantArg))

{

    var tenants = await db.Tenants.AsNoTracking()

        .OrderBy(t => t.BusinessName)

        .Select(t => new { t.Id, t.BusinessName })

        .ToListAsync();

    Console.WriteLine("Tenants (pass tenantId as argument):");

    foreach (var t in tenants)

        Console.WriteLine($"  {t.Id}  {t.BusinessName}");

    Console.WriteLine();

    Console.WriteLine("usage: SeedOpeningBalance [--dry-run] <tenantId>");

    return tenants.Count == 0 ? 1 : 0;

}



if (!Guid.TryParse(tenantArg, out var tenantId))

{

    Console.Error.WriteLine("Invalid tenantId GUID.");

    return 1;

}



var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId);

if (tenant is null)

{

    Console.Error.WriteLine($"Tenant {tenantId} not found.");

    return 1;

}



Console.WriteLine($"Tenant: {tenant.BusinessName} ({tenantId})");

Console.WriteLine(dryRun ? "Mode: DRY RUN (no DB writes)" : "Mode: POST opening balance");



var existingMovements = await db.StockMovements.CountAsync(m => m.TenantId == tenantId);

if (existingMovements > 0 && !dryRun)

{

    Console.Error.WriteLine(

        $"Stock already has {existingMovements} movement(s). Run ClearStockData first or use --dry-run.");

    return 1;

}



var warehouseService = new WarehouseService(db);

var inventoryCost = new InventoryCostService(db, warehouseService);

var asOf = new DateTime(2024, 12, 31, 0, 0, 0, DateTimeKind.Utc);

const string notes = "Opening balance from YeshInvoice ספירת מלאי 31.12.2024";



var lines = OpeningBalanceLines.FromYeshInvoicePdf;

var productsByLegacy = await db.Products

    .Where(p => p.TenantId == tenantId && p.LegacySku != null)

    .ToDictionaryAsync(p => p.LegacySku!, p => p);



var missing = new List<string>();

var skippedType = new List<string>();

decimal totalValue = 0;

var planned = new List<(Product Product, Guid WarehouseId, decimal Qty, decimal UnitCost)>();



foreach (var line in lines)

{

    if (!productsByLegacy.TryGetValue(line.LegacySku, out var product))

    {

        missing.Add(line.LegacySku);

        continue;

    }



    if (!ProductTypePrefixes.TracksStock(product.ProductType))

    {

        skippedType.Add($"{line.LegacySku} ({product.ArticleCode}, {product.ProductType})");

        continue;

    }



    var warehouse = await warehouseService.GetForProductAsync(tenantId, product, CancellationToken.None);

    var unitCost = InventoryCostService.RoundIls(line.UnitCostIls);

    var qty = StockQuantity.Normalize(line.Quantity);

    totalValue += InventoryCostService.RoundIls(unitCost * qty);

    planned.Add((product, warehouse.Id, qty, unitCost));

}



Console.WriteLine($"Lines in PDF: {lines.Count}");

Console.WriteLine($"Matched products: {planned.Count}");

Console.WriteLine($"Total value ILS: {InventoryCostService.RoundIls(totalValue):F2}");



if (missing.Count > 0)

{

    Console.WriteLine();

    Console.WriteLine("Missing LegacySku in catalog:");

    foreach (var sku in missing)

        Console.WriteLine($"  {sku}");

}



if (skippedType.Count > 0)

{

    Console.WriteLine();

    Console.WriteLine("Skipped (product type cannot track stock):");

    foreach (var s in skippedType)

        Console.WriteLine($"  {s}");

}



if (planned.Count == 0)

    return 1;



Console.WriteLine();

foreach (var (product, whId, qty, cost) in planned)

{

    var whName = await db.Warehouses.Where(w => w.Id == whId).Select(w => w.Name).FirstAsync();

    Console.WriteLine(

        $"  {product.LegacySku,-10} {product.ArticleCode,-8} qty={qty,6} cost={cost,8:F2}  {whName}");

}



if (missing.Count > 0)

{

    Console.Error.WriteLine();

    Console.Error.WriteLine("Cannot post: some SKUs are missing from the catalog.");

    return 1;

}



if (dryRun)

{

    Console.WriteLine();

    Console.WriteLine("Dry run complete. Re-run without --dry-run to post.");

    return 0;

}



await using var tx = await db.Database.BeginTransactionAsync();

try

{

    var posted = 0;

    foreach (var (product, warehouseId, qty, unitCost) in planned)

    {

        if (!product.TrackInventory)

            product.TrackInventory = true;



        await inventoryCost.ReceiveAsync(

            tenantId,

            product.Id,

            warehouseId,

            qty,

            unitCost,

            asOf,

            InventoryLotSource.OpeningBalance,

            null,

            notes,

            CancellationToken.None);

        posted++;

    }



    await db.SaveChangesAsync();

    await tx.CommitAsync();

    Console.WriteLine();

    Console.WriteLine($"Posted {posted} opening-balance lines. Total value ILS: {InventoryCostService.RoundIls(totalValue):F2}");

}

catch (Exception ex)

{

    await tx.RollbackAsync();

    Console.Error.WriteLine($"Failed: {ex.Message}");

    return 1;

}



return 0;



file static class OpeningBalanceLines

{

    /// <summary>From ספירת מלאי 2025.pdf — only rows with stock &gt; 0 (30 items).</summary>

    public static IReadOnlyList<(string LegacySku, decimal UnitCostIls, decimal Quantity)> FromYeshInvoicePdf { get; } =

    [

        ("72950737", 10m, 46m),

        ("72904632", 12.40m, 46m),

        ("87604562", 0.80m, 30m),

        ("60073541", 6m, 46m),

        ("63854000", 6.70m, 46m),

        ("70557129", 0.10m, 925m),

        ("51044735", 1.65m, 200m),

        ("11731663", 0.02m, 5000m),

        ("1898291", 13.20m, 46m),

        ("2358725", 5m, 46m),

        ("21472832", 55m, 3m),

        ("18080071", 31m, 4m),

        ("81671138", 25m, 4m),

        ("62867197", 168.05m, 4m),

        ("92153535", 170.07m, 5m),

        ("65533020", 6m, 164m),

        ("21863503", 27m, 100m),

        ("82534870", 32m, 60m),

        ("87204720", 130m, 6m),

        ("60584743", 7.20m, 50m),

        ("10389794", 77.38m, 9m),

        ("36833335", 34m, 50m),

        ("6812265", 6m, 46m),

        ("10188742", 10m, 100m),

        ("64455510", 10m, 100m),

        ("69501570", 10m, 12m),

        ("85590259", 6m, 46m),

        ("8238747", 10m, 118m),

        ("75957942", 10m, 118m),

        ("89351001", 131.45m, 6m),

    ];

}

