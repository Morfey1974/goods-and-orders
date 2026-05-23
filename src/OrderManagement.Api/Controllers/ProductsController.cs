using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Extensions;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProductsController(
    AppDbContext db,
    ArticleSequenceService articles,
    WarehouseService warehouseService,
    ProductImportService importService,
    ProductImageService imageService) : ControllerBase
{
    [HttpPost("import")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<ActionResult<ProductImportResultDto>> Import(
        IFormFile file,
        [FromQuery] string defaultProductType = "ComponentPart",
        [FromQuery] bool importStock = true,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        if (file.Length == 0)
            return BadRequest(new { message = "File is empty." });

        var name = file.FileName.ToLowerInvariant();
        if (!name.EndsWith(".csv") && !name.EndsWith(".txt"))
            return BadRequest(new { message = "Use .csv or .txt file (UTF-8). Save Excel as CSV." });

        await using var stream = file.OpenReadStream();
        var result = await importService.ImportCsvAsync(
            tenantId.Value, stream, defaultProductType, importStock, ct);
        return Ok(result);
    }

    [HttpPost("reactivate-imported")]
    public async Task<ActionResult<object>> ReactivateImported(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var count = await db.Products
            .Where(p => p.TenantId == tenantId && p.LegacySku != null && !p.IsActive)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsActive, true), ct);

        return Ok(new { reactivated = count });
    }

    [HttpGet("next-article")]
    public async Task<ActionResult<NextArticleDto>> PeekNextArticle(
        [FromQuery] string productType,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var type = CatalogMappers.ParseProductType(productType);
            var code = await articles.PeekNextAsync(tenantId.Value, type, ct);
            return Ok(new NextArticleDto(code!));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductDto>>> List(
        [FromQuery] string? productType = null,
        [FromQuery] bool includeInactive = true,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);
        var query = db.Products.Where(p => p.TenantId == tenantId);
        if (!includeInactive) query = query.Where(p => p.IsActive);
        if (!string.IsNullOrEmpty(productType) &&
            Enum.TryParse<ProductType>(productType, true, out var pt))
            query = query.Where(p => p.ProductType == pt);

        var products = await query.OrderBy(p => p.ArticleCode).ToListAsync(ct);
        return Ok(await CatalogMappers.ToDtoListAsync(products, db, compWhId, fgWhId, ct));
    }

    [HttpGet("export")]
    public async Task<IActionResult> ExportCsv(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var products = await db.Products
            .Where(p => p.TenantId == tenantId)
            .OrderBy(p => p.LegacySku ?? p.ArticleCode)
            .ToListAsync(ct);

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);
        var stocks = await db.StockBalances
            .Where(b => b.WarehouseId == compWhId || b.WarehouseId == fgWhId)
            .ToListAsync(ct);

        var sb = new StringBuilder();
        sb.AppendLine("מק\"ט,שם הפריט,,מטבע,מחיר,,,כמות,,סטטוס");
        foreach (var p in products)
        {
            var whId = ProductTypePrefixes.GetWarehouseKind(p.ProductType) == WarehouseKind.FinishedGoods
                ? fgWhId
                : compWhId;
            var qty = ProductTypePrefixes.TracksStock(p.ProductType)
                ? stocks.FirstOrDefault(b => b.ProductId == p.Id && b.WarehouseId == whId)?.Quantity ?? 0
                : 0;
            var status = p.IsActive ? "פעיל" : "לא פעיל";
            var legacy = p.LegacySku ?? p.ArticleCode;
            sb.Append(CultureInfo.InvariantCulture, $"{legacy},{EscapeCsv(p.Name)},,ILS,{p.UnitPrice:F2},0,,{qty:F2},0.00000,{status}\n");
        }

        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
        return File(bytes, "text/csv; charset=utf-8", "products-export.csv");
    }

    [HttpPost("deactivate-all")]
    public async Task<ActionResult<object>> DeactivateAll(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var count = await db.Products
            .Where(p => p.TenantId == tenantId && p.IsActive)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsActive, false), ct);

        return Ok(new { deactivated = count });
    }

    [HttpGet("{id:guid}/image")]
    public async Task<IActionResult> GetImage(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var product = await db.Products.FirstOrDefaultAsync(
            x => x.Id == id && x.TenantId == tenantId, ct);
        if (product is null || string.IsNullOrEmpty(product.ImagePath))
            return NotFound();

        try
        {
            var path = imageService.GetAbsolutePath(product);
            if (!System.IO.File.Exists(path))
                return NotFound();

            var contentType = imageService.GetContentType(product.ImagePath);
            return PhysicalFile(path, contentType);
        }
        catch (FileNotFoundException)
        {
            return NotFound();
        }
    }

    [HttpPost("{id:guid}/image")]
    [RequestSizeLimit(ProductImageService.MaxBytes)]
    public async Task<ActionResult<ProductDto>> UploadImage(
        Guid id,
        IFormFile file,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var product = await db.Products.FirstOrDefaultAsync(
            x => x.Id == id && x.TenantId == tenantId, ct);
        if (product is null) return NotFound();

        try
        {
            product.ImagePath = await imageService.SaveAsync(
                tenantId.Value, product.Id, file, product.ImagePath, ct);
            product.Version++;
            product.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);
        return Ok(await CatalogMappers.ToDtoAsync(product, db, compWhId, fgWhId, ct));
    }

    [HttpDelete("{id:guid}/image")]
    public async Task<ActionResult<ProductDto>> DeleteImage(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var product = await db.Products.FirstOrDefaultAsync(
            x => x.Id == id && x.TenantId == tenantId, ct);
        if (product is null) return NotFound();

        imageService.DeleteFile(product.ImagePath);
        product.ImagePath = null;
        product.Version++;
        product.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);
        return Ok(await CatalogMappers.ToDtoAsync(product, db, compWhId, fgWhId, ct));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductDto>> Get(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var p = await db.Products.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (p is null) return NotFound();

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);
        return Ok(await CatalogMappers.ToDtoAsync(p, db, compWhId, fgWhId, ct));
    }

    [HttpPost]
    public async Task<ActionResult<ProductDto>> Create([FromBody] CreateProductRequest request, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        ProductType type;
        try { type = CatalogMappers.ParseProductType(request.ProductType); }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }

        var articleCode = await articles.AllocateNextAsync(tenantId.Value, type, ct);
        var now = DateTime.UtcNow;

        var product = new Product
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            ArticleCode = articleCode,
            ProductType = type,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            UnitPrice = request.UnitPrice,
            ShowBomInQuote = request.ShowBomInQuote,
            ShowBomInInvoice = request.ShowBomInInvoice,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Products.Add(product);

        if (request.BomLines?.Count > 0)
        {
            var err = await SetBomLinesAsync(product, request.BomLines, tenantId.Value, ct);
            if (err is not null) return BadRequest(new { message = err });
        }

        await db.SaveChangesAsync(ct);

        if (ProductTypePrefixes.TracksStock(type))
        {
            var wh = await warehouseService.GetForProductTypeAsync(tenantId.Value, type, ct);
            await warehouseService.GetOrCreateBalanceAsync(wh.Id, product.Id, ct);
        }

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);
        return CreatedAtAction(nameof(Get), new { id = product.Id },
            await CatalogMappers.ToDtoAsync(product, db, compWhId, fgWhId, ct));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProductDto>> Update(
        Guid id,
        [FromBody] UpdateProductRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var product = await db.Products
            .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (product is null) return NotFound();
        if (product.Version != request.Version)
            return Conflict(new { message = "Data was modified. Refresh and try again.", code = "VERSION_CONFLICT" });

        product.Name = request.Name.Trim();
        product.Description = request.Description?.Trim();
        product.UnitPrice = request.UnitPrice;
        product.ShowBomInQuote = request.ShowBomInQuote;
        product.ShowBomInInvoice = request.ShowBomInInvoice;
        product.IsActive = request.IsActive;

        if (!string.IsNullOrWhiteSpace(request.ProductType))
        {
            ProductType newType;
            try { newType = CatalogMappers.ParseProductType(request.ProductType); }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }

            if (newType != product.ProductType)
            {
                var typeErr = await ApplyProductTypeChangeAsync(
                    product, newType, tenantId.Value, ct);
                if (typeErr is not null) return BadRequest(new { message = typeErr });
            }
        }

        if (request.BomLines is not null)
        {
            if (product.ProductType is not (ProductType.FinishedGood or ProductType.Bundle))
                return BadRequest(new { message = "BOM is only allowed for finished goods or bundles." });

            var bomErr = await ReplaceBomLinesAsync(product, request.BomLines, tenantId.Value, ct);
            if (bomErr is not null) return BadRequest(new { message = bomErr });
        }

        product.Version++;
        product.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {
            return BadRequest(new { message = "Could not save product composition. Refresh the card and try again.", detail = ex.InnerException?.Message });
        }

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);
        return Ok(await CatalogMappers.ToDtoAsync(product, db, compWhId, fgWhId, ct));
    }

    [HttpPatch("{id:guid}/active")]
    public async Task<ActionResult<ProductDto>> SetActive(
        Guid id,
        [FromBody] SetProductActiveRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var product = await db.Products
            .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (product is null) return NotFound();
        if (product.Version != request.Version)
            return Conflict(new { message = "Data was modified. Refresh the page and try again.", code = "VERSION_CONFLICT" });

        product.IsActive = request.IsActive;
        product.Version++;
        product.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);
        return Ok(await CatalogMappers.ToDtoAsync(product, db, compWhId, fgWhId, ct));
    }

    [HttpPatch("{id:guid}/quick")]
    public async Task<ActionResult<ProductDto>> QuickUpdate(
        Guid id,
        [FromBody] QuickUpdateProductRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var product = await db.Products
            .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (product is null) return NotFound();
        if (product.Version != request.Version)
            return Conflict(new { message = "Data was modified. Refresh and try again.", code = "VERSION_CONFLICT" });

        var changed = false;
        if (request.UnitPrice is { } price)
        {
            product.UnitPrice = price;
            changed = true;
        }

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);

        if (request.StockQuantity is { } targetQty)
        {
            targetQty = decimal.Round(targetQty, 0, MidpointRounding.AwayFromZero);
            if (!ProductTypePrefixes.TracksStock(product.ProductType))
                return BadRequest(new { message = "This product type is not tracked on stock." });

            var stockWh = await warehouseService.GetForProductAsync(tenantId.Value, product, ct);
            await warehouseService.GetOrCreateBalanceAsync(stockWh.Id, product.Id, ct);
            try
            {
                await warehouseService.ApplyMovementAsync(
                    tenantId.Value, stockWh.Id, product.Id,
                    StockMovementType.Adjustment, targetQty,
                    "Quick edit from catalog", ct);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        if (changed)
        {
            product.Version++;
            product.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        return Ok(await CatalogMappers.ToDtoAsync(product, db, compWhId, fgWhId, ct));
    }

    [HttpPost("{id:guid}/duplicate")]
    public async Task<ActionResult<ProductDto>> Duplicate(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var source = await db.Products
            .Include(p => p.BomLines)
            .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (source is null) return NotFound();

        var articleCode = await articles.AllocateNextAsync(tenantId.Value, source.ProductType, ct);
        var now = DateTime.UtcNow;
        var copy = new Product
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            ArticleCode = articleCode,
            ProductType = source.ProductType,
            Name = source.Name + " (2)",
            Description = source.Description,
            UnitPrice = source.UnitPrice,
            ShowBomInQuote = source.ShowBomInQuote,
            ShowBomInInvoice = source.ShowBomInInvoice,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Products.Add(copy);

        foreach (var line in source.BomLines)
        {
            copy.BomLines.Add(new BomLine
            {
                Id = Guid.NewGuid(),
                ParentProductId = copy.Id,
                ComponentProductId = line.ComponentProductId,
                Quantity = line.Quantity
            });
        }

        await db.SaveChangesAsync(ct);

        if (ProductTypePrefixes.TracksStock(copy.ProductType))
        {
            var wh = await warehouseService.GetForProductAsync(tenantId.Value, copy, ct);
            await warehouseService.GetOrCreateBalanceAsync(wh.Id, copy.Id, ct);
        }

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId.Value, ct);
        return CreatedAtAction(nameof(Get), new { id = copy.Id },
            await CatalogMappers.ToDtoAsync(copy, db, compWhId, fgWhId, ct));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var product = await db.Products
            .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (product is null) return NotFound();

        var hasMovements = await db.StockMovements
            .AnyAsync(m => m.ProductId == id && m.TenantId == tenantId, ct);

        if (hasMovements)
        {
            product.IsActive = false;
            product.Version++;
            product.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Ok(new { deactivated = true });
        }

        var bomRefs = await db.BomLines.AnyAsync(b => b.ComponentProductId == id, ct);
        if (bomRefs)
        {
            product.IsActive = false;
            product.Version++;
            product.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Ok(new { deactivated = true });
        }

        imageService.DeleteFile(product.ImagePath);
        db.Products.Remove(product);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string EscapeCsv(string value)
    {
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
            return $"\"{value.Replace("\"", "\"\"")}\"";
        return value;
    }

    private async Task<string?> ApplyProductTypeChangeAsync(
        Product product,
        ProductType newType,
        Guid tenantId,
        CancellationToken ct)
    {
        var usedAsComponent = await db.BomLines.AnyAsync(b => b.ComponentProductId == product.Id, ct);
        if (usedAsComponent && newType is not (ProductType.ComponentPart or ProductType.Spare))
            return "This item is used in other products' BOM. Change type to CP or SP only, or remove it from BOM first.";

        var (compWhId, fgWhId) = await WarehouseIdsAsync(tenantId, ct);
        var hasMovements = await db.StockMovements.AnyAsync(
            m => m.ProductId == product.Id && m.TenantId == tenantId, ct);

        var oldTracks = ProductTypePrefixes.TracksStock(product.ProductType);
        var newTracks = ProductTypePrefixes.TracksStock(newType);
        var oldWhId = ProductTypePrefixes.GetWarehouseKind(product.ProductType) == WarehouseKind.FinishedGoods
            ? fgWhId
            : compWhId;

        if (!newTracks && oldTracks)
        {
            var qty = await db.StockBalances
                .Where(b => b.WarehouseId == oldWhId && b.ProductId == product.Id)
                .Select(b => (decimal?)b.Quantity)
                .FirstOrDefaultAsync(ct) ?? 0;
            if (qty > 0)
                return "Cannot switch to a non-stock type while warehouse quantity is greater than zero. Adjust stock to zero first.";
        }

        if (!hasMovements)
            product.ArticleCode = await articles.ReserveNextArticleAsync(tenantId, newType, ct);

        product.ProductType = newType;

        if (newType is not (ProductType.FinishedGood or ProductType.Bundle))
        {
            await ClearBomLinesForProductAsync(product.Id, product, ct);
            product.ShowBomInQuote = false;
            product.ShowBomInInvoice = false;
        }

        if (newTracks)
        {
            var newWh = await warehouseService.GetForProductTypeAsync(tenantId, newType, ct);
            await warehouseService.GetOrCreateBalanceAsync(newWh.Id, product.Id, ct);
        }

        return null;
    }

    private async Task<(Guid ComponentsId, Guid FinishedId)> WarehouseIdsAsync(
        Guid tenantId,
        CancellationToken ct)
    {
        var (components, finished) = await warehouseService.EnsureWarehousesAsync(tenantId, ct);
        return (components.Id, finished.Id);
    }

    private async Task ClearBomLinesForProductAsync(
        Guid parentProductId,
        Product? parent,
        CancellationToken ct)
    {
        foreach (var entry in db.ChangeTracker.Entries<BomLine>()
                     .Where(e => e.Entity.ParentProductId == parentProductId)
                     .ToList())
        {
            entry.State = EntityState.Detached;
        }

        await db.BomLines.Where(b => b.ParentProductId == parentProductId).ExecuteDeleteAsync(ct);
        parent?.BomLines.Clear();
    }

    private async Task<string?> ReplaceBomLinesAsync(
        Product parent,
        IReadOnlyList<BomLineInput> lines,
        Guid tenantId,
        CancellationToken ct)
    {
        await ClearBomLinesForProductAsync(parent.Id, parent, ct);
        if (lines.Count == 0) return null;
        return await SetBomLinesAsync(parent, lines, tenantId, ct);
    }

    private async Task<string?> SetBomLinesAsync(
        Product parent,
        IReadOnlyList<BomLineInput> lines,
        Guid tenantId,
        CancellationToken ct)
    {
        if (parent.ProductType is not (ProductType.FinishedGood or ProductType.Bundle))
            return "BOM is only allowed for finished goods or bundles.";

        var seenComponents = new HashSet<Guid>();
        foreach (var line in lines)
        {
            if (line.ComponentProductId == Guid.Empty)
                return "Select a component for each BOM line.";

            if (line.ComponentProductId == parent.Id)
                return "A product cannot include itself in its composition.";

            if (!seenComponents.Add(line.ComponentProductId))
                return "Duplicate component in composition.";

            var qty = decimal.Truncate(line.Quantity);
            if (qty < 1)
                return "Component quantity must be a whole number of at least 1.";

            var component = await db.Products.FirstOrDefaultAsync(
                p => p.Id == line.ComponentProductId && p.TenantId == tenantId, ct);
            if (component is null)
                return $"Component {line.ComponentProductId} not found.";
            if (component.ProductType != ProductType.ComponentPart &&
                component.ProductType != ProductType.Spare)
                return $"Component {component.ArticleCode} must be CP or SP.";

            db.BomLines.Add(new BomLine
            {
                Id = Guid.NewGuid(),
                ParentProductId = parent.Id,
                ComponentProductId = line.ComponentProductId,
                Quantity = qty
            });
        }
        return null;
    }
}
