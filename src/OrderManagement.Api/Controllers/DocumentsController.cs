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
public class DocumentsController(AppDbContext db, DocumentService documents) : ControllerBase
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
                g.Select(DocumentMappers.ToDto).ToList()))
            .ToList();

        return Ok(new DocumentListResponseDto(summary, groups));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DocumentDto>> Get(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var doc = await db.BusinessDocuments
            .Include(d => d.Customer)
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenantId, ct);
        if (doc is null) return NotFound();
        return Ok(DocumentMappers.ToDto(doc));
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

        try
        {
            var doc = await documents.CreateAsync(
                tenantId.Value,
                type,
                request.CustomerId,
                request.Description,
                request.IssueDate,
                request.DueDate,
                request.PaymentMethod,
                request.ParentDocumentId,
                request.OrderId,
                lines,
                ct);
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

        var charge = await db.BusinessDocuments
            .Include(d => d.Customer)
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenantId, ct);
        if (charge is null) return NotFound();
        if (charge.DocumentType != DocumentType.ChargeInvoice)
            return BadRequest(new { message = "Payment can only be recorded for charge invoices." });

        var hasReceipt = await db.BusinessDocuments.AnyAsync(
            d => d.ParentDocumentId == charge.Id && d.DocumentType == DocumentType.Receipt, ct);
        if (hasReceipt)
            return BadRequest(new { message = "Receipt already exists for this invoice." });

        try
        {
            var receipt = await documents.CreateAsync(
                tenantId.Value,
                DocumentType.Receipt,
                charge.CustomerId,
                charge.Description,
                request.PaymentDate ?? DateTime.UtcNow,
                null,
                request.PaymentMethod ?? charge.PaymentMethod,
                charge.Id,
                charge.OrderId,
                null,
                ct);
            charge.Status = DocumentStatus.Paid;
            charge.UpdatedAt = DateTime.UtcNow;
            if (charge.OrderId is { } orderId)
            {
                var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
                if (order is not null)
                {
                    order.Status = OrderStatus.Paid;
                    order.UpdatedAt = DateTime.UtcNow;
                }
            }
            await db.SaveChangesAsync(ct);
            return Ok(DocumentMappers.ToDto(receipt));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
