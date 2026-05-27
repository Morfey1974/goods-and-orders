using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class PasswordResetService(
    AppDbContext db,
    PasswordResetMailer mailer,
    ILogger<PasswordResetService> logger)
{
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromMinutes(30);

    /// <summary>
    /// Issues a password reset token for the given email and delivers the link
    /// via the mailer. Silently no-ops if the user does not exist (to avoid
    /// account enumeration).
    /// </summary>
    public async Task RequestResetAsync(string email, CancellationToken ct)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct);
        if (user is null)
        {
            logger.LogInformation("Password reset requested for unknown email {Email}", normalizedEmail);
            return;
        }

        // Invalidate any previous active tokens for this user.
        var now = DateTime.UtcNow;
        var active = await db.PasswordResetTokens
            .Where(t => t.UserId == user.Id && t.UsedAt == null && t.ExpiresAt > now)
            .ToListAsync(ct);
        foreach (var t in active)
            t.UsedAt = now;

        var (rawToken, tokenHash) = GenerateToken();

        db.PasswordResetTokens.Add(new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = tokenHash,
            ExpiresAt = now.Add(TokenLifetime),
            CreatedAt = now,
        });

        await db.SaveChangesAsync(ct);
        await mailer.SendAsync(user.Email, rawToken, ct);
    }

    /// <summary>
    /// Confirms a reset using the raw token from the email link and the new password.
    /// Returns true on success, false if the token is unknown / expired / used.
    /// </summary>
    public async Task<bool> ConfirmResetAsync(string rawToken, string newPassword, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rawToken) || newPassword.Length < 8)
            return false;

        var tokenHash = HashToken(rawToken);
        var now = DateTime.UtcNow;

        var entry = await db.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

        if (entry is null || entry.UsedAt != null || entry.ExpiresAt <= now)
            return false;

        entry.UsedAt = now;
        entry.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Password reset completed for user {UserId}", entry.UserId);
        return true;
    }

    private static (string rawToken, string tokenHash) GenerateToken()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        var raw = Base64UrlEncode(bytes);
        return (raw, HashToken(raw));
    }

    private static string HashToken(string raw)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(raw);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash);
    }

    private static string Base64UrlEncode(ReadOnlySpan<byte> bytes)
    {
        var b64 = Convert.ToBase64String(bytes);
        return b64.Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }
}
