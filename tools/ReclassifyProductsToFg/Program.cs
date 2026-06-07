using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using OrderManagement.Api.Data;
using OrderManagement.Api.Services;

// Default batch — CP finished goods misclassified as components.
var defaultArticles = new[]
{
    "CP-00037",
    "CP-00029",
    "CP-00038",
    "CP-00106",
    "CP-00062",
    "CP-00041",
    "CP-00047",
};

var dryRun = args.Contains("--dry-run", StringComparer.OrdinalIgnoreCase);
var positional = args.Where(a => !a.StartsWith("--", StringComparison.Ordinal)).ToArray();

if (positional.Length == 0)
{
    Console.Error.WriteLine("usage: ReclassifyProductsToFg <tenantId> [CP-00001 ...] [--dry-run]");
    Console.Error.WriteLine("  Without article list uses built-in batch of 7 CP→FG renames.");
    return 1;
}

if (!Guid.TryParse(positional[0], out var tenantId))
{
    Console.Error.WriteLine("Invalid tenantId.");
    return 1;
}

var articles = positional.Length > 1 ? positional[1..] : defaultArticles;

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

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseNpgsql(connectionString)
    .Options;

await using var db = new AppDbContext(options);

var tenantExists = await db.Tenants.AnyAsync(t => t.Id == tenantId);
if (!tenantExists)
{
    Console.Error.WriteLine($"Tenant {tenantId} not found.");
    return 1;
}

Console.WriteLine((dryRun ? "[DRY RUN] " : "") + $"Reclassify CP → FG for tenant {tenantId}");
Console.WriteLine($"Articles: {string.Join(", ", articles)}");
Console.WriteLine("No new stock movements will be created.");
Console.WriteLine();

var result = await ProductReclassifyToFgService.ReclassifyAsync(db, tenantId, articles, dryRun);

foreach (var line in result.Lines)
{
    if (line.Success)
    {
        Console.WriteLine(
            $"OK  {line.OldArticleCode} → {line.NewArticleCode}  qty moved to FG: {line.QuantityMoved}  ({line.ProductName})");
    }
    else
    {
        Console.WriteLine($"ERR {line.OldArticleCode} → {line.NewArticleCode}: {line.Error}");
    }
}

Console.WriteLine();
Console.WriteLine($"FG ArticleSequences next number (min): {result.ArticleSequenceFgNextNumber}");
Console.WriteLine(dryRun ? "Dry run — no changes saved." : "Done.");

return result.Lines.All(l => l.Success) ? 0 : 1;
