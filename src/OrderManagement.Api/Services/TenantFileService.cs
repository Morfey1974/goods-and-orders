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
    public const int PurchaseDocumentMaxBytes = 15 * 1024 * 1024;

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
        var buffer = new byte[1024];
        var read = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), ct);
        if (read < 5)
            return false;

        var start = 0;
        while (start < read - 4 && buffer[start] is (byte)'\r' or (byte)'\n' or (byte)' ' or (byte)'\t')
            start++;

        for (var i = start; i <= read - 5; i++)
        {
            if (buffer[i] == (byte)'%' &&
                buffer[i + 1] == (byte)'P' &&
                buffer[i + 2] == (byte)'D' &&
                buffer[i + 3] == (byte)'F' &&
                buffer[i + 4] == (byte)'-')
                return true;
        }

        return false;
    }

    public async Task<(string RelativePath, string ContentType, string OriginalFileName)> SavePurchaseReceiptDocumentAsync(
        Guid tenantId,
        Guid receiptId,
        Guid documentId,
        IFormFile file,
        CancellationToken ct)
    {
        if (file.Length == 0)
            throw new InvalidOperationException("File is empty.");
        if (file.Length > PurchaseDocumentMaxBytes)
            throw new InvalidOperationException($"File must be at most {PurchaseDocumentMaxBytes / (1024 * 1024)} MB.");

        var ext = Path.GetExtension(file.FileName);
        var isPdf = string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase);
        var isImage = ImageExtensions.Contains(ext);
        if (!isPdf && !isImage)
            throw new InvalidOperationException("Use PDF, JPG, PNG or WebP.");

        var safeName = Path.GetFileName(file.FileName);
        var storedExt = isPdf ? ".pdf" : ext.ToLowerInvariant();
        var relative = $"{tenantId:N}/purchases/{receiptId:N}/{documentId:N}{storedExt}";
        var absolute = GetAbsolutePath(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(absolute)!);

        await using (var stream = File.Create(absolute))
        {
            await file.CopyToAsync(stream, ct);
        }

        var contentType = isPdf
            ? "application/pdf"
            : GetImageContentType(relative);

        return (relative, contentType, safeName);
    }

    public async Task<(string RelativePath, string ContentType, string OriginalFileName)> SaveBusinessExpenseDocumentAsync(
        Guid tenantId,
        Guid expenseId,
        Guid documentId,
        IFormFile file,
        CancellationToken ct)
    {
        if (file.Length == 0)
            throw new InvalidOperationException("File is empty.");
        if (file.Length > PurchaseDocumentMaxBytes)
            throw new InvalidOperationException($"File must be at most {PurchaseDocumentMaxBytes / (1024 * 1024)} MB.");

        var ext = Path.GetExtension(file.FileName);
        var isPdf = string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase);
        var isImage = ImageExtensions.Contains(ext);
        if (!isPdf && !isImage)
            throw new InvalidOperationException("Use PDF, JPG, PNG or WebP.");

        var safeName = Path.GetFileName(file.FileName);
        var storedExt = isPdf ? ".pdf" : ext.ToLowerInvariant();
        var relative = $"{tenantId:N}/business-expenses/{expenseId:N}/{documentId:N}{storedExt}";
        var absolute = GetAbsolutePath(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(absolute)!);

        await using (var stream = File.Create(absolute))
        {
            await file.CopyToAsync(stream, ct);
        }

        var contentType = isPdf
            ? "application/pdf"
            : GetImageContentType(relative);

        return (relative, contentType, safeName);
    }

    public async Task<(string RelativePath, string ContentType, string OriginalFileName)> SaveFixedAssetDocumentAsync(
        Guid tenantId,
        Guid assetId,
        Guid documentId,
        IFormFile file,
        CancellationToken ct)
    {
        if (file.Length == 0)
            throw new InvalidOperationException("File is empty.");
        if (file.Length > PurchaseDocumentMaxBytes)
            throw new InvalidOperationException($"File must be at most {PurchaseDocumentMaxBytes / (1024 * 1024)} MB.");

        var ext = Path.GetExtension(file.FileName);
        var isPdf = string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase);
        var isImage = ImageExtensions.Contains(ext);
        if (!isPdf && !isImage)
            throw new InvalidOperationException("Use PDF, JPG, PNG or WebP.");

        var safeName = Path.GetFileName(file.FileName);
        var storedExt = isPdf ? ".pdf" : ext.ToLowerInvariant();
        var relative = $"{tenantId:N}/fixed-assets/{assetId:N}/{documentId:N}{storedExt}";
        var absolute = GetAbsolutePath(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(absolute)!);

        await using (var stream = File.Create(absolute))
        {
            await file.CopyToAsync(stream, ct);
        }

        var contentType = isPdf
            ? "application/pdf"
            : GetImageContentType(relative);

        return (relative, contentType, safeName);
    }

    [Obsolete("Use SavePurchaseReceiptDocumentAsync with documentId for multi-document receipts.")]
    public async Task<(string RelativePath, string ContentType, string OriginalFileName)> SavePurchaseReceiptDocumentAsync(
        Guid tenantId,
        Guid receiptId,
        IFormFile file,
        string? existingRelativePath,
        CancellationToken ct)
    {
        if (file.Length == 0)
            throw new InvalidOperationException("File is empty.");
        if (file.Length > PurchaseDocumentMaxBytes)
            throw new InvalidOperationException($"File must be at most {PurchaseDocumentMaxBytes / (1024 * 1024)} MB.");

        var ext = Path.GetExtension(file.FileName);
        var isPdf = string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase);
        var isImage = ImageExtensions.Contains(ext);
        if (!isPdf && !isImage)
            throw new InvalidOperationException("Use PDF, JPG, PNG or WebP.");

        if (!string.IsNullOrEmpty(existingRelativePath))
            DeleteFile(existingRelativePath);

        var safeName = Path.GetFileName(file.FileName);
        var storedExt = isPdf ? ".pdf" : ext.ToLowerInvariant();
        var relative = $"{tenantId:N}/purchases/{receiptId:N}{storedExt}";
        var absolute = GetAbsolutePath(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(absolute)!);

        if (isPdf)
        {
            await using (var readStream = file.OpenReadStream())
            {
                if (!await LooksLikePdfAsync(readStream, ct))
                    throw new InvalidOperationException("File is not a valid PDF.");
            }
        }

        await using (var stream = File.Create(absolute))
        {
            await file.CopyToAsync(stream, ct);
        }

        var contentType = isPdf
            ? "application/pdf"
            : GetImageContentType(relative);

        return (relative, contentType, safeName);
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
