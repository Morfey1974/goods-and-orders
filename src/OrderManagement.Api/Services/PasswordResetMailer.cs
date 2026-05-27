using Microsoft.Extensions.Options;
using OrderManagement.Api.Configuration;

namespace OrderManagement.Api.Services;

/// <summary>
/// Delivers password reset links. When SMTP is not configured, logs the link
/// instead of sending an email, so the link can be picked up from server logs
/// during development or manual recovery.
/// </summary>
public class PasswordResetMailer(
    IOptions<EmailSettings> emailOptions,
    IOptions<AppSettings> appOptions,
    ILogger<PasswordResetMailer> logger)
{
    public Task SendAsync(string toEmail, string token, CancellationToken ct)
    {
        var appSettings = appOptions.Value;
        var emailSettings = emailOptions.Value;

        var baseUrl = string.IsNullOrWhiteSpace(appSettings.FrontendBaseUrl)
            ? "http://localhost:5173"
            : appSettings.FrontendBaseUrl.TrimEnd('/');

        var link = $"{baseUrl}/reset-password?token={Uri.EscapeDataString(token)}";

        var smtpConfigured = emailSettings.Enabled
            && !string.IsNullOrWhiteSpace(emailSettings.SmtpHost)
            && !string.IsNullOrWhiteSpace(emailSettings.FromAddress);

        if (!smtpConfigured)
        {
            // Dev mode / no SMTP configured: emit a prominent log line so admin
            // can hand-deliver the link until real SMTP credentials are provided.
            logger.LogWarning(
                "PASSWORD RESET LINK for {Email} (valid 30 min): {Link}",
                toEmail,
                link);
            return Task.CompletedTask;
        }

        // Real SMTP delivery is not implemented yet. Keep behavior consistent
        // and log the link so the user can still recover. Hook a MailKit/SendGrid
        // implementation here when credentials are wired up.
        logger.LogWarning(
            "Email.Enabled=true but SMTP sender is not implemented yet. Falling back to log. " +
            "Reset link for {Email}: {Link}",
            toEmail,
            link);

        return Task.CompletedTask;
    }
}
