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
public class WarehouseController(AppDbContext db, WarehouseService warehouseService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<WarehouseDto>>> List(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        await warehouseService.EnsureSystemWarehousesAsync(tenantId.Value, ct);
        var list = await warehouseService.ListAllAsync(tenantId.Value, ct);
        return Ok(list.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<WarehouseDto>> Create([FromBody] CreateWarehouseRequest request, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var wh = await warehouseService.CreateCustomAsync(
                tenantId.Value, request.Name, request.Description, request.IsActive, ct);
            return CreatedAtAction(nameof(List), ToDto(wh));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<WarehouseDto>> Update(
        Guid id,
        [FromBody] UpdateWarehouseRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var wh = await warehouseService.UpdateAsync(
                tenantId.Value, id, request.Name, request.Description, request.IsActive, ct);
            return Ok(ToDto(wh));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            await warehouseService.DeleteCustomAsync(tenantId.Value, id, ct);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("balances")]
    public async Task<ActionResult<IEnumerable<StockBalanceDto>>> Balances(
        [FromQuery] Guid? warehouseId = null,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        await warehouseService.EnsureSystemWarehousesAsync(tenantId.Value, ct);

        var query =
            from b in db.StockBalances
            join p in db.Products on b.ProductId equals p.Id
            join w in db.Warehouses on b.WarehouseId equals w.Id
            where p.TenantId == tenantId && w.TenantId == tenantId
            select new { b, p, w };

        if (warehouseId.HasValue)
            query = query.Where(x => x.b.WarehouseId == warehouseId);

        var balances = await query
            .OrderBy(x => x.w.Name)
            .ThenBy(x => x.p.ArticleCode)
            .Select(x => new StockBalanceDto(
                x.b.ProductId,
                x.p.ArticleCode,
                x.p.Name,
                x.p.ProductType.ToString(),
                x.b.Quantity,
                x.w.Id,
                x.w.Name))
            .ToListAsync(ct);

        return Ok(balances);
    }

    [HttpGet("movements")]
    public async Task<ActionResult<IEnumerable<StockMovementDto>>> Movements(
        [FromQuery] Guid? productId = null,
        [FromQuery] Guid? warehouseId = null,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var query = db.StockMovements
            .Where(m => m.TenantId == tenantId)
            .Include(m => m.Product)
            .AsQueryable();

        if (productId.HasValue) query = query.Where(m => m.ProductId == productId);
        if (warehouseId.HasValue) query = query.Where(m => m.WarehouseId == warehouseId);

        var list = await query
            .OrderByDescending(m => m.CreatedAt)
            .Take(Math.Clamp(limit, 1, 200))
            .Select(m => new StockMovementDto(
                m.Id,
                m.Product.ArticleCode,
                m.Product.Name,
                m.MovementType.ToString(),
                m.Quantity,
                m.BalanceAfter,
                m.Notes,
                m.CreatedAt))
            .ToListAsync(ct);

        return Ok(list);
    }

    [HttpPost("receipt")]
    public async Task<ActionResult<StockMovementDto>> Receipt(
        [FromBody] StockReceiptRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var product = await db.Products.FirstOrDefaultAsync(
            p => p.Id == request.ProductId && p.TenantId == tenantId, ct);
        if (product is null) return NotFound();
        if (!ProductTypePrefixes.TracksStock(product.ProductType))
            return BadRequest(new { message = "This product type is not tracked on stock." });

        try
        {
            var wh = await warehouseService.ResolveReceiptWarehouseAsync(
                tenantId.Value, product, request.WarehouseId, ct);

            var qty = decimal.Round(request.Quantity, 0, MidpointRounding.AwayFromZero);
            if (qty <= 0)
                return BadRequest(new { message = "Quantity must be a positive whole number." });

            var movement = await warehouseService.ApplyMovementAsync(
                tenantId.Value, wh.Id, product.Id,
                StockMovementType.Receipt, qty, request.Notes, ct);

            return Ok(new StockMovementDto(
                movement.Id, product.ArticleCode, product.Name,
                movement.MovementType.ToString(), movement.Quantity,
                movement.BalanceAfter, movement.Notes, movement.CreatedAt));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("stock-products")]
    public async Task<ActionResult<IEnumerable<ProductDto>>> StockProducts(
        [FromQuery] Guid? warehouseId = null,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var (compId, fgId) = await GetSystemIdsAsync(tenantId.Value, ct);

        IQueryable<Product> productQuery = db.Products.Where(p => p.TenantId == tenantId && p.IsActive);

        if (warehouseId.HasValue)
        {
            var wh = await warehouseService.GetByIdAsync(tenantId.Value, warehouseId.Value, ct);
            if (wh is null) return NotFound();

            if (wh.Kind == WarehouseKind.Components)
                productQuery = productQuery.Where(p =>
                    p.ProductType == ProductType.ComponentPart || p.ProductType == ProductType.Spare);
            else if (wh.Kind == WarehouseKind.FinishedGoods)
                productQuery = productQuery.Where(p =>
                    p.ProductType == ProductType.FinishedGood || p.ProductType == ProductType.Bundle);
            else
                productQuery = productQuery.Where(p =>
                    ProductTypePrefixes.TracksStock(p.ProductType));
        }

        var products = await productQuery.OrderBy(p => p.ArticleCode).ToListAsync(ct);

        var dtos = new List<ProductDto>();
        foreach (var p in products)
            dtos.Add(await CatalogMappers.ToDtoAsync(p, db, compId, fgId, ct));
        return Ok(dtos);
    }

    private async Task<(Guid CompId, Guid FgId)> GetSystemIdsAsync(Guid tenantId, CancellationToken ct)
    {
        var (c, f) = await warehouseService.EnsureWarehousesAsync(tenantId, ct);
        return (c.Id, f.Id);
    }

    private static WarehouseDto ToDto(Warehouse w) => new(
        w.Id,
        w.Kind.ToString(),
        w.Name,
        w.Description,
        w.IsActive,
        w.Kind.IsSystem(),
        w.CreatedAt);
}
