using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

/// <summary>
/// Restore deleted quote 372 (MAPI_PHARMA / FG-00041) with original number and content.
/// usage: RestoreQuote372 [--dry-run] &lt;tenantId&gt;
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
if (argsList.Count != 1 || !Guid.TryParse(argsList[0], out var tenantId))
{
    Console.WriteLine("usage: RestoreQuote372 [--dry-run] <tenantId>");
    return 1;
}

const string quoteNumber = "372";
const string description = "לפרויקט MAPI_PHARMA";
const string productArticle = "FG-00041";
const decimal quantity = 50m;
const decimal unitPrice = 150m;
var issueDate = new DateTime(2024, 11, 18, 12, 0, 0, DateTimeKind.Utc);

var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options;
await using var db = new AppDbContext(options);

var exists = await db.BusinessDocuments.AnyAsync(d =>
    d.TenantId == tenantId && d.DocumentType == DocumentType.Quote && d.DocumentNumber == quoteNumber);
if (exists)
{
    Console.Error.WriteLine($"Quote {quoteNumber} already exists.");
    return 1;
}

var customer = await db.Customers.AsNoTracking()
    .FirstOrDefaultAsync(c => c.TenantId == tenantId && c.DocumentName != null &&
                              c.DocumentName.Contains("הנדסת חדרים"));
if (customer is null)
{
    Console.Error.WriteLine("Customer not found.");
    return 1;
}

var product = await db.Products.AsNoTracking()
    .FirstOrDefaultAsync(p => p.TenantId == tenantId && p.ArticleCode == productArticle);
if (product is null)
{
    Console.Error.WriteLine($"Product {productArticle} not found.");
    return 1;
}

var lineTotal = Math.Round(quantity * unitPrice, 2);
Console.WriteLine(dryRun ? "Mode: DRY RUN" : "Mode: RESTORE");
Console.WriteLine($"Quote {quoteNumber}  customer={customer.DocumentName}");
Console.WriteLine($"  {productArticle} x {quantity} @ {unitPrice} = {lineTotal} ILS");
Console.WriteLine($"  issueDate={issueDate:yyyy-MM-dd}  status=Open  description={description}");

if (dryRun)
    return 0;

var now = DateTime.UtcNow;
var quoteId = Guid.NewGuid();
var quote = new BusinessDocument
{
    Id = quoteId,
    TenantId = tenantId,
    DocumentType = DocumentType.Quote,
    DocumentNumber = quoteNumber,
    CustomerId = customer.Id,
    Status = DocumentStatus.Open,
    Description = description,
    IssueDate = issueDate,
    TotalAmount = lineTotal,
    Version = 1,
    CreatedAt = now,
    UpdatedAt = now,
};

quote.Lines.Add(new BusinessDocumentLine
{
    Id = Guid.NewGuid(),
    DocumentId = quoteId,
    ProductId = product.Id,
    Description = product.Name,
    Quantity = quantity,
    UnitPrice = unitPrice,
    LineTotal = lineTotal,
    SortOrder = 0,
});

db.BusinessDocuments.Add(quote);
await db.SaveChangesAsync(CancellationToken.None);

Console.WriteLine($"Restored quote {quoteNumber} ({quoteId})");
return 0;
