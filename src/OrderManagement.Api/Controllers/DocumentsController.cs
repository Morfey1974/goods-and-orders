using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Extensions;
using OrderManagement.Api.Services;
using OrderManagement.Api.Services.Pdf;

namespace OrderManagement.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DocumentsController(
    AppDbContext db,
    DocumentService documents,
    DocumentPdfService documentPdf) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<DocumentListResponseDto>> List(
        [FromQuery] string? search = null,
        [FromQuery] string? documentType = null,
        [FromQuery] string? status = null,
        [FromQuery] Guid? customerId = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        await documents.SyncChargeInvoicesFromOrdersAsync(tenantId.Value, ct);

        var query = db.BusinessDocuments
            .Where(d => d.TenantId == tenantId)
            .Include(d => d.Customer)
            .Include(d => d.Lines)
            .AsQueryable();

        if (customerId.HasValue)
            query = query.Where(d => d.CustomerId == customerId);
        if (from.HasValue)
            query = query.Where(d => d.IssueDate >= from.Value.ToUniversalTime());
        if (to.HasValue)
            query = query.Where(d => d.IssueDate <= to.Value.ToUniversalTime());
        if (!string.IsNullOrWhiteSpace(documentType) &&
            Enum.TryParse<DocumentType>(documentType, true, out var dt))
            query = query.Where(d => d.DocumentType == dt);
        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<DocumentStatus>(status, true, out var st))
            query = query.Where(d => d.Status == st);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(d =>
                d.DocumentNumber.ToLower().Contains(s) ||
                d.Customer.Name.ToLower().Contains(s) ||
                (d.Description != null && d.Description.ToLower().Contains(s)));
        }

        var list = await query.OrderByDescending(d => d.IssueDate).ThenByDescending(d => d.DocumentNumber).ToListAsync(ct);
        var summary = documents.ComputeSummary(list);

        var groups = list
            .GroupBy(d => new { d.IssueDate.Year, d.IssueDate.Month })
            .OrderByDescending(g => g.Key.Year)
            .ThenByDescending(g => g.Key.Month)
            .Select(g => new DocumentMonthGroupDto(
                $"{g.Key.Year:D4}-{g.Key.Month:D2}",
                g.Key.Year,
                g.Key.Month,
                g.Select(d => DocumentMappers.ToDto(d)).ToList()))
            .ToList();

        return Ok(new DocumentListResponseDto(summary, groups));
    }

    [HttpPost("{id:guid}/send-email")]
    public async Task<ActionResult<SendDocumentEmailResponse>> SendEmail(
        Guid id,
        [FromBody] SendDocumentEmailRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var doc = await db.BusinessDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenantId, ct);
        if (doc is null) return NotFound();

        if (doc.DocumentType is not (DocumentType.Quote or DocumentType.ChargeInvoice or DocumentType.Receipt))
            return BadRequest(new { message = "Email is not supported for this document type." });

        var contact = await db.CustomerContacts
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.ContactId && c.CustomerId == doc.CustomerId, ct);
        if (contact is null)
            return BadRequest(new { message = "Contact person not found for this customer." });

        if (!string.Equals(contact.Email?.Trim(), request.RecipientEmail.Trim(), StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(contact.Email))
        {
            return BadRequest(new { message = "Recipient email does not match the selected contact." });
        }

        // SMTP settings will be wired later — validate payload and return stub.
        return Ok(new SendDocumentEmailResponse(
            Sent: false,
            Stub: true,
            Message: "Document email delivery is not configured yet. Save the message and try again after mail settings are added."));
    }

    [HttpGet("{id:guid}/pdf")]
    public async Task<IActionResult> DownloadPdf(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var pdf = await documentPdf.GenerateAsync(tenantId.Value, id, ct);
            var doc = await db.BusinessDocuments
                .AsNoTracking()
                .FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenantId, ct);
            var fileName = doc is null
                ? "document.pdf"
                : BuildPdfFileName(doc);
            return File(pdf, "application/pdf", fileName, enableRangeProcessing: true);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DocumentDto>> Get(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var doc = await db.BusinessDocuments
            .Include(d => d.Customer)
            .Include(d => d.Lines)
            .Include(d => d.PaymentLines)
            .FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenantId, ct);
        if (doc is null) return NotFound();

        BusinessDocument? parentCharge = null;
        if (doc.DocumentType == DocumentType.Receipt && doc.ParentDocumentId is { } chargeId)
        {
            parentCharge = await db.BusinessDocuments
                .AsNoTracking()
                .FirstOrDefaultAsync(d => d.Id == chargeId && d.TenantId == tenantId, ct);
        }

        return Ok(DocumentMappers.ToDto(doc, parentCharge));
    }

    [HttpPost]
    public async Task<ActionResult<DocumentDto>> Create([FromBody] CreateDocumentRequest request, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        DocumentType type;
        try { type = DocumentMappers.ParseType(request.DocumentType); }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }

        if (type == DocumentType.Receipt && !request.ParentDocumentId.HasValue)
            return BadRequest(new { message = "Receipt requires parent charge invoice." });

        List<(Guid? ProductId, string Description, decimal Qty, decimal UnitPrice)>? lines = null;
        if (request.Lines is { Count: > 0 })
        {
            lines = [];
            foreach (var line in request.Lines)
            {
                if (line.ProductId is { } pid)
                {
                    var product = await db.Products.FirstOrDefaultAsync(
                        p => p.Id == pid && p.TenantId == tenantId, ct);
                    if (product is null)
                        return BadRequest(new { message = $"Product {pid} not found." });
                    lines.Add((pid, line.Description.Trim().Length > 0 ? line.Description : product.Name,
                        line.Quantity, line.UnitPrice > 0 ? line.UnitPrice : product.UnitPrice));
                }
                else
                {
                    lines.Add((null, line.Description.Trim(), line.Quantity, line.UnitPrice));
                }
            }
        }
        else if (type is DocumentType.Quote or DocumentType.ChargeInvoice)
        {
            return BadRequest(new { message = "At least one line is required." });
        }

        Guid customerId = request.CustomerId;
        if (type == DocumentType.Receipt)
        {
            var charge = await db.BusinessDocuments.FirstOrDefaultAsync(
                d => d.Id == request.ParentDocumentId && d.TenantId == tenantId, ct);
            if (charge is null)
                return BadRequest(new { message = "Parent charge invoice not found." });
            if (charge.DocumentType != DocumentType.ChargeInvoice)
                return BadRequest(new { message = "Receipt parent must be a charge invoice." });
            customerId = charge.CustomerId;
        }

        try
        {
            var doc = await documents.CreateAsync(
                tenantId.Value,
                type,
                customerId,
                request.Description,
                request.IssueDate,
                request.DueDate,
                request.PaymentMethod,
                request.ParentDocumentId,
                request.OrderId,
                lines,
                request.DiscountPercent,
                request.DiscountAmount,
                receiptAsDraft: type == DocumentType.Receipt,
                ct);
            BusinessDocument? parentCharge = null;
            if (doc.DocumentType == DocumentType.Receipt && doc.ParentDocumentId is { } chargeId)
            {
                parentCharge = await db.BusinessDocuments
                    .AsNoTracking()
                    .FirstOrDefaultAsync(d => d.Id == chargeId && d.TenantId == tenantId, ct);
            }
            return CreatedAtAction(nameof(Get), new { id = doc.Id }, DocumentMappers.ToDto(doc, parentCharge));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<DocumentDto>> Update(
        Guid id,
        [FromBody] UpdateDocumentRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        List<(Guid? ProductId, string Description, decimal Qty, decimal UnitPrice)>? lines = null;
        if (request.Lines is { Count: > 0 })
        {
            lines = [];
            foreach (var line in request.Lines)
            {
                if (line.ProductId is { } pid)
                {
                    var product = await db.Products.FirstOrDefaultAsync(
                        p => p.Id == pid && p.TenantId == tenantId, ct);
                    if (product is null)
                        return BadRequest(new { message = $"Product {pid} not found." });
                    lines.Add((pid, line.Description.Trim().Length > 0 ? line.Description : product.Name,
                        line.Quantity, line.UnitPrice > 0 ? line.UnitPrice : product.UnitPrice));
                }
                else
                {
                    lines.Add((null, line.Description.Trim(), line.Quantity, line.UnitPrice));
                }
            }
        }

        try
        {
            var doc = await documents.UpdateAsync(
                tenantId.Value,
                id,
                request.Description,
                request.IssueDate,
                request.DueDate,
                request.PaymentMethod,
                request.Version,
                lines,
                request.DiscountPercent,
                request.DiscountAmount,
                ct);
            return Ok(DocumentMappers.ToDto(doc));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Document was modified. Refresh and try again." });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            await documents.DeleteAsync(tenantId.Value, id, ct);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/duplicate")]
    public async Task<ActionResult<DocumentDto>> Duplicate(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var doc = await documents.DuplicateAsync(tenantId.Value, id, ct);
            return CreatedAtAction(nameof(Get), new { id = doc.Id }, DocumentMappers.ToDto(doc));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/payment")]
    public async Task<ActionResult<DocumentDto>> RecordPayment(
        Guid id,
        [FromBody] RecordPaymentRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var exists = await db.BusinessDocuments.AnyAsync(d => d.Id == id && d.TenantId == tenantId, ct);
        if (!exists) return NotFound();

        try
        {
            var receipt = await documents.IssueReceiptAsync(
                tenantId.Value,
                id,
                request.PaymentMethod,
                request.PaymentDate,
                ct);
            BusinessDocument? parentCharge = null;
            if (receipt.ParentDocumentId is { } chargeId)
            {
                parentCharge = await db.BusinessDocuments
                    .AsNoTracking()
                    .FirstOrDefaultAsync(d => d.Id == chargeId && d.TenantId == tenantId, ct);
            }
            return Ok(DocumentMappers.ToDto(receipt, parentCharge));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}/receipt")]
    public async Task<ActionResult<DocumentDto>> SaveReceipt(
        Guid id,
        [FromBody] UpdateReceiptRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        if (request.PaymentLines is null or { Count: 0 })
            return BadRequest(new { message = "At least one payment line is required." });

        try
        {
            var receipt = await documents.SaveReceiptAsync(
                tenantId.Value,
                id,
                request.Description,
                request.IssueDate,
                request.Version,
                request.PaymentLines,
                request.Finalize,
                ct);

            BusinessDocument? parentCharge = null;
            if (receipt.ParentDocumentId is { } chargeId)
            {
                parentCharge = await db.BusinessDocuments
                    .AsNoTracking()
                    .FirstOrDefaultAsync(d => d.Id == chargeId && d.TenantId == tenantId, ct);
            }
            return Ok(DocumentMappers.ToDto(receipt, parentCharge));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/issue-charge-invoice")]
    public async Task<ActionResult<DocumentDto>> IssueChargeInvoice(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var doc = await documents.IssueChargeFromQuoteAsync(tenantId.Value, id, ct);
            return Ok(DocumentMappers.ToDto(doc));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/issue-receipt")]
    public async Task<ActionResult<DocumentDto>> IssueReceipt(
        Guid id,
        [FromBody] RecordPaymentRequest? request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var receipt = await documents.IssueReceiptAsync(
                tenantId.Value,
                id,
                request?.PaymentMethod,
                request?.PaymentDate,
                ct);

            BusinessDocument? parentCharge = null;
            if (receipt.ParentDocumentId is { } chargeId)
            {
                parentCharge = await db.BusinessDocuments
                    .AsNoTracking()
                    .FirstOrDefaultAsync(d => d.Id == chargeId && d.TenantId == tenantId, ct);
            }
            return Ok(DocumentMappers.ToDto(receipt, parentCharge));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private static string BuildPdfFileName(BusinessDocument doc)
    {
        var num = BusinessDocumentPdfBuilder.StripDocumentPrefix(doc.DocumentNumber);
        return doc.DocumentType switch
        {
            DocumentType.Quote => $"quote-{num}.pdf",
            DocumentType.ChargeInvoice => $"invoice-{num}.pdf",
            DocumentType.Receipt => $"receipt-{num}.pdf",
            _ => $"document-{num}.pdf"
        };
    }
}
