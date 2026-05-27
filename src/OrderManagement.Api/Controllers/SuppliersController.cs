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
public class SuppliersController(AppDbContext db, SupplierImportService importService) : ControllerBase
{
    [HttpPost("import")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<ActionResult<SupplierImportResultDto>> Import(
        IFormFile file,
        [FromQuery] bool updateExisting = false,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        if (file.Length == 0)
            return BadRequest(new { message = "File is empty." });

        await using var stream = file.OpenReadStream();
        var result = await importService.ImportCsvAsync(tenantId.Value, stream, updateExisting, ct);
        return Ok(result);
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<SupplierDto>>> List(
        [FromQuery] bool includeInactive = false,
        [FromQuery] string? country = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var query = db.Suppliers
            .Include(s => s.Contacts)
            .Where(s => s.TenantId == tenantId);

        if (!includeInactive) query = query.Where(s => s.IsActive);

        if (!string.IsNullOrWhiteSpace(country))
        {
            var c = country.Trim().ToUpperInvariant();
            query = query.Where(s => s.CountryCode == c);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(s =>
                s.Name.ToLower().Contains(q) ||
                (s.LegalName != null && s.LegalName.ToLower().Contains(q)) ||
                (s.TaxId != null && s.TaxId.ToLower().Contains(q)) ||
                (s.Email != null && s.Email.ToLower().Contains(q)) ||
                (s.City != null && s.City.ToLower().Contains(q)));
        }

        var list = await query.OrderBy(s => s.Name).ToListAsync(ct);
        return Ok(list.Select(SupplierMappers.ToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SupplierDto>> Get(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var s = await db.Suppliers
            .Include(x => x.Contacts)
            .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (s is null) return NotFound();
        return Ok(SupplierMappers.ToDto(s));
    }

    [HttpPost]
    public async Task<ActionResult<SupplierDto>> Create(
        [FromBody] CreateSupplierRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var now = DateTime.UtcNow;
        var supplier = new Supplier
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            CreatedAt = now,
            UpdatedAt = now
        };
        SupplierMappers.ApplyFields(supplier, request);

        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync(ct);
        await SupplierMappers.SyncContactsAsync(db, supplier.Id, request.Contacts, ct);
        await db.SaveChangesAsync(ct);
        await db.Entry(supplier).Collection(s => s.Contacts).LoadAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = supplier.Id }, SupplierMappers.ToDto(supplier));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<SupplierDto>> Update(
        Guid id,
        [FromBody] UpdateSupplierRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var s = await db.Suppliers.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (s is null) return NotFound();
        if (s.Version != request.Version)
            return Conflict(new { message = "Data was modified. Refresh and try again.", code = "VERSION_CONFLICT" });

        SupplierMappers.ApplyFields(s, request);
        s.IsActive = request.IsActive;
        s.Version++;
        s.UpdatedAt = DateTime.UtcNow;
        await SupplierMappers.SyncContactsAsync(db, s.Id, request.Contacts, ct);
        await db.SaveChangesAsync(ct);
        await db.Entry(s).Collection(x => x.Contacts).LoadAsync(ct);
        return Ok(SupplierMappers.ToDto(s));
    }

    /// <summary>Mark all tenant suppliers as active (e.g. after import).</summary>
    [HttpPost("activate-all")]
    public async Task<ActionResult<object>> ActivateAll(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var inactive = await db.Suppliers
            .Where(s => s.TenantId == tenantId && !s.IsActive)
            .ToListAsync(ct);

        if (inactive.Count == 0)
            return Ok(new { activatedCount = 0 });

        var now = DateTime.UtcNow;
        foreach (var s in inactive)
        {
            s.IsActive = true;
            s.Version++;
            s.UpdatedAt = now;
        }

        await db.SaveChangesAsync(ct);
        return Ok(new { activatedCount = inactive.Count });
    }

    /// <summary>Permanent delete — only inactive suppliers with no purchase receipts.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var s = await db.Suppliers.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (s is null) return NotFound();

        if (s.IsActive)
            return BadRequest(new
            {
                message = "Deactivate the supplier before deleting.",
                code = "SUPPLIER_ACTIVE"
            });

        var hasReceipts = await db.PurchaseReceipts
            .AnyAsync(r => r.TenantId == tenantId && r.SupplierId == id, ct);
        if (hasReceipts)
            return BadRequest(new
            {
                message = "Cannot delete: purchase receipts exist for this supplier.",
                code = "SUPPLIER_HAS_RECEIPTS"
            });

        db.Suppliers.Remove(s);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
