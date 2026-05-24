using System.Security.Claims;
using System.ComponentModel.DataAnnotations;
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
        tenant.BusinessNickname = request.BusinessNickname?.Trim();
        tenant.BusinessCategory = request.BusinessCategory?.Trim();
        tenant.OwnerFullName = request.OwnerFullName.Trim();
        tenant.OsekNumber = request.OsekNumber?.Trim();
        tenant.TeudatZehut = request.TeudatZehut.Trim();

        var email = request.Email.Trim().ToLowerInvariant();
        if (!new EmailAddressAttribute().IsValid(email))
            return BadRequest(new { message = "Invalid email address." });

        if (!string.Equals(tenant.Email, email, StringComparison.OrdinalIgnoreCase))
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            var emailTaken = await db.Users.AnyAsync(
                u => u.Email == email && u.Id != userId,
                ct);
            if (emailTaken)
                return Conflict(new { message = "Email already registered.", code = "EMAIL_TAKEN" });

            tenant.Email = email;
            var tenantUsers = await db.Users.Where(u => u.TenantId == tenant.Id).ToListAsync(ct);
            foreach (var user in tenantUsers)
                user.Email = email;
        }

        tenant.Phone = request.Phone?.Trim();
        tenant.MobilePhone = request.MobilePhone?.Trim();
        tenant.Fax = request.Fax?.Trim();
        tenant.Address = request.Address?.Trim();
        tenant.City = request.City?.Trim();
        tenant.ZipCode = request.ZipCode?.Trim();
        tenant.Website = request.Website?.Trim();
        tenant.BusinessField = request.BusinessField?.Trim();
        tenant.DefaultLanguage = request.DefaultLanguage.ToLowerInvariant() switch
        {
            "ru" or "en" or "he" => request.DefaultLanguage.ToLowerInvariant(),
            _ => tenant.DefaultLanguage
        };
        tenant.WithholdingTaxPercent = request.WithholdingTaxPercent is > 0 and <= 100
            ? Math.Round(request.WithholdingTaxPercent.Value, 2)
            : null;
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
        tenant.BankCode = request.BankCode.Trim();
        tenant.BankName = request.BankName?.Trim();
        tenant.BankBranch = request.BankBranch?.Trim();
        tenant.BankAccountNumber = request.BankAccountNumber.Trim();
        tenant.BankSwift = request.BankSwift?.Trim();
        tenant.BankAba = request.BankAba?.Trim();
        tenant.BankIban = request.BankIban?.Trim();
        tenant.ShowBankOnDocuments = request.ShowBankOnDocuments;
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

