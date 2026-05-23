using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<ArticleSequence> ArticleSequences => Set<ArticleSequence>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<BomLine> BomLines => Set<BomLine>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<StockBalance> StockBalances => Set<StockBalance>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<BusinessDocument> BusinessDocuments => Set<BusinessDocument>();
    public DbSet<BusinessDocumentLine> BusinessDocumentLines => Set<BusinessDocumentLine>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tenant>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.BusinessName).HasMaxLength(256);
            e.Property(x => x.OwnerFullName).HasMaxLength(256);
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.DefaultLanguage).HasMaxLength(8);
            e.HasIndex(x => x.Email).IsUnique();
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
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Phone).HasMaxLength(64);
            e.HasIndex(x => new { x.TenantId, x.Name });
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
            e.HasIndex(x => new { x.TenantId, x.CreatedAt });
        });

        modelBuilder.Entity<BusinessDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.DocumentNumber).HasMaxLength(32);
            e.Property(x => x.Description).HasMaxLength(512);
            e.Property(x => x.PaymentMethod).HasMaxLength(64);
            e.Property(x => x.TotalAmount).HasPrecision(18, 2);
            e.HasIndex(x => new { x.TenantId, x.DocumentNumber }).IsUnique();
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
    }
}
