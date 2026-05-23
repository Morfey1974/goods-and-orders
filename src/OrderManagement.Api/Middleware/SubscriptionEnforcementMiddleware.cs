using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Middleware;

public class SubscriptionEnforcementMiddleware(
    RequestDelegate next,
    SubscriptionService subscriptionService)
{
    private static readonly HashSet<string> AllowedPrefixes =
    [
        "/api/health",
        "/api/auth",
        "/swagger"
    ];

    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        if (IsExempt(path) || !IsWriteMethod(context.Request.Method))
        {
            await next(context);
            return;
        }

        if (context.User.Identity?.IsAuthenticated != true)
        {
            await next(context);
            return;
        }

        var tenantIdClaim = context.User.FindFirst("tenant_id")?.Value;
        if (!Guid.TryParse(tenantIdClaim, out var tenantId))
        {
            await next(context);
            return;
        }

        var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId);
        if (tenant is null)
        {
            await next(context);
            return;
        }

        subscriptionService.RefreshSubscriptionStatus(tenant);

        if (!subscriptionService.IsWriteAllowed(tenant))
        {
            context.Response.StatusCode = StatusCodes.Status402PaymentRequired;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                code = "SUBSCRIPTION_EXPIRED",
                message = "Trial period ended. Please subscribe to continue."
            }));
            return;
        }

        await next(context);
    }

    private static bool IsExempt(string path) =>
        AllowedPrefixes.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase));

    private static bool IsWriteMethod(string method) =>
        method is "POST" or "PUT" or "PATCH" or "DELETE";
}
