using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Extensions;

namespace OrderManagement.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CustomersController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<CustomerDto>>> List(
        [FromQuery] bool includeInactive = false,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var query = db.Customers.Where(c => c.TenantId == tenantId);
        if (!includeInactive) query = query.Where(c => c.IsActive);

        var list = await query.OrderBy(c => c.Name).ToListAsync(ct);
        return Ok(list.Select(CatalogMappers.ToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CustomerDto>> Get(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var c = await db.Customers.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (c is null) return NotFound();
        return Ok(CatalogMappers.ToDto(c));
    }

    [HttpPost]
    public async Task<ActionResult<CustomerDto>> Create([FromBody] CreateCustomerRequest request, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var now = DateTime.UtcNow;
        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            Name = request.Name.Trim(),
            Email = request.Email?.Trim(),
            Phone = request.Phone?.Trim(),
            Address = request.Address?.Trim(),
            DefaultDiscountPercent = request.DefaultDiscountPercent,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Customers.Add(customer);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = customer.Id }, CatalogMappers.ToDto(customer));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CustomerDto>> Update(
        Guid id,
        [FromBody] UpdateCustomerRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var c = await db.Customers.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (c is null) return NotFound();
        if (c.Version != request.Version)
            return Conflict(new { message = "Data was modified. Refresh and try again.", code = "VERSION_CONFLICT" });

        c.Name = request.Name.Trim();
        c.Email = request.Email?.Trim();
        c.Phone = request.Phone?.Trim();
        c.Address = request.Address?.Trim();
        c.DefaultDiscountPercent = request.DefaultDiscountPercent;
        c.IsActive = request.IsActive;
        c.Version++;
        c.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(CatalogMappers.ToDto(c));
    }
}
