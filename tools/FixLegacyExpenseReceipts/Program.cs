using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;
using OrderManagement.Api.Services;

/// <summary>
/// Migrate legacy service purchase receipts to the expense journal and re-post mixed receipts.
/// usage: FixLegacyExpenseReceipts [--dry-run] &lt;tenantId&gt;
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
var tenantArg = args.FirstOrDefault(a => !a.StartsWith("-", StringComparison.Ordinal));
if (tenantArg is null || !Guid.TryParse(tenantArg, out var tenantId))
{
    Console.WriteLine("usage: FixLegacyExpenseReceipts [--dry-run] <tenantId>");
    return 1;
}

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

Console.WriteLine($"Tenant: {tenant.BusinessName}");
Console.WriteLine(dryRun ? "Mode: DRY RUN" : "Mode: APPLY");
Console.WriteLine();

var receiptService = PurchaseReceiptToolFactory.Create(db, config);

// ESET subscriptions → journal SoftwareSubscription, delete GR.
await MigrateReceiptsToJournalAsync(
    db, receiptService, tenantId, ["GR-00059", "GR-00060"],
    OperatingExpenseType.SoftwareSubscription, dryRun);

// FedEx freight-only GR → journal Logistics, delete GR.
await MigrateReceiptsToJournalAsync(
    db, receiptService, tenantId, ["GR-00023"],
    OperatingExpenseType.Logistics, dryRun);

// Mixed receipt with landed cost on FA/CM/SV — revert and re-post with new allocation rules.
await RepostReceiptAsync(db, receiptService, tenantId, "GR-00062", dryRun);

Console.WriteLine();
Console.WriteLine(dryRun ? "Dry run complete." : "Migration complete.");
return 0;

static async Task MigrateReceiptsToJournalAsync(
    AppDbContext db,
    PurchaseReceiptService receiptService,
    Guid tenantId,
    IReadOnlyList<string> receiptNumbers,
    OperatingExpenseType expenseType,
    bool dryRun)
{
    foreach (var number in receiptNumbers)
    {
        var receipt = await db.PurchaseReceipts
            .Include(r => r.Lines)
            .ThenInclude(l => l.Product)
            .Include(r => r.Supplier)
            .FirstOrDefaultAsync(r => r.TenantId == tenantId && r.ReceiptNumber == number);

        if (receipt is null)
        {
            Console.WriteLine($"[skip] {number} not found");
            continue;
        }

        if (receipt.Status != PurchaseReceiptStatus.Posted)
        {
            Console.WriteLine($"[skip] {number} is {receipt.Status}, expected Posted");
            continue;
        }

        var serviceLines = receipt.Lines
            .Where(l => l.Product != null && PurchaseReceiptLineAllocation.IsVendorService(l.Product))
            .ToList();

        var linesToJournal = serviceLines.Count > 0 ? serviceLines : receipt.Lines.ToList();
        Console.WriteLine($"{number} → journal {expenseType} ({linesToJournal.Count} line(s))");

        foreach (var line in linesToJournal)
        {
            var amountIls = PurchaseReceiptFixedAssetPosting.ResolveLineTotalIls(receipt, line);
            var product = line.Product!;
            Console.WriteLine($"  {product.ArticleCode,-10} {product.Name,-30} {amountIls,10:F2} ₪");

            if (!dryRun)
            {
                var now = DateTime.UtcNow;
                db.BusinessExpenses.Add(new BusinessExpense
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ExpenseDate = DateTime.SpecifyKind(receipt.DocumentDate.Date, DateTimeKind.Utc),
                    IsHomeMixed = false,
                    OperatingExpenseType = expenseType,
                    Description = product.Name,
                    AmountIls = DepreciationCalculator.RoundMoney(amountIls),
                    VendorName = receipt.Supplier?.Name,
                    InvoiceReference = receipt.SupplierInvoiceNumber,
                    Notes = $"Migrated from {receipt.ReceiptNumber}",
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }
        }

        if (!dryRun)
        {
            await db.SaveChangesAsync();
            await receiptService.DeletePostedWithReversalAsync(tenantId, receipt.Id, CancellationToken.None);
            Console.WriteLine($"  deleted {number}");
        }
    }
}

static async Task RepostReceiptAsync(
    AppDbContext db,
    PurchaseReceiptService receiptService,
    Guid tenantId,
    string receiptNumber,
    bool dryRun)
{
    var receiptId = await db.PurchaseReceipts
        .AsNoTracking()
        .Where(r => r.TenantId == tenantId && r.ReceiptNumber == receiptNumber)
        .Select(r => r.Id)
        .FirstOrDefaultAsync();

    if (receiptId == Guid.Empty)
    {
        Console.WriteLine($"[skip] {receiptNumber} not found");
        return;
    }

    var receipt = await receiptService.LoadAsync(tenantId, receiptId, CancellationToken.None);
    if (receipt is null)
    {
        Console.WriteLine($"[skip] {receiptNumber} not found");
        return;
    }

    if (receipt.Status != PurchaseReceiptStatus.Posted)
    {
        Console.WriteLine($"[skip] {receiptNumber} is {receipt.Status}, expected Posted");
        return;
    }

    Console.WriteLine($"{receiptNumber} → revert to draft and re-post");

    if (dryRun)
        return;

    var reverted = await receiptService.RevertPostedToDraftAsync(tenantId, receipt.Id, CancellationToken.None);
    await receiptService.PostAsync(tenantId, reverted.Id, reverted.Version, CancellationToken.None);
    Console.WriteLine($"  re-posted {receiptNumber}");
}

internal static class PurchaseReceiptToolFactory
{
    public static PurchaseReceiptService Create(AppDbContext db, IConfiguration config)
    {
        var services = new ServiceCollection();
        services.AddMemoryCache();
        services.AddHttpClient(nameof(ExchangeRateService));
        var sp = services.BuildServiceProvider();

        var env = new ToolWebHostEnvironment { ContentRootPath = config.GetValue<string>("ContentRoot") ?? Directory.GetCurrentDirectory() };
        var files = new TenantFileService(env, config);
        var warehouse = new WarehouseService(db);
        var inventoryCost = new InventoryCostService(db, warehouse);
        var exchangeRates = new ExchangeRateService(
            sp.GetRequiredService<IHttpClientFactory>(),
            sp.GetRequiredService<Microsoft.Extensions.Caching.Memory.IMemoryCache>());
        var sequences = new ArticleSequenceService(db);
        var fixedAssets = new FixedAssetInstanceService(db);

        return new PurchaseReceiptService(
            db, warehouse, inventoryCost, exchangeRates, files, sequences, fixedAssets);
    }
}

internal sealed class ToolWebHostEnvironment : IWebHostEnvironment
{
    public string EnvironmentName { get; set; } = Environments.Development;
    public string ApplicationName { get; set; } = "FixLegacyExpenseReceipts";
    public string WebRootPath { get; set; } = Path.GetTempPath();
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
