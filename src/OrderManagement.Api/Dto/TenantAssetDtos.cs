using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Dto;

public record TenantAssetsSummaryDto(
    bool HasLogo,
    bool HasSignature,
    IReadOnlyList<TenantComplianceDocumentDto> ComplianceDocuments);

public record TenantComplianceDocumentDto(
    string Kind,
    string OriginalFileName,
    long FileSizeBytes,
    DateTime UploadedAt);

public record SendComplianceEmailApiRequest(
    IReadOnlyList<string> Recipients,
    string? Subject,
    string? Body,
    IReadOnlyList<string> DocumentKinds);

public record SendComplianceEmailApiResponse(
    bool Sent,
    bool Stub,
    string Message);

public static class TenantComplianceKindParser
{
    public static bool TryParse(string value, out TenantComplianceDocumentKind kind)
    {
        return Enum.TryParse(value, ignoreCase: true, out kind);
    }

    public static string ToApiValue(TenantComplianceDocumentKind kind) =>
        kind.ToString();
}
