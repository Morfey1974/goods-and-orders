using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;

namespace OrderManagement.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TenantController(AppDbContext db) : ControllerBase
{
    [HttpGet("profile")]
    public async Task<ActionResult<TenantProfileDto>> GetProfile(CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();
        return Ok(TenantMapper.ToDto(tenant));
    }

    [HttpPut("profile")]
    public async Task<ActionResult<TenantProfileDto>> UpdateProfile(
        [FromBody] UpdateTenantRequest request,
        CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        if (tenant.Version != request.Version)
            return Conflict(new { message = "Data was modified. Refresh and try again.", code = "VERSION_CONFLICT" });

        tenant.BusinessName = request.BusinessName.Trim();
        tenant.OwnerFullName = request.OwnerFullName.Trim();
        tenant.OsekNumber = request.OsekNumber?.Trim();
        tenant.TeudatZehut = request.TeudatZehut.Trim();
        tenant.Phone = request.Phone?.Trim();
        tenant.Address = request.Address?.Trim();
        tenant.DefaultLanguage = request.DefaultLanguage.ToLowerInvariant() switch
        {
            "ru" or "en" or "he" => request.DefaultLanguage.ToLowerInvariant(),
            _ => tenant.DefaultLanguage
        };
        tenant.Version++;
        tenant.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(TenantMapper.ToDto(tenant));
    }

    [HttpPut("bank-details")]
    public async Task<ActionResult<TenantProfileDto>> UpdateBankDetails(
        [FromBody] UpdateBankDetailsRequest request,
        CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        if (tenant.Version != request.Version)
            return Conflict(new { message = "Data was modified. Refresh and try again.", code = "VERSION_CONFLICT" });

        tenant.BankBeneficiary = request.BankBeneficiary.Trim();
        tenant.BankName = request.BankName.Trim();
        tenant.BankBranch = request.BankBranch?.Trim();
        tenant.BankAccountNumber = request.BankAccountNumber.Trim();
        tenant.BankDetails = TenantMapper.ComposeBankDetails(tenant);
        tenant.Version++;
        tenant.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return Ok(TenantMapper.ToDto(tenant));
    }

    private async Task<Entities.Tenant?> GetCurrentTenantAsync(CancellationToken ct)
    {
        var tenantIdClaim = User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(tenantIdClaim, out var tenantId))
            return null;

        return await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct);
    }
}
