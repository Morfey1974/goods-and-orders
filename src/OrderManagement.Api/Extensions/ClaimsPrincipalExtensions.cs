using System.Security.Claims;

namespace OrderManagement.Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static Guid? GetTenantId(this ClaimsPrincipal user)
    {
        var claim = user.FindFirst("tenant_id")?.Value;
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}
