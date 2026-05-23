using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class TenantFileService(IWebHostEnvironment env, IConfiguration config)
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".webp" };

    private static readonly HashSet<string> ImageContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp"
    };

    public const int LogoMaxBytes = 2 * 1024 * 1024;
    public const int SignatureMaxBytes = 2 * 1024 * 1024;
    public const int CompliancePdfMaxBytes = 10 * 1024 * 1024;

    public string UploadsRoot =>
        config["Uploads:Path"] ?? Path.Combine(env.ContentRootPath, "uploads");

    public string GetAbsolutePath(string relativePath) =>
        Path.Combine(UploadsRoot, relativePath.Replace('/', Path.DirectorySeparatorChar));

    public void DeleteFile(string? relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return;
        var absolute = GetAbsolutePath(relativePath);
        if (File.Exists(absolute))
            File.Delete(absolute);
    }

    public async Task<string> SaveLogoAsync(
        Guid tenantId,
        IFormFile file,
        string? existingRelativePath,
        CancellationToken ct)
    {
        return await SaveImageAsync(
            tenantId,
            file,
            existingRelativePath,
            "branding/logo",
            LogoMaxBytes,
            ct);
    }

    public async Task<string> SaveSignatureAsync(
        Guid tenantId,
        IFormFile file,
        string? existingRelativePath,
        CancellationToken ct)
    {
        return await SaveImageAsync(
            tenantId,
            file,
            existingRelativePath,
            "branding/signature",
            SignatureMaxBytes,
            ct);
    }

    public async Task<(string RelativePath, string ContentType, long Size)> SaveCompliancePdfAsync(
        Guid tenantId,
        TenantComplianceDocumentKind kind,
        IFormFile file,
        string? existingRelativePath,
        CancellationToken ct)
    {
        if (file.Length == 0)
            throw new InvalidOperationException("File is empty.");
        if (file.Length > CompliancePdfMaxBytes)
            throw new InvalidOperationException($"PDF must be at most {CompliancePdfMaxBytes / (1024 * 1024)} MB.");

        var ext = Path.GetExtension(file.FileName);
        if (!string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only PDF files are allowed.");

        if (!IsAllowedPdfContentType(file.ContentType))
            throw new InvalidOperationException("Only PDF files are allowed.");

        if (!string.IsNullOrEmpty(existingRelativePath))
            DeleteFile(existingRelativePath);

        var tenantDir = Path.Combine(UploadsRoot, tenantId.ToString("N"), "compliance");
        Directory.CreateDirectory(tenantDir);

        var relative = $"{tenantId:N}/compliance/{kind.ToString().ToLowerInvariant()}.pdf";
        var absolute = GetAbsolutePath(relative);

        await using (var readStream = file.OpenReadStream())
        {
            if (!await LooksLikePdfAsync(readStream, ct))
                throw new InvalidOperationException("File is not a valid PDF.");
        }

        await using var stream = File.Create(absolute);
        await file.CopyToAsync(stream, ct);

        return (relative, "application/pdf", file.Length);
    }

    private async Task<string> SaveImageAsync(
        Guid tenantId,
        IFormFile file,
        string? existingRelativePath,
        string nameStem,
        int maxBytes,
        CancellationToken ct)
    {
        if (file.Length == 0)
            throw new InvalidOperationException("File is empty.");
        if (file.Length > maxBytes)
            throw new InvalidOperationException($"Image must be at most {maxBytes / (1024 * 1024)} MB.");

        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrEmpty(ext) || !ImageExtensions.Contains(ext))
            throw new InvalidOperationException("Use JPG, PNG or WebP.");

        if (!string.IsNullOrEmpty(file.ContentType) && !ImageContentTypes.Contains(file.ContentType))
            throw new InvalidOperationException("Invalid image type. Use JPG, PNG or WebP.");

        if (!string.IsNullOrEmpty(existingRelativePath))
            DeleteFile(existingRelativePath);

        var tenantDir = Path.Combine(UploadsRoot, tenantId.ToString("N"), "branding");
        Directory.CreateDirectory(tenantDir);

        var relative = $"{tenantId:N}/{nameStem}{ext.ToLowerInvariant()}";
        var absolute = GetAbsolutePath(relative);

        await using var stream = File.Create(absolute);
        await file.CopyToAsync(stream, ct);

        return relative;
    }

    private static bool IsAllowedPdfContentType(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
            return true;

        if (contentType.Contains("pdf", StringComparison.OrdinalIgnoreCase))
            return true;

        // Browsers on Windows often send PDFs as octet-stream.
        return contentType.Equals("application/octet-stream", StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<bool> LooksLikePdfAsync(Stream stream, CancellationToken ct)
    {
        var header = new byte[5];
        var read = await stream.ReadAsync(header.AsMemory(0, 5), ct);
        if (read < 5)
            return false;
        return header[0] == (byte)'%' &&
               header[1] == (byte)'P' &&
               header[2] == (byte)'D' &&
               header[3] == (byte)'F' &&
               header[4] == (byte)'-';
    }

    public string GetImageContentType(string relativePath)
    {
        var ext = Path.GetExtension(relativePath).ToLowerInvariant();
        return ext switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/jpeg"
        };
    }
}
