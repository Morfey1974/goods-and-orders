using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Extensions;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/business-expenses")]
public class BusinessExpensesController(
    BusinessExpenseService expenses,
    BusinessExpenseJournalPdfService journalPdf,
    AppDbContext db,
    TenantFileService files) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BusinessExpenseDto>>> List(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();
        return Ok(await expenses.ListAsync(tenantId.Value, from, to, ct));
    }

    [HttpGet("pdf")]
    public async Task<IActionResult> JournalPdf(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var bytes = await journalPdf.GenerateAsync(tenantId.Value, from, to, ct);
            var fileName = $"business-expenses-{DateTime.UtcNow:yyyyMMdd}.pdf";
            return File(bytes, "application/pdf", fileName);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<BusinessExpenseDto>> Get(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();
        try
        {
            return Ok(await expenses.GetAsync(tenantId.Value, id, ct));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<BusinessExpenseDto>> Create(
        [FromBody] CreateBusinessExpenseRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();
        try
        {
            var created = await expenses.CreateAsync(tenantId.Value, request, ct);
            return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<BusinessExpenseDto>> Update(
        Guid id,
        [FromBody] UpdateBusinessExpenseRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();
        try
        {
            return Ok(await expenses.UpdateAsync(tenantId.Value, id, request, ct));
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
            await expenses.DeleteAsync(tenantId.Value, id, ct);
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
    public async Task<ActionResult<BusinessExpenseDto>> UploadDocument(
        Guid id,
        [FromForm] IFormFile file,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();
        try
        {
            return Ok(await expenses.UploadDocumentAsync(tenantId.Value, id, file, ct));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
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

        var doc = await db.BusinessExpenseDocuments
            .AsNoTracking()
            .Include(d => d.BusinessExpense)
            .FirstOrDefaultAsync(
                d => d.Id == documentId &&
                     d.BusinessExpenseId == id &&
                     d.BusinessExpense.TenantId == tenantId,
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

    [HttpDelete("{id:guid}/documents/{documentId:guid}")]
    public async Task<ActionResult<BusinessExpenseDto>> DeleteDocument(
        Guid id,
        Guid documentId,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();
        try
        {
            return Ok(await expenses.DeleteDocumentAsync(tenantId.Value, id, documentId, ct));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
