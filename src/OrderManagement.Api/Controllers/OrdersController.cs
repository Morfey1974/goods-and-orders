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
public class OrdersController(
    AppDbContext db,
    ArticleSequenceService articles,
    StockFulfillmentService stockFulfillment,
    DocumentService documentService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<OrderDto>>> List(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var orders = await db.Orders
            .Where(o => o.TenantId == tenantId)
            .Include(o => o.Customer)
            .Include(o => o.Lines)
            .ThenInclude(l => l.Product)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(ct);

        return Ok(orders.Select(CatalogMappers.ToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderDto>> Get(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var order = await LoadOrderAsync(tenantId.Value, id, ct);
        if (order is null) return NotFound();
        return Ok(CatalogMappers.ToDto(order));
    }

    [HttpPost]
    public async Task<ActionResult<OrderDto>> Create([FromBody] CreateOrderRequest request, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var customer = await db.Customers.FirstOrDefaultAsync(
            c => c.Id == request.CustomerId && c.TenantId == tenantId, ct);
        if (customer is null) return BadRequest(new { message = "Customer not found." });
        if (request.Lines is null || request.Lines.Count == 0)
            return BadRequest(new { message = "At least one line is required." });

        var lineErr = await BuildLinesAsync(tenantId.Value, request.Lines, ct);
        if (lineErr.Error is not null) return BadRequest(new { message = lineErr.Error });
        if (lineErr.Lines is null || lineErr.Lines.Count == 0)
            return BadRequest(new { message = "At least one line is required." });

        var now = DateTime.UtcNow;
        var order = new Order
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            OrderNumber = await articles.AllocateNextAsync(tenantId.Value, "O", ct),
            CustomerId = customer.Id,
            Status = OrderStatus.Draft,
            Notes = request.Notes?.Trim(),
            CreatedAt = now,
            UpdatedAt = now
        };

        foreach (var line in lineErr.Lines)
            order.Lines.Add(line);

        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        order = await LoadOrderAsync(tenantId.Value, order.Id, ct);
        return CreatedAtAction(nameof(Get), new { id = order!.Id }, CatalogMappers.ToDto(order));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<OrderDto>> Update(
        Guid id,
        [FromBody] UpdateOrderRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var order = await db.Orders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == id && o.TenantId == tenantId, ct);
        if (order is null) return NotFound();
        if (order.Version != request.Version)
            return Conflict(new { message = "Data was modified. Refresh and try again.", code = "VERSION_CONFLICT" });
        if (order.StockDeducted)
            return BadRequest(new { message = "Cannot edit order after charge invoice (H-) was issued." });

        if (request.CustomerId is { } customerId)
        {
            var customer = await db.Customers.FirstOrDefaultAsync(
                c => c.Id == customerId && c.TenantId == tenantId, ct);
            if (customer is null) return BadRequest(new { message = "Customer not found." });
            order.CustomerId = customerId;
        }

        if (request.Notes is not null)
            order.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();

        if (!string.IsNullOrWhiteSpace(request.Status) &&
            Enum.TryParse<OrderStatus>(request.Status, true, out var newStatus))
            order.Status = newStatus;

        if (request.Lines is not null)
        {
            var lineErr = await BuildLinesAsync(tenantId.Value, request.Lines, ct);
            if (lineErr.Error is not null) return BadRequest(new { message = lineErr.Error });

            db.OrderLines.RemoveRange(order.Lines);
            order.Lines.Clear();
            foreach (var line in lineErr.Lines ?? [])
                order.Lines.Add(line);
        }

        order.Version++;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        order = await LoadOrderAsync(tenantId.Value, id, ct);
        return Ok(CatalogMappers.ToDto(order!));
    }

    /// <summary>ביצוע — work in progress; does not move stock.</summary>
    [HttpPost("{id:guid}/start-work")]
    public async Task<ActionResult<OrderDto>> StartWork(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var order = await LoadOrderAsync(tenantId.Value, id, ct);
        if (order is null) return NotFound();
        if (order.Status is OrderStatus.Cancelled)
            return BadRequest(new { message = "Cannot start work on a cancelled order." });
        if (order.StockDeducted)
            return BadRequest(new { message = "Charge invoice already issued for this order." });

        if (order.Status is OrderStatus.Draft or OrderStatus.QuoteSent or OrderStatus.Accepted)
            order.Status = OrderStatus.InProgress;

        order.Version++;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        order = await LoadOrderAsync(tenantId.Value, id, ct);
        return Ok(CatalogMappers.ToDto(order!));
    }

    /// <summary>
    /// חשבון חיוב / חשבון עסקה (H-) for עוסק פטור — assigns H- number and deducts stock (FG + BOM).
    /// </summary>
    [HttpPost("{id:guid}/issue-charge-invoice")]
    public async Task<ActionResult<OrderDto>> IssueChargeInvoice(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var order = await LoadOrderAsync(tenantId.Value, id, ct);
        if (order is null) return NotFound();
        if (order.StockDeducted)
            return BadRequest(new { message = "Stock was already deducted (charge invoice already issued)." });
        if (order.Status is OrderStatus.Cancelled)
            return BadRequest(new { message = "Cannot issue charge invoice for a cancelled order." });

        var chargeNumber = await articles.AllocateNextAsync(tenantId.Value, "H", ct);
        var reference = $"{chargeNumber} / order {order.OrderNumber}";

        try
        {
            await stockFulfillment.DeductOrderStockAsync(tenantId.Value, order, reference, ct);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        order.ChargeInvoiceNumber = chargeNumber;
        order.ChargeInvoiceIssuedAt = DateTime.UtcNow;
        order.StockDeducted = true;
        order.Status = OrderStatus.Invoiced;
        order.Version++;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await documentService.CreateFromOrderChargeInvoiceAsync(order, chargeNumber, ct);

        order = await LoadOrderAsync(tenantId.Value, id, ct);
        return Ok(CatalogMappers.ToDto(order!));
    }

    private async Task<Order?> LoadOrderAsync(Guid tenantId, Guid id, CancellationToken ct) =>
        await db.Orders
            .Where(o => o.TenantId == tenantId && o.Id == id)
            .Include(o => o.Customer)
            .Include(o => o.Lines)
            .ThenInclude(l => l.Product)
            .FirstOrDefaultAsync(ct);

    private async Task<(List<OrderLine>? Lines, string? Error)> BuildLinesAsync(
        Guid tenantId,
        IReadOnlyList<OrderLineInput> inputs,
        CancellationToken ct)
    {
        var lines = new List<OrderLine>();
        var sort = 0;
        foreach (var input in inputs)
        {
            var product = await db.Products.FirstOrDefaultAsync(
                p => p.Id == input.ProductId && p.TenantId == tenantId, ct);
            if (product is null)
                return (null, $"Product {input.ProductId} not found.");

            var unitPrice = input.UnitPrice ?? product.UnitPrice;
            var qty = input.Quantity;
            lines.Add(new OrderLine
            {
                Id = Guid.NewGuid(),
                ProductId = product.Id,
                Quantity = qty,
                UnitPrice = unitPrice,
                LineTotal = Math.Round(unitPrice * qty, 2),
                SortOrder = sort++
            });
        }
        return (lines, null);
    }
}
