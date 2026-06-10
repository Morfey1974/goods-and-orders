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
            .Include(r => r.Documents)
            .Include(r => r.Lines)
            .Where(r => r.TenantId == tenantId);

        if (supplierId.HasValue) query = query.Where(r => r.SupplierId == supplierId);
        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<PurchaseReceiptStatus>(status, true, out var st))
            query = query.Where(r => r.Status == st);

        var rangeError = ReportDateRange.Validate(from, to);
        if (rangeError is not null) return BadRequest(new { message = rangeError });

        var fromUtc = ReportDateRange.StartUtc(from);
        var toExclusiveUtc = ReportDateRange.EndExclusiveUtc(to);
        if (fromUtc.HasValue) query = query.Where(r => r.DocumentDate >= fromUtc.Value);
        if (toExclusiveUtc.HasValue) query = query.Where(r => r.DocumentDate < toExclusiveUtc.Value);

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

    [HttpPost("{id:guid}/documents")]
    [RequestSizeLimit(TenantFileService.PurchaseDocumentMaxBytes)]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<PurchaseReceiptDto>> UploadDocument(
        Guid id,
        [FromForm] IFormFile file,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var receipt = await db.PurchaseReceipts
            .Include(r => r.Documents)
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
        if (receipt is null) return NotFound();

        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File is required." });

        try
        {
            var docId = Guid.NewGuid();
            var (path, contentType, originalName) = await files.SavePurchaseReceiptDocumentAsync(
                tenantId.Value, id, docId, file, ct);

            var sortOrder = receipt.Documents.Count > 0
                ? receipt.Documents.Max(d => d.SortOrder) + 1
                : 0;

            var doc = new PurchaseReceiptDocument
            {
                Id = docId,
                PurchaseReceiptId = receipt.Id,
                FilePath = path,
                FileName = originalName,
                ContentType = contentType,
                SortOrder = sortOrder,
                CreatedAt = DateTime.UtcNow
            };

            db.PurchaseReceiptDocuments.Add(doc);
            ClearLegacyDocumentFields(receipt);
            receipt.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            var loaded = await purchaseReceipts.LoadAsync(tenantId.Value, id, ct);
            return Ok(await ToDtoWithWarehousesAsync(loaded!, ct));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/document")]
    [RequestSizeLimit(TenantFileService.PurchaseDocumentMaxBytes)]
    public Task<ActionResult<PurchaseReceiptDto>> UploadDocumentLegacy(
        Guid id,
        IFormFile file,
        CancellationToken ct) =>
        UploadDocument(id, file, ct);

    [HttpDelete("{id:guid}/documents/{documentId:guid}")]
    public async Task<ActionResult<PurchaseReceiptDto>> DeleteDocument(
        Guid id,
        Guid documentId,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var receipt = await db.PurchaseReceipts
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
        if (receipt is null) return NotFound();

        var doc = await db.PurchaseReceiptDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.PurchaseReceiptId == id, ct);
        if (doc is null) return NotFound();

        files.DeleteFile(doc.FilePath);
        db.PurchaseReceiptDocuments.Remove(doc);
        if (!await db.PurchaseReceiptDocuments.AnyAsync(d => d.PurchaseReceiptId == id, ct))
        {
            receipt.DocumentPath = null;
            receipt.DocumentFileName = null;
            receipt.DocumentContentType = null;
        }
        receipt.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var loaded = await purchaseReceipts.LoadAsync(tenantId.Value, id, ct);
        return Ok(await ToDtoWithWarehousesAsync(loaded!, ct));
    }

    [HttpGet("{id:guid}/documents/{documentId:guid}")]
    public async Task<IActionResult> DownloadDocument(
        Guid id,
        Guid documentId,
        [FromQuery] bool download = false,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var doc = await db.PurchaseReceiptDocuments
            .AsNoTracking()
            .Include(d => d.PurchaseReceipt)
            .FirstOrDefaultAsync(
                d => d.Id == documentId &&
                     d.PurchaseReceiptId == id &&
                     d.PurchaseReceipt.TenantId == tenantId,
                ct);
        if (doc is null) return NotFound();

        var absolute = files.GetAbsolutePath(doc.FilePath);
        if (!System.IO.File.Exists(absolute)) return NotFound();

        var contentType = doc.ContentType ?? "application/octet-stream";
        if (download)
        {
            return PhysicalFile(
                absolute,
                contentType,
                doc.FileName,
                enableRangeProcessing: true);
        }

        return PhysicalFile(absolute, contentType, enableRangeProcessing: true);
    }

    [HttpDelete("{id:guid}/document")]
    public async Task<ActionResult<PurchaseReceiptDto>> ClearLegacyDocument(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var receipt = await db.PurchaseReceipts
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
        if (receipt is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(receipt.DocumentPath))
            files.DeleteFile(receipt.DocumentPath);

        ClearLegacyDocumentFields(receipt);
        receipt.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var loaded = await purchaseReceipts.LoadAsync(tenantId.Value, id, ct);
        return Ok(await ToDtoWithWarehousesAsync(loaded!, ct));
    }

    [HttpGet("{id:guid}/document")]
    public async Task<IActionResult> DownloadDocumentLegacy(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var receipt = await db.PurchaseReceipts
            .AsNoTracking()
            .Include(r => r.Documents)
            .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
        if (receipt is null) return NotFound();

        var doc = receipt.Documents.OrderBy(d => d.SortOrder).ThenBy(d => d.CreatedAt).FirstOrDefault();
        if (doc is not null)
            return await DownloadDocument(id, doc.Id, download: false, ct);

        if (string.IsNullOrEmpty(receipt.DocumentPath)) return NotFound();

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

    private static void ClearLegacyDocumentFields(PurchaseReceipt receipt)
    {
        receipt.DocumentPath = null;
        receipt.DocumentFileName = null;
        receipt.DocumentContentType = null;
    }
}
