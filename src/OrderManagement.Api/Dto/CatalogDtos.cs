using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Dto;

public record CustomerDto(
    Guid Id,
    string Name,
    string? DocumentName,
    string? Nickname,
    string? ContactPerson,
    string? OsekNumber,
    string? TeudatZehut,
    string? BusinessCategory,
    string? ExternalKey,
    string? PaymentTerms,
    string? Email,
    string? Phone,
    string? MobilePhone,
    string? Fax,
    string? Address,
    string? City,
    string? ZipCode,
    string? Website,
    string? BankBeneficiary,
    string? BankCode,
    string? BankName,
    string? BankBranch,
    string? BankAccountNumber,
    string? BankSwift,
    string? BankAba,
    string? BankIban,
    bool HasLogo,
    decimal DefaultDiscountPercent,
    bool IsActive,
    DateTime CreatedAt,
    int Version);

public record CreateCustomerRequest(
    [Required][MinLength(1)] string Name,
    string? DocumentName,
    string? Nickname,
    string? ContactPerson,
    string? OsekNumber,
    string? TeudatZehut,
    string? BusinessCategory,
    string? ExternalKey,
    string? PaymentTerms,
    string? Email,
    string? Phone,
    string? MobilePhone,
    string? Fax,
    string? Address,
    string? City,
    string? ZipCode,
    string? Website,
    string? BankBeneficiary,
    string? BankCode,
    string? BankName,
    string? BankBranch,
    string? BankAccountNumber,
    string? BankSwift,
    string? BankAba,
    string? BankIban,
    [Range(0, 100)] decimal DefaultDiscountPercent);

public record UpdateCustomerRequest(
    [Required][MinLength(1)] string Name,
    string? DocumentName,
    string? Nickname,
    string? ContactPerson,
    string? OsekNumber,
    string? TeudatZehut,
    string? BusinessCategory,
    string? ExternalKey,
    string? PaymentTerms,
    string? Email,
    string? Phone,
    string? MobilePhone,
    string? Fax,
    string? Address,
    string? City,
    string? ZipCode,
    string? Website,
    string? BankBeneficiary,
    string? BankCode,
    string? BankName,
    string? BankBranch,
    string? BankAccountNumber,
    string? BankSwift,
    string? BankAba,
    string? BankIban,
    [Range(0, 100)] decimal DefaultDiscountPercent,
    bool IsActive,
    int Version);

public record BomLineDto(Guid ComponentProductId, string ComponentArticleCode, string ComponentName, decimal Quantity);

public record ProductImportResultDto(
    int ImportedCount,
    int SkippedCount,
    int ErrorCount,
    IReadOnlyList<ProductImportErrorDto> Errors);

public record ProductImportErrorDto(int Line, string Message);

public record ProductDto(
    Guid Id,
    string ArticleCode,
    string? LegacySku,
    string ProductType,
    string Name,
    string? Description,
    bool HasImage,
    decimal UnitPrice,
    bool ShowBomInQuote,
    bool ShowBomInInvoice,
    bool IsActive,
    bool HasStockMovements,
    decimal? StockQuantity,
    IReadOnlyList<BomLineDto> BomLines,
    int Version);

public record CreateProductRequest(
    [Required] string ProductType,
    [Required][MinLength(1)] string Name,
    string? Description,
    [Range(0, double.MaxValue)] decimal UnitPrice,
    bool ShowBomInQuote,
    bool ShowBomInInvoice,
    IReadOnlyList<BomLineInput>? BomLines);

public record UpdateProductRequest(
    string? ProductType,
    [Required][MinLength(1)] string Name,
    string? Description,
    [Range(0, double.MaxValue)] decimal UnitPrice,
    bool ShowBomInQuote,
    bool ShowBomInInvoice,
    bool IsActive,
    IReadOnlyList<BomLineInput>? BomLines,
    int Version);

public record QuickUpdateProductRequest(
    decimal? UnitPrice,
    decimal? StockQuantity,
    int Version);

public record SetProductActiveRequest(bool IsActive, int Version);

public record BomLineInput(
    [Required] Guid ComponentProductId,
    [Range(1, double.MaxValue)] decimal Quantity);

public record NextArticleDto(string ArticleCode);

public record StockBalanceDto(
    Guid ProductId,
    string ArticleCode,
    string ProductName,
    string ProductType,
    decimal Quantity,
    Guid WarehouseId,
    string WarehouseName);

public record WarehouseDto(
    Guid Id,
    string Kind,
    string Name,
    string? Description,
    bool IsActive,
    bool IsSystem,
    DateTime CreatedAt);

public record CreateWarehouseRequest(
    [Required][MinLength(1)] string Name,
    string? Description,
    bool IsActive = true);

public record UpdateWarehouseRequest(
    [Required][MinLength(1)] string Name,
    string? Description,
    bool IsActive);

public record StockMovementDto(
    Guid Id,
    string ArticleCode,
    string ProductName,
    string MovementType,
    decimal Quantity,
    decimal BalanceAfter,
    string? Notes,
    DateTime CreatedAt);

public record StockReceiptRequest(
    [Required] Guid ProductId,
    [Range(0.0001, double.MaxValue)] decimal Quantity,
    string? Notes,
    Guid? WarehouseId);

public record OrderLineDto(
    Guid Id,
    Guid ProductId,
    string ArticleCode,
    string ProductName,
    string ProductType,
    decimal Quantity,
    decimal UnitPrice,
    decimal LineTotal,
    int SortOrder);

public record OrderDto(
    Guid Id,
    string OrderNumber,
    Guid CustomerId,
    string CustomerName,
    string Status,
    string? Notes,
    string? ChargeInvoiceNumber,
    DateTime? ChargeInvoiceIssuedAt,
    bool StockDeducted,
    decimal TotalAmount,
    IReadOnlyList<OrderLineDto> Lines,
    int Version,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateOrderRequest(
    [Required] Guid CustomerId,
    string? Notes,
    [MinLength(1)] IReadOnlyList<OrderLineInput> Lines);

public record UpdateOrderRequest(
    Guid? CustomerId,
    string? Notes,
    string? Status,
    IReadOnlyList<OrderLineInput>? Lines,
    int Version);

public record OrderLineInput(
    [Required] Guid ProductId,
    [Range(0.0001, double.MaxValue)] decimal Quantity,
    [Range(0, double.MaxValue)] decimal? UnitPrice);

public static class CatalogMappers
{
    public static CustomerDto ToDto(Customer c) => new(
        c.Id,
        c.Name,
        c.DocumentName,
        c.Nickname,
        c.ContactPerson,
        c.OsekNumber,
        c.TeudatZehut,
        c.BusinessCategory,
        c.ExternalKey,
        c.PaymentTerms,
        c.Email,
        c.Phone,
        c.MobilePhone,
        c.Fax,
        c.Address,
        c.City,
        c.ZipCode,
        c.Website,
        c.BankBeneficiary,
        c.BankCode,
        c.BankName,
        c.BankBranch,
        c.BankAccountNumber,
        c.BankSwift,
        c.BankAba,
        c.BankIban,
        !string.IsNullOrEmpty(c.LogoPath),
        c.DefaultDiscountPercent,
        c.IsActive,
        c.CreatedAt,
        c.Version);

    public static void ApplyCustomerFields(Customer c, CreateCustomerRequest request)
    {
        c.Name = request.Name.Trim();
        c.DocumentName = request.DocumentName?.Trim();
        c.Nickname = request.Nickname?.Trim();
        c.ContactPerson = request.ContactPerson?.Trim();
        c.OsekNumber = request.OsekNumber?.Trim();
        c.TeudatZehut = request.TeudatZehut?.Trim();
        c.BusinessCategory = request.BusinessCategory?.Trim();
        c.ExternalKey = request.ExternalKey?.Trim();
        c.PaymentTerms = request.PaymentTerms?.Trim();
        c.Email = request.Email?.Trim();
        c.Phone = request.Phone?.Trim();
        c.MobilePhone = request.MobilePhone?.Trim();
        c.Fax = request.Fax?.Trim();
        c.Address = request.Address?.Trim();
        c.City = request.City?.Trim();
        c.ZipCode = request.ZipCode?.Trim();
        c.Website = request.Website?.Trim();
        c.BankBeneficiary = request.BankBeneficiary?.Trim();
        c.BankCode = request.BankCode?.Trim();
        c.BankName = request.BankName?.Trim();
        c.BankBranch = request.BankBranch?.Trim();
        c.BankAccountNumber = request.BankAccountNumber?.Trim();
        c.BankSwift = request.BankSwift?.Trim();
        c.BankAba = request.BankAba?.Trim();
        c.BankIban = request.BankIban?.Trim();
        c.DefaultDiscountPercent = request.DefaultDiscountPercent;
    }

    public static void ApplyCustomerFields(Customer c, UpdateCustomerRequest request)
    {
        c.Name = request.Name.Trim();
        c.DocumentName = request.DocumentName?.Trim();
        c.Nickname = request.Nickname?.Trim();
        c.ContactPerson = request.ContactPerson?.Trim();
        c.OsekNumber = request.OsekNumber?.Trim();
        c.TeudatZehut = request.TeudatZehut?.Trim();
        c.BusinessCategory = request.BusinessCategory?.Trim();
        c.ExternalKey = request.ExternalKey?.Trim();
        c.PaymentTerms = request.PaymentTerms?.Trim();
        c.Email = request.Email?.Trim();
        c.Phone = request.Phone?.Trim();
        c.MobilePhone = request.MobilePhone?.Trim();
        c.Fax = request.Fax?.Trim();
        c.Address = request.Address?.Trim();
        c.City = request.City?.Trim();
        c.ZipCode = request.ZipCode?.Trim();
        c.Website = request.Website?.Trim();
        c.BankBeneficiary = request.BankBeneficiary?.Trim();
        c.BankCode = request.BankCode?.Trim();
        c.BankName = request.BankName?.Trim();
        c.BankBranch = request.BankBranch?.Trim();
        c.BankAccountNumber = request.BankAccountNumber?.Trim();
        c.BankSwift = request.BankSwift?.Trim();
        c.BankAba = request.BankAba?.Trim();
        c.BankIban = request.BankIban?.Trim();
        c.DefaultDiscountPercent = request.DefaultDiscountPercent;
        c.IsActive = request.IsActive;
    }

    public static ProductType ParseProductType(string value) =>
        Enum.TryParse<ProductType>(value, true, out var t) ? t : throw new ArgumentException("Invalid product type.");

    private static Guid WarehouseIdFor(Product p, Guid componentsWarehouseId, Guid finishedWarehouseId) =>
        ProductTypePrefixes.GetWarehouseKind(p.ProductType) == WarehouseKind.FinishedGoods
            ? finishedWarehouseId
            : componentsWarehouseId;

    public static async Task<ProductDto> ToDtoAsync(
        Product p,
        AppDbContext db,
        Guid componentsWarehouseId,
        Guid finishedWarehouseId,
        CancellationToken ct)
    {
        var warehouseId = WarehouseIdFor(p, componentsWarehouseId, finishedWarehouseId);
        var hasMovements = await db.StockMovements.AnyAsync(m => m.ProductId == p.Id, ct);
        decimal? stock = null;
        if (ProductTypePrefixes.TracksStock(p.ProductType))
        {
            stock = await db.StockBalances
                .Where(b => b.WarehouseId == warehouseId && b.ProductId == p.Id)
                .Select(b => (decimal?)b.Quantity)
                .FirstOrDefaultAsync(ct) ?? 0;
        }

        var bom = await db.BomLines
            .Where(b => b.ParentProductId == p.Id)
            .Include(b => b.ComponentProduct)
            .Select(b => new BomLineDto(
                b.ComponentProductId,
                b.ComponentProduct.ArticleCode,
                b.ComponentProduct.Name,
                b.Quantity))
            .ToListAsync(ct);

        return new ProductDto(
            p.Id, p.ArticleCode, p.LegacySku, p.ProductType.ToString(), p.Name, p.Description,
            !string.IsNullOrEmpty(p.ImagePath),
            p.UnitPrice, p.ShowBomInQuote, p.ShowBomInInvoice, p.IsActive,
            hasMovements, stock, bom, p.Version);
    }

    public static async Task<List<ProductDto>> ToDtoListAsync(
        List<Product> products,
        AppDbContext db,
        Guid componentsWarehouseId,
        Guid finishedWarehouseId,
        CancellationToken ct)
    {
        if (products.Count == 0) return [];

        var ids = products.Select(p => p.Id).ToList();
        var stocks = await db.StockBalances
            .Where(b => ids.Contains(b.ProductId) &&
                        (b.WarehouseId == componentsWarehouseId || b.WarehouseId == finishedWarehouseId))
            .ToListAsync(ct);

        var stockByProduct = products.ToDictionary(
            p => p.Id,
            p =>
            {
                var whId = WarehouseIdFor(p, componentsWarehouseId, finishedWarehouseId);
                return stocks.FirstOrDefault(b => b.ProductId == p.Id && b.WarehouseId == whId)?.Quantity ?? 0m;
            });

        var movementIds = await db.StockMovements
            .Where(m => ids.Contains(m.ProductId))
            .Select(m => m.ProductId)
            .Distinct()
            .ToHashSetAsync(ct);

        var bomAll = await db.BomLines
            .Where(b => ids.Contains(b.ParentProductId))
            .Include(b => b.ComponentProduct)
            .ToListAsync(ct);

        var bomByParent = bomAll.GroupBy(b => b.ParentProductId).ToDictionary(g => g.Key, g => g.ToList());

        return products.Select(p =>
        {
            decimal? stock = ProductTypePrefixes.TracksStock(p.ProductType)
                ? stockByProduct.GetValueOrDefault(p.Id, 0)
                : null;

            var bom = bomByParent.TryGetValue(p.Id, out var lines)
                ? lines.Select(b => new BomLineDto(
                    b.ComponentProductId,
                    b.ComponentProduct.ArticleCode,
                    b.ComponentProduct.Name,
                    b.Quantity)).ToList()
                : [];

            return new ProductDto(
                p.Id, p.ArticleCode, p.LegacySku, p.ProductType.ToString(), p.Name, p.Description,
                !string.IsNullOrEmpty(p.ImagePath),
                p.UnitPrice, p.ShowBomInQuote, p.ShowBomInInvoice, p.IsActive,
                movementIds.Contains(p.Id), stock, bom, p.Version);
        }).ToList();
    }

    public static OrderDto ToDto(Order o) => new(
        o.Id,
        o.OrderNumber,
        o.CustomerId,
        o.Customer.Name,
        o.Status.ToString(),
        o.Notes,
        o.ChargeInvoiceNumber,
        o.ChargeInvoiceIssuedAt,
        o.StockDeducted,
        o.Lines.Sum(l => l.LineTotal),
        o.Lines.OrderBy(l => l.SortOrder).Select(l => new OrderLineDto(
            l.Id,
            l.ProductId,
            l.Product.ArticleCode,
            l.Product.Name,
            l.Product.ProductType.ToString(),
            l.Quantity,
            l.UnitPrice,
            l.LineTotal,
            l.SortOrder)).ToList(),
        o.Version,
        o.CreatedAt,
        o.UpdatedAt);
}
