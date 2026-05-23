using Microsoft.Extensions.Options;
using OrderManagement.Api.Configuration;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class TenantEmailService(
    IOptions<EmailSettings> emailOptions,
    ILogger<TenantEmailService> logger)
{
    public Task<SendComplianceEmailResult> SendComplianceDocumentsAsync(
        SendComplianceEmailRequest request,
        Tenant tenant,
        IReadOnlyList<TenantComplianceDocument> attachments,
        CancellationToken ct)
    {
        var settings = emailOptions.Value;

        if (attachments.Count == 0)
            throw new InvalidOperationException("No documents selected for sending.");

        if (!settings.Enabled)
        {
            logger.LogInformation(
                "SMTP stub: would send {Count} compliance file(s) from tenant {TenantId} to {Recipients}. Subject: {Subject}",
                attachments.Count,
                tenant.Id,
                string.Join(", ", request.Recipients),
                request.Subject);

            return Task.FromResult(new SendComplianceEmailResult(
                Sent: false,
                Stub: true,
                Message: "SMTP is not configured yet. Email was not sent (stub mode)."));
        }

        // Real SMTP implementation will be added when settings are provided.
        logger.LogWarning(
            "Email.Enabled is true but SMTP sender is not implemented yet. Tenant {TenantId}",
            tenant.Id);

        return Task.FromResult(new SendComplianceEmailResult(
            Sent: false,
            Stub: true,
            Message: "SMTP sender is not implemented yet."));
    }
}

public record SendComplianceEmailRequest(
    IReadOnlyList<string> Recipients,
    string? Subject,
    string? Body,
    IReadOnlyList<TenantComplianceDocumentKind> DocumentKinds);

public record SendComplianceEmailResult(bool Sent, bool Stub, string Message);
