using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Extensions;
using OrderManagement.Api.Helpers;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[ApiController]
[Route("api/assemblies")]
[Authorize]
public class AssembliesController(
    AppDbContext db,
    AssemblyService assemblies) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<StockAssemblyListItemDto>>> List(
        [FromQuery] string? status = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] Guid? outputProductId = null,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var query = db.StockAssemblies
            .Include(a => a.OutputProduct)
            .Where(a => a.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<StockAssemblyStatus>(status, true, out var st))
            query = query.Where(a => a.Status == st);

        if (outputProductId.HasValue)
            query = query.Where(a => a.OutputProductId == outputProductId.Value);

        var rangeError = ReportDateRange.Validate(from, to);
        if (rangeError is not null) return BadRequest(new { message = rangeError });

        var fromUtc = ReportDateRange.StartUtc(from);
        var toExclusiveUtc = ReportDateRange.EndExclusiveUtc(to);
        if (fromUtc.HasValue) query = query.Where(a => a.AssemblyDate >= fromUtc.Value);
        if (toExclusiveUtc.HasValue) query = query.Where(a => a.AssemblyDate < toExclusiveUtc.Value);

        var list = await query
            .OrderByDescending(a => a.AssemblyDate)
            .ThenByDescending(a => a.CreatedAt)
            .ToListAsync(ct);

        return Ok(list.Select(AssemblyService.ToListItem));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<StockAssemblyDto>> Get(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var assembly = await assemblies.LoadAsync(tenantId.Value, id, ct);
        if (assembly is null) return NotFound();

        decimal? outputUnitCost = null;
        if (assembly.Status == StockAssemblyStatus.Posted && assembly.OutputLotId is { } lotId)
        {
            var lot = await db.InventoryLots.AsNoTracking().FirstOrDefaultAsync(l => l.Id == lotId, ct);
            outputUnitCost = lot?.UnitCostIls;
        }

        return Ok(AssemblyService.ToDto(assembly, outputUnitCost));
    }

    [HttpGet("recipe-lines")]
    public async Task<ActionResult<IReadOnlyList<StockAssemblyLineInput>>> RecipeLines(
        [FromQuery] Guid outputProductId,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var recipe = await db.AssemblyRecipeLines
            .Where(r => r.ParentProductId == outputProductId)
            .ToListAsync(ct);

        if (recipe.Count == 0)
            return Ok(Array.Empty<StockAssemblyLineInput>());

        var parent = await db.Products.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == outputProductId && p.TenantId == tenantId, ct);
        if (parent is null) return NotFound();

        var lines = AssemblyService.RecipeLinesPerUnit(recipe);
        return Ok(lines);
    }

    [HttpPost]
    public async Task<ActionResult<StockAssemblyDto>> Create(
        [FromBody] CreateStockAssemblyRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var assembly = await assemblies.CreateDraftAsync(tenantId.Value, request, ct);
            return CreatedAtAction(nameof(Get), new { id = assembly.Id }, AssemblyService.ToDto(assembly));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Данные изменились. Обновите страницу и попробуйте снова." });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<StockAssemblyDto>> Update(
        Guid id,
        [FromBody] UpdateStockAssemblyRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var assembly = await assemblies.UpdateDraftAsync(tenantId.Value, id, request, ct);
            return Ok(AssemblyService.ToDto(assembly));
        }
        catch (InvalidOperationException ex) when (ex.Message == "VERSION_CONFLICT")
        {
            return Conflict(new { message = "Данные изменились. Обновите страницу и попробуйте снова." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Данные изменились. Обновите страницу и попробуйте снова." });
        }
    }

    [HttpPost("{id:guid}/post")]
    public async Task<ActionResult<StockAssemblyDto>> Post(
        Guid id,
        [FromQuery] int version,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var assembly = await assemblies.PostAsync(tenantId.Value, id, version, ct);
            decimal? outputUnitCost = null;
            if (assembly.OutputLotId is { } lotId)
            {
                var lot = await db.InventoryLots.AsNoTracking().FirstOrDefaultAsync(l => l.Id == lotId, ct);
                outputUnitCost = lot?.UnitCostIls;
            }

            return Ok(AssemblyService.ToDto(assembly, outputUnitCost));
        }
        catch (InvalidOperationException ex) when (ex.Message == "VERSION_CONFLICT")
        {
            return Conflict(new { message = "Данные изменились. Обновите страницу и попробуйте снова." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Данные изменились. Обновите страницу и попробуйте снова." });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            await assemblies.DeleteDraftAsync(tenantId.Value, id, ct);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
