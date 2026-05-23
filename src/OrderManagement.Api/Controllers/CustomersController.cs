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
public class CustomersController(AppDbContext db, CustomerLogoService logoService) : ControllerBase
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
            CreatedAt = now,
            UpdatedAt = now
        };
        CatalogMappers.ApplyCustomerFields(customer, request);

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

        CatalogMappers.ApplyCustomerFields(c, request);
        c.Version++;
        c.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(CatalogMappers.ToDto(c));
    }

    [HttpGet("{id:guid}/logo")]
    public async Task<IActionResult> GetLogo(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var c = await db.Customers.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (c is null || string.IsNullOrEmpty(c.LogoPath)) return NotFound();

        var absolute = logoService.GetAbsolutePath(c.LogoPath);
        if (!System.IO.File.Exists(absolute)) return NotFound();
        return PhysicalFile(absolute, logoService.GetContentType(c.LogoPath));
    }

    [HttpPost("{id:guid}/logo")]
    [RequestSizeLimit(CustomerLogoService.MaxBytes)]
    public async Task<ActionResult<CustomerDto>> UploadLogo(Guid id, IFormFile file, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var c = await db.Customers.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (c is null) return NotFound();

        try
        {
            c.LogoPath = await logoService.SaveAsync(tenantId.Value, c.Id, file, c.LogoPath, ct);
            c.Version++;
            c.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        return Ok(CatalogMappers.ToDto(c));
    }

    [HttpDelete("{id:guid}/logo")]
    public async Task<ActionResult<CustomerDto>> DeleteLogo(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var c = await db.Customers.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (c is null) return NotFound();

        logoService.DeleteFile(c.LogoPath);
        c.LogoPath = null;
        c.Version++;
        c.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(CatalogMappers.ToDto(c));
    }
}
