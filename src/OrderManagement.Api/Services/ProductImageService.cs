using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class ProductImageService(IWebHostEnvironment env, IConfiguration config)
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".webp" };

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp"
    };

    public const int MaxBytes = 2 * 1024 * 1024;

    public string UploadsRoot =>
        config["Uploads:Path"] ?? Path.Combine(env.ContentRootPath, "uploads");

    public string? GetRelativePath(Product product) => product.ImagePath;

    public string GetAbsolutePath(Product product)
    {
        if (string.IsNullOrEmpty(product.ImagePath))
            throw new FileNotFoundException();
        return Path.Combine(UploadsRoot, product.ImagePath.Replace('/', Path.DirectorySeparatorChar));
    }

    public string BuildRelativePath(Guid tenantId, Guid productId, string extension) =>
        $"{tenantId:N}/{productId:N}{extension.ToLowerInvariant()}";

    public async Task<string> SaveAsync(
        Guid tenantId,
        Guid productId,
        IFormFile file,
        string? existingRelativePath,
        CancellationToken ct)
    {
        if (file.Length == 0)
            throw new InvalidOperationException("File is empty.");
        if (file.Length > MaxBytes)
            throw new InvalidOperationException($"Image must be at most {MaxBytes / (1024 * 1024)} MB.");

        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrEmpty(ext) || !AllowedExtensions.Contains(ext))
            throw new InvalidOperationException("Use JPG, PNG or WebP.");

        if (!string.IsNullOrEmpty(file.ContentType) && !AllowedContentTypes.Contains(file.ContentType))
            throw new InvalidOperationException("Invalid image type. Use JPG, PNG or WebP.");

        if (!string.IsNullOrEmpty(existingRelativePath))
            DeleteFile(existingRelativePath);

        var tenantDir = Path.Combine(UploadsRoot, tenantId.ToString("N"));
        Directory.CreateDirectory(tenantDir);

        var relative = BuildRelativePath(tenantId, productId, ext);
        var absolute = Path.Combine(UploadsRoot, relative.Replace('/', Path.DirectorySeparatorChar));

        await using var stream = File.Create(absolute);
        await file.CopyToAsync(stream, ct);

        return relative;
    }

    public void DeleteFile(string? relativePath)
    {
        if (string.IsNullOrEmpty(relativePath)) return;
        var absolute = Path.Combine(UploadsRoot, relativePath.Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(absolute))
            File.Delete(absolute);
    }

    public string GetContentType(string relativePath)
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
