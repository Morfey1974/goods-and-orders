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
[Route("api/purchase-receipts")]
[Authorize]
public class PurchaseReceiptsController(
    AppDbContext db,
    PurchaseReceiptService purchaseReceipts,
    TenantFileService files) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<PurchaseReceiptListItemDto>>> List(
        [FromQuery] Guid? supplierId = null,
        [FromQuery] string? status = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var query = db.PurchaseReceipts
            .Include(r => r.Supplier)
            .Where(r => r.TenantId == tenantId);

        if (supplierId.HasValue) query = query.Where(r => r.SupplierId == supplierId);
        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<PurchaseReceiptStatus>(status, true, out var st))
            query = query.Where(r => r.Status == st);
        if (from.HasValue) query = query.Where(r => r.DocumentDate >= from.Value.Date);
        if (to.HasValue) query = query.Where(r => r.DocumentDate <= to.Value.Date);

        var list = await query
            .OrderByDescending(r => r.DocumentDate)
            .ThenByDescending(r => r.CreatedAt)
            .ToListAsync(ct);

        return Ok(list.Select(PurchaseReceiptMappers.ToListItem));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PurchaseReceiptDto>> Get(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var receipt = await purchaseReceipts.LoadAsync(tenantId.Value, id, ct);
        if (receipt is null) return NotFound();
        return Ok(await ToDtoWithWarehousesAsync(receipt, ct));
    }

    [HttpPost]
    public async Task<ActionResult<PurchaseReceiptDto>> Create(
        [FromBody] CreatePurchaseReceiptRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var receipt = await purchaseReceipts.CreateDraftAsync(tenantId.Value, request, ct);
            return CreatedAtAction(nameof(Get), new { id = receipt.Id }, await ToDtoWithWarehousesAsync(receipt, ct));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Данные изменились. Обновите страницу и попробуйте снова." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PurchaseReceiptDto>> Update(
        Guid id,
        [FromBody] UpdatePurchaseReceiptRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var receipt = await purchaseReceipts.UpdateDraftAsync(tenantId.Value, id, request, ct);
            return Ok(await ToDtoWithWarehousesAsync(receipt, ct));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Данные изменились. Обновите страницу и попробуйте снова." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/post")]
    public async Task<ActionResult<PurchaseReceiptDto>> Post(
        Guid id,
        [FromQuery] int version,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var receipt = await purchaseReceipts.PostAsync(tenantId.Value, id, version, ct);
            return Ok(await ToDtoWithWarehousesAsync(receipt, ct));
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
            await purchaseReceipts.DeleteDraftAsync(tenantId.Value, id, ct);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/document")]
    [RequestSizeLimit(TenantFileService.PurchaseDocumentMaxBytes)]
    public async Task<ActionResult<PurchaseReceiptDto>> UploadDocument(
        Guid id,
        IFormFile file,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var receipt = await db.PurchaseReceipts
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
        if (receipt is null) return NotFound();
        if (receipt.Status != PurchaseReceiptStatus.Draft)
            return BadRequest(new { message = "Document can only be attached to draft receipts." });

        try
        {
            var (path, contentType, originalName) = await files.SavePurchaseReceiptDocumentAsync(
                tenantId.Value, id, file, receipt.DocumentPath, ct);
            receipt.DocumentPath = path;
            receipt.DocumentContentType = contentType;
            receipt.DocumentFileName = originalName;
            receipt.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            var loaded = await purchaseReceipts.LoadAsync(tenantId.Value, id, ct);
            return Ok(await ToDtoWithWarehousesAsync(loaded!, ct));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("{id:guid}/document")]
    public async Task<ActionResult<PurchaseReceiptDto>> DeleteDocument(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var receipt = await db.PurchaseReceipts
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
        if (receipt is null) return NotFound();
        if (receipt.Status != PurchaseReceiptStatus.Draft)
            return BadRequest(new { message = "Document can only be removed from draft receipts." });

        files.DeleteFile(receipt.DocumentPath);
        receipt.DocumentPath = null;
        receipt.DocumentContentType = null;
        receipt.DocumentFileName = null;
        receipt.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var loaded = await purchaseReceipts.LoadAsync(tenantId.Value, id, ct);
        return Ok(await ToDtoWithWarehousesAsync(loaded!, ct));
    }

    [HttpGet("{id:guid}/document")]
    public async Task<IActionResult> DownloadDocument(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var receipt = await db.PurchaseReceipts
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
        if (receipt is null || string.IsNullOrEmpty(receipt.DocumentPath)) return NotFound();

        var absolute = files.GetAbsolutePath(receipt.DocumentPath);
        if (!System.IO.File.Exists(absolute)) return NotFound();

        var contentType = receipt.DocumentContentType ?? "application/octet-stream";
        var fileName = receipt.DocumentFileName ?? Path.GetFileName(absolute);
        return PhysicalFile(absolute, contentType, fileName, enableRangeProcessing: true);
    }

    private async Task<PurchaseReceiptDto> ToDtoWithWarehousesAsync(PurchaseReceipt receipt, CancellationToken ct)
    {
        var dto = PurchaseReceiptMappers.ToDto(receipt);
        var warehouseIds = receipt.Lines
            .Where(l => l.WarehouseId.HasValue)
            .Select(l => l.WarehouseId!.Value)
            .Distinct()
            .ToList();

        if (warehouseIds.Count == 0) return dto;

        var names = await db.Warehouses
            .Where(w => warehouseIds.Contains(w.Id))
            .ToDictionaryAsync(w => w.Id, w => w.Name, ct);

        var lines = dto.Lines.Select(line =>
        {
            if (!line.WarehouseId.HasValue) return line;
            return line with
            {
                WarehouseName = names.GetValueOrDefault(line.WarehouseId.Value)
            };
        }).ToList();

        return dto with { Lines = lines };
    }
}
