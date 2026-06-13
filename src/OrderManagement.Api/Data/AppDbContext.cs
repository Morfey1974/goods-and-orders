using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<ArticleSequence> ArticleSequences => Set<ArticleSequence>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerContact> CustomerContacts => Set<CustomerContact>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<SupplierContact> SupplierContacts => Set<SupplierContact>();
    public DbSet<PurchaseReceipt> PurchaseReceipts => Set<PurchaseReceipt>();
    public DbSet<PurchaseReceiptLine> PurchaseReceiptLines => Set<PurchaseReceiptLine>();
    public DbSet<PurchaseReceiptLandedCostLine> PurchaseReceiptLandedCostLines => Set<PurchaseReceiptLandedCostLine>();
    public DbSet<PurchaseReceiptDocument> PurchaseReceiptDocuments => Set<PurchaseReceiptDocument>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductGroup> ProductGroups => Set<ProductGroup>();
    public DbSet<ProductGroupMember> ProductGroupMembers => Set<ProductGroupMember>();
    public DbSet<BomLine> BomLines => Set<BomLine>();
    public DbSet<AssemblyRecipeLine> AssemblyRecipeLines => Set<AssemblyRecipeLine>();
    public DbSet<StockAssembly> StockAssemblies => Set<StockAssembly>();
    public DbSet<StockAssemblyLine> StockAssemblyLines => Set<StockAssemblyLine>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<StockBalance> StockBalances => Set<StockBalance>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<InventoryLot> InventoryLots => Set<InventoryLot>();
    public DbSet<InventoryLotAllocation> InventoryLotAllocations => Set<InventoryLotAllocation>();
    public DbSet<InventoryAverageCost> InventoryAverageCosts => Set<InventoryAverageCost>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<BusinessDocument> BusinessDocuments => Set<BusinessDocument>();
    public DbSet<BusinessDocumentLine> BusinessDocumentLines => Set<BusinessDocumentLine>();
    public DbSet<ReceiptPaymentLine> ReceiptPaymentLines => Set<ReceiptPaymentLine>();
    public DbSet<ReceiptChargeAllocation> ReceiptChargeAllocations => Set<ReceiptChargeAllocation>();
    public DbSet<TenantComplianceDocument> TenantComplianceDocuments => Set<TenantComplianceDocument>();
    public DbSet<BusinessExpense> BusinessExpenses => Set<BusinessExpense>();
    public DbSet<BusinessExpenseDocument> BusinessExpenseDocuments => Set<BusinessExpenseDocument>();
    public DbSet<FixedAssetDocument> FixedAssetDocuments => Set<FixedAssetDocument>();
    public DbSet<FixedAsset> FixedAssets => Set<FixedAsset>();
    public DbSet<FixedAssetInstance> FixedAssetInstances => Set<FixedAssetInstance>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tenant>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.BusinessName).HasMaxLength(256);
            e.Property(x => x.BusinessNickname).HasMaxLength(64);
            e.Property(x => x.BusinessCategory).HasMaxLength(128);
            e.Property(x => x.OwnerFullName).HasMaxLength(256);
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Phone).HasMaxLength(64);
            e.Property(x => x.MobilePhone).HasMaxLength(64);
            e.Property(x => x.Fax).HasMaxLength(64);
            e.Property(x => x.City).HasMaxLength(128);
            e.Property(x => x.ZipCode).HasMaxLength(16);
            e.Property(x => x.Website).HasMaxLength(256);
            e.Property(x => x.BusinessField).HasMaxLength(128);
            e.Property(x => x.BankCode).HasMaxLength(8);
            e.Property(x => x.BankName).HasMaxLength(128);
            e.Property(x => x.BankBranch).HasMaxLength(32);
            e.Property(x => x.BankAccountNumber).HasMaxLength(32);
            e.Property(x => x.BankSwift).HasMaxLength(32);
            e.Property(x => x.BankAba).HasMaxLength(32);
            e.Property(x => x.BankIban).HasMaxLength(64);
            e.Property(x => x.DefaultLanguage).HasMaxLength(8);
            e.Property(x => x.LogoPath).HasMaxLength(512);
            e.Property(x => x.SignaturePath).HasMaxLength(512);
            e.Property(x => x.BackupHostPath).HasMaxLength(512);
            e.Property(x => x.LastBackupFileName).HasMaxLength(256);
            e.Property(x => x.LastBackupError).HasMaxLength(2000);
            e.HasIndex(x => x.Email).IsUnique();
        });

        modelBuilder.Entity<TenantComplianceDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FilePath).HasMaxLength(512);
            e.Property(x => x.OriginalFileName).HasMaxLength(256);
            e.Property(x => x.ContentType).HasMaxLength(128);
            e.HasIndex(x => new { x.TenantId, x.Kind }).IsUnique();
            e.HasOne(x => x.Tenant)
                .WithMany()
                .HasForeignKey(x => x.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Email).HasMaxLength(256);
            e.HasIndex(x => x.Email).IsUnique();
            e.HasOne(x => x.Tenant)
                .WithOne(t => t.User)
                .HasForeignKey<User>(x => x.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.TokenHash).HasMaxLength(128).IsRequired();
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ArticleSequence>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Prefix).HasMaxLength(8);
            e.HasIndex(x => new { x.TenantId, x.Prefix }).IsUnique();
        });

        modelBuilder.Entity<Customer>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(256);
            e.Property(x => x.DocumentName).HasMaxLength(256);
            e.Property(x => x.Nickname).HasMaxLength(64);
            e.Property(x => x.ContactPerson).HasMaxLength(256);
            e.Property(x => x.OsekNumber).HasMaxLength(32);
            e.Property(x => x.TeudatZehut).HasMaxLength(16);
            e.Property(x => x.BusinessCategory).HasMaxLength(256);
            e.Property(x => x.PaymentTerms).HasMaxLength(128);
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Phone).HasMaxLength(64);
            e.Property(x => x.MobilePhone).HasMaxLength(64);
            e.Property(x => x.Fax).HasMaxLength(64);
            e.Property(x => x.Address).HasMaxLength(512);
            e.Property(x => x.City).HasMaxLength(128);
            e.Property(x => x.ZipCode).HasMaxLength(16);
            e.Property(x => x.Website).HasMaxLength(256);
            e.Property(x => x.BankCode).HasMaxLength(8);
            e.Property(x => x.BankName).HasMaxLength(128);
            e.Property(x => x.BankBranch).HasMaxLength(32);
            e.Property(x => x.BankAccountNumber).HasMaxLength(32);
            e.Property(x => x.BankSwift).HasMaxLength(32);
            e.Property(x => x.BankAba).HasMaxLength(32);
            e.Property(x => x.BankIban).HasMaxLength(64);
            e.Property(x => x.BankBeneficiary).HasMaxLength(256);
            e.Property(x => x.LogoPath).HasMaxLength(512);
            e.Property(x => x.DefaultDiscountPercent).HasPrecision(5, 2);
            e.HasIndex(x => new { x.TenantId, x.Name });
        });

        modelBuilder.Entity<CustomerContact>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FullName).HasMaxLength(256);
            e.Property(x => x.Phone).HasMaxLength(64);
            e.Property(x => x.Email).HasMaxLength(256);
            e.HasIndex(x => x.CustomerId);
            e.HasOne(x => x.Customer)
                .WithMany(c => c.Contacts)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Supplier>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(256);
            e.Property(x => x.LegalName).HasMaxLength(256);
            e.Property(x => x.CountryCode).HasMaxLength(2);
            e.Property(x => x.TaxId).HasMaxLength(64);
            e.Property(x => x.ContactPerson).HasMaxLength(256);
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Phone).HasMaxLength(64);
            e.Property(x => x.MobilePhone).HasMaxLength(64);
            e.Property(x => x.Fax).HasMaxLength(64);
            e.Property(x => x.Website).HasMaxLength(256);
            e.Property(x => x.Address).HasMaxLength(512);
            e.Property(x => x.City).HasMaxLength(128);
            e.Property(x => x.StateRegion).HasMaxLength(128);
            e.Property(x => x.ZipCode).HasMaxLength(16);
            e.Property(x => x.BankBeneficiary).HasMaxLength(256);
            e.Property(x => x.BankName).HasMaxLength(128);
            e.Property(x => x.BankBranch).HasMaxLength(32);
            e.Property(x => x.BankAccountNumber).HasMaxLength(32);
            e.Property(x => x.BankSwift).HasMaxLength(32);
            e.Property(x => x.BankIban).HasMaxLength(64);
            e.Property(x => x.DefaultCurrency).HasMaxLength(3);
            e.Property(x => x.Notes).HasMaxLength(2048);
            e.HasIndex(x => new { x.TenantId, x.Name });
        });

        modelBuilder.Entity<SupplierContact>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FullName).HasMaxLength(256);
            e.Property(x => x.Phone).HasMaxLength(64);
            e.Property(x => x.Email).HasMaxLength(256);
            e.HasIndex(x => x.SupplierId);
            e.HasOne(x => x.Supplier)
                .WithMany(s => s.Contacts)
                .HasForeignKey(x => x.SupplierId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PurchaseReceipt>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.ReceiptNumber).HasMaxLength(32);
            e.Property(x => x.SupplierInvoiceNumber).HasMaxLength(64);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.Property(x => x.TotalAmount).HasPrecision(18, 2);
            e.Property(x => x.UsdIlsRate).HasPrecision(18, 6);
            e.Property(x => x.Notes).HasMaxLength(2048);
            e.Property(x => x.DocumentPath).HasMaxLength(512);
            e.Property(x => x.DocumentFileName).HasMaxLength(256);
            e.Property(x => x.DocumentContentType).HasMaxLength(128);
            e.HasIndex(x => new { x.TenantId, x.ReceiptNumber }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.DocumentDate });
            e.HasIndex(x => new { x.TenantId, x.SupplierId });
            e.HasOne(x => x.Supplier)
                .WithMany()
                .HasForeignKey(x => x.SupplierId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PurchaseReceiptDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FilePath).HasMaxLength(512);
            e.Property(x => x.FileName).HasMaxLength(256);
            e.Property(x => x.ContentType).HasMaxLength(128);
            e.HasIndex(x => x.PurchaseReceiptId);
            e.HasOne(x => x.PurchaseReceipt)
                .WithMany(r => r.Documents)
                .HasForeignKey(x => x.PurchaseReceiptId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PurchaseReceiptLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.Property(x => x.UnitPrice).HasPrecision(18, 6);
            e.Property(x => x.UnitCostIls).HasPrecision(18, 2);
            e.Property(x => x.SupplierSku).HasMaxLength(64);
            e.Property(x => x.Notes).HasMaxLength(512);
            e.HasOne(x => x.PurchaseReceipt)
                .WithMany(r => r.Lines)
                .HasForeignKey(x => x.PurchaseReceiptId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PurchaseReceiptLandedCostLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.AmountIls).HasPrecision(18, 2);
            e.Property(x => x.Notes).HasMaxLength(512);
            e.HasIndex(x => new { x.PurchaseReceiptId, x.SupplierId });
            e.HasIndex(x => x.SupplierId);
            e.HasOne(x => x.PurchaseReceipt)
                .WithMany(r => r.LandedCostLines)
                .HasForeignKey(x => x.PurchaseReceiptId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Supplier)
                .WithMany()
                .HasForeignKey(x => x.SupplierId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Product>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.ArticleCode).HasMaxLength(32);
            e.Property(x => x.LegacySku).HasMaxLength(64);
            e.HasIndex(x => new { x.TenantId, x.LegacySku }).IsUnique().HasFilter("\"LegacySku\" IS NOT NULL");
            e.Property(x => x.Name).HasMaxLength(256);
            e.Property(x => x.ImagePath).HasMaxLength(512);
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.HasIndex(x => new { x.TenantId, x.ArticleCode }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.ProductType });
            e.HasIndex(x => x.WarehouseId);
            e.HasOne(x => x.Warehouse)
                .WithMany()
                .HasForeignKey(x => x.WarehouseId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ProductGroup>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(128);
            e.HasIndex(x => new { x.TenantId, x.Name }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.SortOrder });
        });

        modelBuilder.Entity<ProductGroupMember>(e =>
        {
            e.HasKey(x => new { x.ProductGroupId, x.ProductId });
            e.HasOne(x => x.Group)
                .WithMany(g => g.Members)
                .HasForeignKey(x => x.ProductGroupId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.ProductId);
        });

        modelBuilder.Entity<BomLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.HasOne(x => x.ParentProduct)
                .WithMany(p => p.BomLines)
                .HasForeignKey(x => x.ParentProductId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.ComponentProduct)
                .WithMany()
                .HasForeignKey(x => x.ComponentProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssemblyRecipeLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.HasOne(x => x.ParentProduct)
                .WithMany(p => p.AssemblyRecipeLines)
                .HasForeignKey(x => x.ParentProductId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.ComponentProduct)
                .WithMany()
                .HasForeignKey(x => x.ComponentProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StockAssembly>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.AssemblyNumber).HasMaxLength(32);
            e.Property(x => x.OutputQuantity).HasPrecision(18, 4);
            e.Property(x => x.AdditionalCostIls).HasPrecision(18, 2);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.HasIndex(x => new { x.TenantId, x.AssemblyNumber }).IsUnique();
            e.HasOne(x => x.OutputProduct)
                .WithMany()
                .HasForeignKey(x => x.OutputProductId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.OutputWarehouse)
                .WithMany()
                .HasForeignKey(x => x.OutputWarehouseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StockAssemblyLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.HasOne(x => x.StockAssembly)
                .WithMany(a => a.Lines)
                .HasForeignKey(x => x.StockAssemblyId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Warehouse>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(128);
            e.Property(x => x.Description).HasMaxLength(512);
            e.HasIndex(x => new { x.TenantId, x.Name });
        });

        modelBuilder.Entity<Order>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.OrderNumber).HasMaxLength(32);
            e.Property(x => x.ChargeInvoiceNumber).HasMaxLength(32);
            e.HasIndex(x => new { x.TenantId, x.OrderNumber }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Status });
            e.HasOne(x => x.Customer)
                .WithMany()
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OrderLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.HasOne(x => x.Order)
                .WithMany(o => o.Lines)
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StockBalance>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.HasIndex(x => new { x.WarehouseId, x.ProductId }).IsUnique();
        });

        modelBuilder.Entity<StockMovement>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.BalanceAfter).HasPrecision(18, 4);
            e.Property(x => x.UnitCost).HasPrecision(18, 2);
            e.Property(x => x.TotalCost).HasPrecision(18, 2);
            e.HasIndex(x => new { x.TenantId, x.CreatedAt });
            e.HasIndex(x => new { x.TenantId, x.MovementDate });
        });

        modelBuilder.Entity<InventoryLot>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.QuantityRemaining).HasPrecision(18, 4);
            e.Property(x => x.UnitCostIls).HasPrecision(18, 2);
            e.HasIndex(x => new { x.TenantId, x.ProductId, x.WarehouseId, x.ReceivedAt });
            e.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse)
                .WithMany()
                .HasForeignKey(x => x.WarehouseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<InventoryLotAllocation>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitCostIls).HasPrecision(18, 2);
            e.Property(x => x.TotalCostIls).HasPrecision(18, 2);
            e.HasIndex(x => x.StockMovementId);
            e.HasOne(x => x.Lot)
                .WithMany()
                .HasForeignKey(x => x.InventoryLotId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.StockMovement)
                .WithMany()
                .HasForeignKey(x => x.StockMovementId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InventoryAverageCost>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.UnitCostIls).HasPrecision(18, 2);
            e.HasIndex(x => new { x.TenantId, x.ProductId, x.WarehouseId }).IsUnique();
            e.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Warehouse)
                .WithMany()
                .HasForeignKey(x => x.WarehouseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BusinessDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.DocumentNumber).HasMaxLength(32);
            e.Property(x => x.Description).HasMaxLength(512);
            e.Property(x => x.PaymentMethod).HasMaxLength(64);
            e.Property(x => x.TotalAmount).HasPrecision(18, 2);
            e.HasIndex(x => new { x.TenantId, x.DocumentType, x.DocumentNumber }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.IssueDate });
            e.HasIndex(x => new { x.TenantId, x.DocumentType, x.Status });
            e.HasOne(x => x.Customer)
                .WithMany()
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Order)
                .WithMany()
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.ParentDocument)
                .WithMany()
                .HasForeignKey(x => x.ParentDocumentId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<BusinessDocumentLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Description).HasMaxLength(512);
            e.Property(x => x.Quantity).HasPrecision(18, 4);
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.Property(x => x.LineTotal).HasPrecision(18, 2);
            e.HasOne(x => x.Document)
                .WithMany(d => d.Lines)
                .HasForeignKey(x => x.DocumentId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ReceiptPaymentLine>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Currency).HasMaxLength(8);
            e.Property(x => x.GeneralDetail).HasMaxLength(256);
            e.Property(x => x.DetailsJson).HasMaxLength(2048);
            e.HasIndex(x => x.DocumentId);
            e.HasOne(x => x.Document)
                .WithMany(d => d.PaymentLines)
                .HasForeignKey(x => x.DocumentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ReceiptChargeAllocation>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.AllocatedAmount).HasPrecision(18, 2);
            e.HasIndex(x => x.ReceiptId);
            e.HasIndex(x => x.ChargeInvoiceId);
            e.HasOne(x => x.Receipt)
                .WithMany()
                .HasForeignKey(x => x.ReceiptId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.ChargeInvoice)
                .WithMany()
                .HasForeignKey(x => x.ChargeInvoiceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BusinessExpense>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Description).HasMaxLength(512);
            e.Property(x => x.AmountIls).HasPrecision(18, 2);
            e.Property(x => x.VendorName).HasMaxLength(256);
            e.Property(x => x.InvoiceReference).HasMaxLength(128);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.HasIndex(x => new { x.TenantId, x.ExpenseDate });
        });

        modelBuilder.Entity<BusinessExpenseDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FilePath).HasMaxLength(512);
            e.Property(x => x.FileName).HasMaxLength(256);
            e.Property(x => x.ContentType).HasMaxLength(128);
            e.HasIndex(x => x.BusinessExpenseId);
            e.HasOne(x => x.BusinessExpense)
                .WithMany(x => x.Documents)
                .HasForeignKey(x => x.BusinessExpenseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<FixedAsset>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(256);
            e.Property(x => x.Description).HasMaxLength(512);
            e.Property(x => x.CostIls).HasPrecision(18, 2);
            e.Property(x => x.AnnualDepreciationPercent).HasPrecision(8, 4);
            e.Property(x => x.VendorName).HasMaxLength(256);
            e.Property(x => x.InvoiceReference).HasMaxLength(128);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.HasIndex(x => new { x.TenantId, x.PurchaseDate });
        });

        modelBuilder.Entity<FixedAssetDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FilePath).HasMaxLength(512);
            e.Property(x => x.FileName).HasMaxLength(256);
            e.Property(x => x.ContentType).HasMaxLength(128);
            e.HasIndex(x => x.FixedAssetId);
            e.HasOne(x => x.FixedAsset)
                .WithMany(x => x.Documents)
                .HasForeignKey(x => x.FixedAssetId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<FixedAssetInstance>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(256);
            e.Property(x => x.Description).HasMaxLength(512);
            e.Property(x => x.OriginalCostIls).HasPrecision(18, 2);
            e.Property(x => x.ChangesCostIls).HasPrecision(18, 2);
            e.Property(x => x.AnnualDepreciationPercent).HasPrecision(10, 4);
            e.Property(x => x.BusinessUsePercent).HasPrecision(8, 2);
            e.Property(x => x.VendorName).HasMaxLength(256);
            e.Property(x => x.InvoiceReference).HasMaxLength(128);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.HasIndex(x => new { x.TenantId, x.AcquisitionDate });
            e.HasIndex(x => x.PurchaseReceiptLineId).IsUnique();
            e.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.PurchaseReceipt)
                .WithMany()
                .HasForeignKey(x => x.PurchaseReceiptId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.PurchaseReceiptLine)
                .WithMany()
                .HasForeignKey(x => x.PurchaseReceiptLineId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Product>(e =>
        {
            e.Property(x => x.DefaultBusinessUsePercent).HasPrecision(8, 2);
        });

        modelBuilder.Entity<BusinessExpense>(e =>
        {
            e.HasIndex(x => x.PurchaseReceiptLineId).IsUnique();
        });
    }
}
