using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Extensions;

namespace OrderManagement.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/product-groups")]
public class ProductGroupsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductGroupDto>>> List(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var groups = await db.ProductGroups
            .Where(g => g.TenantId == tenantId)
            .OrderBy(g => g.SortOrder)
            .ThenBy(g => g.Name)
            .Include(g => g.Members)
            .ToListAsync(ct);

        return Ok(groups.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<ProductGroupDto>> Create(
        [FromBody] CreateProductGroupRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var name = request.Name.Trim();
        var maxOrder = await db.ProductGroups
            .Where(g => g.TenantId == tenantId)
            .Select(g => (int?)g.SortOrder)
            .MaxAsync(ct) ?? -1;

        var group = new ProductGroup
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            Name = name,
            SortOrder = maxOrder + 1,
        };
        db.ProductGroups.Add(group);
        await db.SaveChangesAsync(ct);
        return Ok(ToDto(group));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProductGroupDto>> Update(
        Guid id,
        [FromBody] UpdateProductGroupRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var group = await db.ProductGroups
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == id && g.TenantId == tenantId, ct);
        if (group is null) return NotFound();

        group.Name = request.Name.Trim();
        group.SortOrder = request.SortOrder;
        await db.SaveChangesAsync(ct);
        return Ok(ToDto(group));
    }

    [HttpPut("{id:guid}/members")]
    public async Task<ActionResult<ProductGroupDto>> SetMembers(
        Guid id,
        [FromBody] SetProductGroupMembersRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var group = await db.ProductGroups
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == id && g.TenantId == tenantId, ct);
        if (group is null) return NotFound();

        var productIds = request.ProductIds.Distinct().ToList();
        if (productIds.Count > 0)
        {
            var validCount = await db.Products
                .CountAsync(p => p.TenantId == tenantId && productIds.Contains(p.Id), ct);
            if (validCount != productIds.Count)
                return BadRequest(new { message = "One or more products not found." });
        }

        db.ProductGroupMembers.RemoveRange(group.Members);
        group.Members = productIds.Select(pid => new ProductGroupMember
        {
            ProductGroupId = group.Id,
            ProductId = pid,
        }).ToList();

        await db.SaveChangesAsync(ct);
        return Ok(ToDto(group));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var group = await db.ProductGroups
            .FirstOrDefaultAsync(g => g.Id == id && g.TenantId == tenantId, ct);
        if (group is null) return NotFound();

        db.ProductGroups.Remove(group);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static ProductGroupDto ToDto(ProductGroup g) =>
        new(g.Id, g.Name, g.SortOrder, g.Members.Select(m => m.ProductId).ToList());
}
