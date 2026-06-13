using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Extensions;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/inventory")]
public class InventoryController(
    AppDbContext db,
    InventoryCostService inventoryCost,
    InventoryValuationService valuation,
    InventoryValuationPdfService valuationPdf) : ControllerBase
{
    [HttpPost("opening-balance")]
    public async Task<ActionResult<PostInventoryOpeningBalanceResult>> PostOpeningBalance(
        [FromBody] PostInventoryOpeningBalanceRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        if (request.Lines is null || request.Lines.Count == 0)
            return BadRequest(new { message = "Add at least one line." });

        var asOf = DateTime.SpecifyKind(request.AsOfDate.Date, DateTimeKind.Utc);
        decimal totalValue = 0;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            foreach (var line in request.Lines)
            {
                var product = await db.Products.FirstOrDefaultAsync(
                    p => p.Id == line.ProductId && p.TenantId == tenantId, ct);
                if (product is null)
                    return BadRequest(new { message = "Product not found." });

                if (!ProductTypePrefixes.TracksStock(product.ProductType))
                    return BadRequest(new { message = $"Product {product.ArticleCode} cannot be tracked on stock." });

                if (!product.TrackInventory)
                    product.TrackInventory = true;

                var wh = await db.Warehouses.FirstOrDefaultAsync(
                    w => w.Id == line.WarehouseId && w.TenantId == tenantId && w.IsActive, ct);
                if (wh is null)
                    return BadRequest(new { message = "Warehouse not found or inactive." });

                var unitCost = InventoryCostService.RoundIls(line.UnitCostIls);
                var qty = StockQuantity.Normalize(line.Quantity);
                totalValue += InventoryCostService.RoundIls(unitCost * qty);

                var notes = string.IsNullOrWhiteSpace(request.Notes)
                    ? $"Opening balance {asOf:yyyy-MM-dd}"
                    : request.Notes.Trim();

                await inventoryCost.ReceiveAsync(
                    tenantId.Value,
                    line.ProductId,
                    line.WarehouseId,
                    qty,
                    unitCost,
                    asOf,
                    InventoryLotSource.OpeningBalance,
                    null,
                    notes,
                    ct);
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (InvalidOperationException ex)
        {
            await tx.RollbackAsync(ct);
            return BadRequest(new { message = ex.Message });
        }

        return Ok(new PostInventoryOpeningBalanceResult(
            request.Lines.Count,
            InventoryCostService.RoundIls(totalValue)));
    }

    [HttpGet("valuation")]
    public async Task<ActionResult<InventoryValuationReportDto>> Valuation(
        [FromQuery] DateTime? asOf,
        [FromQuery] bool detailed = false,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var report = await valuation.BuildCurrentAsync(tenantId.Value, asOf, detailed, ct);
        return Ok(report);
    }

    [HttpGet("valuation/pdf")]
    public async Task<IActionResult> ValuationPdf(
        [FromQuery] DateTime? asOf,
        [FromQuery] bool detailed = false,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var pdf = await valuationPdf.GenerateAsync(tenantId.Value, asOf, detailed, ct);
            return File(pdf, "application/pdf", "inventory-valuation.pdf", enableRangeProcessing: true);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("lots")]
    public async Task<ActionResult<IReadOnlyList<InventoryLotDto>>> Lots(
        [FromQuery] DateTime? asOf,
        [FromQuery] Guid? productId = null,
        [FromQuery] Guid? warehouseId = null,
        [FromQuery] bool includeDepleted = false,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var lots = await valuation.ListLotsAsync(
            tenantId.Value, asOf, productId, warehouseId, includeDepleted, ct);
        return Ok(lots);
    }

    [HttpPost("reset-stock")]
    public async Task<ActionResult<StockInventoryResetResultDto>> ResetStock(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var result = await StockInventoryResetService.ClearAllAsync(db, tenantId, ct);
        return Ok(new StockInventoryResetResultDto(
            result.LotAllocationsDeleted,
            result.LotsDeleted,
            result.AverageCostsDeleted,
            result.MovementsDeleted,
            result.BalancesDeleted,
            result.OrdersStockFlagReset,
            result.ProductsTrackInventoryReset));
    }
}
