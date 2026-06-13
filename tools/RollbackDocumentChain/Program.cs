using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Services;

/// <summary>
/// Delete a sales document chain (quote → charge → receipt) and reverse charge stock issues.
/// usage: RollbackDocumentChain [--dry-run] &lt;tenantId&gt; &lt;quoteNumber&gt;
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
var argsList = args.Where(a => !a.StartsWith('-')).ToList();

if (argsList.Count != 2)
{
    Console.WriteLine("usage: RollbackDocumentChain [--dry-run] <tenantId> <quoteNumber>");
    return 1;
}

if (!Guid.TryParse(argsList[0], out var tenantId))
{
    Console.Error.WriteLine("Invalid tenantId GUID.");
    return 1;
}

var quoteNumber = argsList[1].Trim();

var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options;
await using var db = new AppDbContext(options);

var quote = await db.BusinessDocuments
    .AsNoTracking()
    .FirstOrDefaultAsync(d =>
        d.TenantId == tenantId &&
        d.DocumentType == DocumentType.Quote &&
        d.DocumentNumber == quoteNumber);

if (quote is null)
{
    Console.Error.WriteLine($"Quote {quoteNumber} not found.");
    return 1;
}

var chain = await db.BusinessDocuments
    .AsNoTracking()
    .Where(d =>
        d.TenantId == tenantId &&
        (d.Id == quote.Id || d.ParentDocumentId == quote.Id ||
         db.BusinessDocuments.Any(c => c.Id == d.ParentDocumentId && c.ParentDocumentId == quote.Id)))
    .OrderBy(d => d.DocumentType)
    .Select(d => new { d.DocumentNumber, d.DocumentType, d.Status })
    .ToListAsync();

Console.WriteLine(dryRun ? "Mode: DRY RUN" : "Mode: DELETE chain + reverse stock");
Console.WriteLine($"Quote {quoteNumber} ({quote.Id})");
foreach (var doc in chain)
    Console.WriteLine($"  {doc.DocumentType,-14} {doc.DocumentNumber,-8} status={doc.Status}");

var charge = await db.BusinessDocuments.AsNoTracking()
    .FirstOrDefaultAsync(d =>
        d.TenantId == tenantId &&
        d.ParentDocumentId == quote.Id &&
        d.DocumentType == DocumentType.ChargeInvoice);

if (charge is not null)
{
    var issues = await db.StockMovements
        .AsNoTracking()
        .Where(m => m.TenantId == tenantId && m.Notes == charge.DocumentNumber)
        .Join(db.Products, m => m.ProductId, p => p.Id, (m, p) => new { p.ArticleCode, m.Quantity, m.TotalCost })
        .ToListAsync();

    Console.WriteLine($"Stock issues for charge {charge.DocumentNumber}:");
    foreach (var row in issues)
        Console.WriteLine($"  {row.ArticleCode} qty={row.Quantity} cost={row.TotalCost}");
}

if (dryRun)
{
    Console.WriteLine("Dry run complete.");
    return 0;
}

var warehouse = new WarehouseService(db);
var inventoryCost = new InventoryCostService(db, warehouse);
var stock = new StockFulfillmentService(db, warehouse, inventoryCost);
var documentNumbers = new DocumentNumberService(db);
var documents = new DocumentService(db, documentNumbers, stock);

await documents.DeleteAsync(tenantId, quote.Id, CancellationToken.None);

Console.WriteLine("Chain deleted.");

var fgBalance = await db.StockBalances
    .AsNoTracking()
    .Join(db.Products, b => b.ProductId, p => p.Id, (b, p) => new { p.ArticleCode, b.Quantity })
    .FirstOrDefaultAsync(x => x.ArticleCode == "FG-00041");

var fgLot = await db.InventoryLots
    .AsNoTracking()
    .Where(l => l.TenantId == tenantId && l.QuantityRemaining > 0)
    .Join(db.Products, l => l.ProductId, p => p.Id, (l, p) => new { p.ArticleCode, l.QuantityRemaining })
    .FirstOrDefaultAsync(x => x.ArticleCode == "FG-00041");

Console.WriteLine($"FG-00041 balance: {fgBalance?.Quantity.ToString() ?? "—"}");
Console.WriteLine($"FG-00041 lot remaining: {fgLot?.QuantityRemaining.ToString() ?? "—"}");

return 0;
