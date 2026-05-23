using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OrderManagement.Api.Configuration;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class AuthService(
    AppDbContext db,
    JwtTokenService jwt,
    IOptions<SubscriptionSettings> subscriptionOptions)
{
    private readonly SubscriptionSettings _subscriptionSettings = subscriptionOptions.Value;

    public async Task<AuthResponse?> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            return null;

        var now = DateTime.UtcNow;
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            BusinessName = request.BusinessName.Trim(),
            OwnerFullName = request.OwnerFullName.Trim(),
            Email = email,
            DefaultLanguage = NormalizeLanguage(request.DefaultLanguage),
            TaxRegime = TaxRegime.Patur,
            SubscriptionStatus = SubscriptionStatus.Trial,
            RegisteredAt = now,
            TrialEndsAt = now.AddDays(_subscriptionSettings.TrialDays),
            CreatedAt = now,
            UpdatedAt = now
        };

        var user = new User
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            CreatedAt = now
        };

        db.Tenants.Add(tenant);
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        return BuildAuthResponse(user, tenant);
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Email == email, ct);

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return null;

        return BuildAuthResponse(user, user.Tenant);
    }

    private AuthResponse BuildAuthResponse(User user, Tenant tenant) =>
        new(
            jwt.CreateToken(user, tenant),
            tenant.Id,
            user.Id,
            user.Email,
            tenant.BusinessName,
            tenant.DefaultLanguage,
            tenant.TrialEndsAt,
            tenant.SubscriptionStatus.ToString());

    private static string NormalizeLanguage(string lang) =>
        lang.ToLowerInvariant() switch
        {
            "ru" or "en" or "he" => lang.ToLowerInvariant(),
            _ => "he"
        };
}
