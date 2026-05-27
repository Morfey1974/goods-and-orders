using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Extensions;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[ApiController]
[Route("api/tenant/assets")]
[Authorize]
public class TenantAssetsController(
    AppDbContext db,
    TenantFileService fileService,
    TenantEmailService emailService,
    DocumentPdfService documentPdfService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<TenantAssetsSummaryDto>> GetSummary(CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        var docs = await db.TenantComplianceDocuments
            .Where(d => d.TenantId == tenant.Id)
            .OrderBy(d => d.Kind)
            .ToListAsync(ct);

        return Ok(ToSummary(tenant, docs));
    }

    [HttpGet("logo")]
    public async Task<IActionResult> GetLogo(CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null || string.IsNullOrEmpty(tenant.LogoPath))
            return NotFound();

        return ServeFile(tenant.LogoPath, fileService.GetImageContentType(tenant.LogoPath));
    }

    [HttpPost("logo")]
    [RequestSizeLimit(TenantFileService.LogoMaxBytes)]
    public async Task<ActionResult<TenantAssetsSummaryDto>> UploadLogo(IFormFile file, CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        try
        {
            tenant.LogoPath = await fileService.SaveLogoAsync(tenant.Id, file, tenant.LogoPath, ct);
            tenant.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        var docs = await LoadDocsAsync(tenant.Id, ct);
        return Ok(ToSummary(tenant, docs));
    }

    [HttpDelete("logo")]
    public async Task<ActionResult<TenantAssetsSummaryDto>> DeleteLogo(CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        fileService.DeleteFile(tenant.LogoPath);
        tenant.LogoPath = null;
        tenant.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var docs = await LoadDocsAsync(tenant.Id, ct);
        return Ok(ToSummary(tenant, docs));
    }

    [HttpGet("signature")]
    public async Task<IActionResult> GetSignature(CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null || string.IsNullOrEmpty(tenant.SignaturePath))
            return NotFound();

        return ServeFile(tenant.SignaturePath, fileService.GetImageContentType(tenant.SignaturePath));
    }

    [HttpGet("branding-sample/pdf")]
    public async Task<IActionResult> GetBrandingSamplePdf(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var bytes = await documentPdfService.GenerateBrandingSampleAsync(tenantId.Value, ct);
            return File(bytes, "application/pdf", "branding-sample.pdf");
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("signature")]
    [RequestSizeLimit(TenantFileService.SignatureMaxBytes)]
    public async Task<ActionResult<TenantAssetsSummaryDto>> UploadSignature(IFormFile file, CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        try
        {
            tenant.SignaturePath = await fileService.SaveSignatureAsync(
                tenant.Id, file, tenant.SignaturePath, ct);
            tenant.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        var docs = await LoadDocsAsync(tenant.Id, ct);
        return Ok(ToSummary(tenant, docs));
    }

    [HttpDelete("signature")]
    public async Task<ActionResult<TenantAssetsSummaryDto>> DeleteSignature(CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        fileService.DeleteFile(tenant.SignaturePath);
        tenant.SignaturePath = null;
        tenant.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var docs = await LoadDocsAsync(tenant.Id, ct);
        return Ok(ToSummary(tenant, docs));
    }

    [HttpGet("compliance/{kind}")]
    public async Task<IActionResult> GetCompliance(string kind, CancellationToken ct)
    {
        if (!TenantComplianceKindParser.TryParse(kind, out var docKind))
            return BadRequest(new { message = "Invalid document kind." });

        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var doc = await db.TenantComplianceDocuments.FirstOrDefaultAsync(
            d => d.TenantId == tenantId && d.Kind == docKind, ct);
        if (doc is null) return NotFound();

        return ServeFile(doc.FilePath, doc.ContentType, doc.OriginalFileName);
    }

    [HttpPost("compliance/{kind}")]
    [RequestSizeLimit(TenantFileService.CompliancePdfMaxBytes)]
    public async Task<ActionResult<TenantAssetsSummaryDto>> UploadCompliance(
        string kind,
        IFormFile? file,
        CancellationToken ct)
    {
        if (!TenantComplianceKindParser.TryParse(kind, out var docKind))
            return BadRequest(new { message = "Invalid document kind." });

        if (file is null || file.Length == 0)
            return BadRequest(new { message = "No file uploaded. Use form field 'file'." });

        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        var existing = await db.TenantComplianceDocuments.FirstOrDefaultAsync(
            d => d.TenantId == tenant.Id && d.Kind == docKind, ct);

        try
        {
            var (path, contentType, size) = await fileService.SaveCompliancePdfAsync(
                tenant.Id,
                docKind,
                file,
                existing?.FilePath,
                ct);

            if (existing is null)
            {
                existing = new TenantComplianceDocument
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenant.Id,
                    Kind = docKind,
                };
                db.TenantComplianceDocuments.Add(existing);
            }

            existing.FilePath = path;
            existing.OriginalFileName = Path.GetFileName(file.FileName);
            existing.ContentType = contentType;
            existing.FileSizeBytes = size;
            existing.UploadedAt = DateTime.UtcNow;
            tenant.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync(ct);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        var docs = await LoadDocsAsync(tenant.Id, ct);
        return Ok(ToSummary(tenant, docs));
    }

    [HttpDelete("compliance/{kind}")]
    public async Task<ActionResult<TenantAssetsSummaryDto>> DeleteCompliance(string kind, CancellationToken ct)
    {
        if (!TenantComplianceKindParser.TryParse(kind, out var docKind))
            return BadRequest(new { message = "Invalid document kind." });

        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        var doc = await db.TenantComplianceDocuments.FirstOrDefaultAsync(
            d => d.TenantId == tenant.Id && d.Kind == docKind, ct);
        if (doc is not null)
        {
            fileService.DeleteFile(doc.FilePath);
            db.TenantComplianceDocuments.Remove(doc);
            tenant.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        var docs = await LoadDocsAsync(tenant.Id, ct);
        return Ok(ToSummary(tenant, docs));
    }

    [HttpPost("compliance/send-email")]
    public async Task<ActionResult<SendComplianceEmailApiResponse>> SendComplianceEmail(
        [FromBody] SendComplianceEmailApiRequest request,
        CancellationToken ct)
    {
        var tenant = await GetCurrentTenantAsync(ct);
        if (tenant is null) return NotFound();

        var recipients = (request.Recipients ?? Array.Empty<string>())
            .Select(e => e.Trim().ToLowerInvariant())
            .Where(e => !string.IsNullOrEmpty(e))
            .Distinct()
            .ToList();

        if (recipients.Count == 0)
            return BadRequest(new { message = "At least one recipient email is required." });

        foreach (var email in recipients)
        {
            if (!new EmailAddressAttribute().IsValid(email))
                return BadRequest(new { message = $"Invalid email: {email}" });
        }

        var kinds = new List<TenantComplianceDocumentKind>();
        foreach (var k in request.DocumentKinds ?? Array.Empty<string>())
        {
            if (!TenantComplianceKindParser.TryParse(k, out var kind))
                return BadRequest(new { message = $"Invalid document kind: {k}" });
            kinds.Add(kind);
        }

        if (kinds.Count == 0)
            return BadRequest(new { message = "Select at least one document to send." });

        var docs = await db.TenantComplianceDocuments
            .Where(d => d.TenantId == tenant.Id && kinds.Contains(d.Kind))
            .ToListAsync(ct);

        if (docs.Count != kinds.Count)
            return BadRequest(new { message = "Some selected documents are not uploaded yet." });

        var emailRequest = new SendComplianceEmailRequest(
            recipients,
            request.Subject?.Trim(),
            request.Body?.Trim(),
            kinds);

        var result = await emailService.SendComplianceDocumentsAsync(
            emailRequest, tenant, docs, ct);

        return Ok(new SendComplianceEmailApiResponse(result.Sent, result.Stub, result.Message));
    }

    private async Task<Tenant?> GetCurrentTenantAsync(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return null;
        return await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct);
    }

    private async Task<List<TenantComplianceDocument>> LoadDocsAsync(Guid tenantId, CancellationToken ct) =>
        await db.TenantComplianceDocuments
            .Where(d => d.TenantId == tenantId)
            .OrderBy(d => d.Kind)
            .ToListAsync(ct);

    private static TenantAssetsSummaryDto ToSummary(
        Tenant tenant,
        IReadOnlyList<TenantComplianceDocument> docs) =>
        new(
            !string.IsNullOrEmpty(tenant.LogoPath),
            !string.IsNullOrEmpty(tenant.SignaturePath),
            docs.Select(d => new TenantComplianceDocumentDto(
                TenantComplianceKindParser.ToApiValue(d.Kind),
                d.OriginalFileName,
                d.FileSizeBytes,
                d.UploadedAt)).ToList());

    private IActionResult ServeFile(string relativePath, string contentType, string? downloadName = null)
    {
        try
        {
            var absolute = fileService.GetAbsolutePath(relativePath);
            if (!System.IO.File.Exists(absolute))
                return NotFound();

            if (!string.IsNullOrEmpty(downloadName))
                return PhysicalFile(absolute, contentType, downloadName);

            return PhysicalFile(absolute, contentType);
        }
        catch
        {
            return NotFound();
        }
    }
}
