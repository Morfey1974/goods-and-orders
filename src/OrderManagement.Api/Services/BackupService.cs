using System.Diagnostics;
using System.IO.Compression;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using OrderManagement.Api.Configuration;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class BackupService(
    AppDbContext db,
    TenantFileService tenantFiles,
    IConfiguration configuration,
    IOptions<BackupSettings> backupOptions,
    ILogger<BackupService> logger)
{
    private static readonly JsonSerializerOptions ManifestJsonOptions = new() { WriteIndented = true };

    public string RootPath =>
        backupOptions.Value.RootPath?.Trim() ?? "/app/backups";

    public string? HostMountHint =>
        configuration["Backup:HostMountHint"];

    public async Task<BackupSettingsDto?> GetSettingsAsync(Guid tenantId, CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        if (tenant is null) return null;

        return ToSettingsDto(tenant);
    }

    public async Task<BackupSettingsDto?> UpdateSettingsAsync(
        Guid tenantId,
        UpdateBackupSettingsRequest request,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        if (tenant is null) return null;

        tenant.BackupHostPath = NormalizeHostPath(request.BackupHostPath);
        tenant.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return ToSettingsDto(tenant);
    }

    public async Task<RunBackupResultDto> RunBackupAsync(Guid tenantId, CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        if (tenant is null)
            return new RunBackupResultDto(false, null, null, null, null, "Tenant not found.");

        var workDir = Path.Combine(Path.GetTempPath(), $"ordermgmt-backup-{Guid.NewGuid():N}");
        Directory.CreateDirectory(workDir);

        try
        {
            var createdUtc = DateTime.UtcNow;
            var createdLocal = BusinessTimeZone.ToLocal(createdUtc);
            var sessionFolder = BuildSessionFolderName(createdLocal);
            var stamp = createdLocal.ToString("yyyy-MM-dd_HHmmss");
            var safeBusiness = SanitizeFileName(tenant.BusinessName);
            var zipFileName = $"OrderManagement_backup_{safeBusiness}_{stamp}.zip";

            var backupDir = Path.Combine(RootPath, sessionFolder);
            Directory.CreateDirectory(backupDir);
            var zipPath = Path.Combine(backupDir, zipFileName);
            var storedFileName = $"{sessionFolder}/{zipFileName}";

            await DumpDatabaseAsync(Path.Combine(workDir, "database.sql"), ct);
            CopyTenantUploads(tenantId, Path.Combine(workDir, "uploads"));

            var hostHint = ComposeHostBackupHint(tenant.BackupHostPath ?? HostMountHint, sessionFolder);
            var instructions = BackupRestoreInstructions.Build(
                tenant.BusinessName,
                createdUtc,
                zipFileName,
                hostHint);
            await File.WriteAllTextAsync(
                Path.Combine(workDir, BackupRestoreInstructions.FileName),
                instructions,
                ct);

            var manifest = new
            {
                createdAtUtc = createdUtc,
                tenantId = tenantId.ToString(),
                businessName = tenant.BusinessName,
                app = "OrderManagement",
                contents = new[] { "database.sql", "uploads/", BackupRestoreInstructions.FileName }
            };
            await File.WriteAllTextAsync(
                Path.Combine(workDir, "manifest.json"),
                JsonSerializer.Serialize(manifest, ManifestJsonOptions),
                ct);

            if (File.Exists(zipPath))
                File.Delete(zipPath);

            ZipFile.CreateFromDirectory(workDir, zipPath, CompressionLevel.Optimal, false);

            var size = new FileInfo(zipPath).Length;
            tenant.LastBackupUtc = createdUtc;
            tenant.LastBackupFileName = storedFileName;
            tenant.LastBackupSizeBytes = size;
            tenant.LastBackupError = null;
            tenant.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            logger.LogInformation(
                "Backup created for tenant {TenantId}: {File} ({Size} bytes)",
                tenantId,
                zipPath,
                size);

            return new RunBackupResultDto(
                true,
                storedFileName,
                zipPath,
                size,
                createdUtc,
                null);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Backup failed for tenant {TenantId}", tenantId);
            tenant.LastBackupError = ex.Message.Length > 2000 ? ex.Message[..2000] : ex.Message;
            tenant.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            return new RunBackupResultDto(false, null, null, null, null, ex.Message);
        }
        finally
        {
            try
            {
                if (Directory.Exists(workDir))
                    Directory.Delete(workDir, true);
            }
            catch (Exception cleanupEx)
            {
                logger.LogWarning(cleanupEx, "Failed to clean temp backup dir {Dir}", workDir);
            }
        }
    }

    private BackupSettingsDto ToSettingsDto(Tenant tenant) =>
        new(
            tenant.BackupHostPath,
            RootPath,
            HostMountHint,
            tenant.LastBackupUtc,
            tenant.LastBackupFileName,
            tenant.LastBackupSizeBytes,
            tenant.LastBackupError);

    private static string? NormalizeHostPath(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var trimmed = raw.Trim();
        if (trimmed.Length > 512) trimmed = trimmed[..512];
        if (trimmed.Contains("..", StringComparison.Ordinal))
            throw new InvalidOperationException("Invalid backup path.");
        return trimmed;
    }

    /// <summary>Подпапка резервной копии: ДДММГГ-ЧЧ ММ (локальное время).</summary>
    public static string BuildSessionFolderName(DateTime localTime) =>
        localTime.ToString("ddMMyy-HH mm");

    private static string ComposeHostBackupHint(string? hostRoot, string sessionFolder)
    {
        if (string.IsNullOrWhiteSpace(hostRoot))
            return sessionFolder;

        var root = hostRoot.Trim().TrimEnd('\\', '/');
        return $"{root}\\{sessionFolder}";
    }

    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var chars = name.Select(c => invalid.Contains(c) ? '_' : c).ToArray();
        var result = new string(chars).Trim();
        if (result.Length > 40) result = result[..40];
        return string.IsNullOrWhiteSpace(result) ? "business" : result;
    }

    private async Task DumpDatabaseAsync(string outputPath, CancellationToken ct)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string not configured.");

        var builder = new NpgsqlConnectionStringBuilder(connectionString);
        var host = builder.Host ?? "localhost";
        var port = builder.Port > 0 ? builder.Port : 5432;
        var database = builder.Database ?? "ordermgmt";
        var username = builder.Username ?? "ordermgmt";
        var password = builder.Password ?? "";

        var psi = new ProcessStartInfo
        {
            FileName = "pg_dump",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        psi.ArgumentList.Add("--host");
        psi.ArgumentList.Add(host);
        psi.ArgumentList.Add("--port");
        psi.ArgumentList.Add(port.ToString());
        psi.ArgumentList.Add("--username");
        psi.ArgumentList.Add(username);
        psi.ArgumentList.Add("--no-owner");
        psi.ArgumentList.Add("--no-acl");
        psi.ArgumentList.Add("--format");
        psi.ArgumentList.Add("plain");
        psi.ArgumentList.Add("--file");
        psi.ArgumentList.Add(outputPath);
        psi.ArgumentList.Add(database);
        psi.Environment["PGPASSWORD"] = password;

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException("Could not start pg_dump. Is postgresql-client installed?");

        var stderrTask = process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);
        var stderr = await stderrTask;

        if (process.ExitCode != 0 || !File.Exists(outputPath))
        {
            var detail = string.IsNullOrWhiteSpace(stderr)
                ? $"pg_dump failed with exit code {process.ExitCode}."
                : stderr.Trim();
            if (detail.Contains("server version mismatch", StringComparison.OrdinalIgnoreCase))
            {
                detail += " Rebuild the API container: docker compose up -d --build api";
            }

            throw new InvalidOperationException(detail);
        }
    }

    private void CopyTenantUploads(Guid tenantId, string destDir)
    {
        var source = Path.Combine(tenantFiles.UploadsRoot, tenantId.ToString("N"));
        if (!Directory.Exists(source))
        {
            Directory.CreateDirectory(destDir);
            return;
        }

        CopyDirectory(source, destDir);
    }

    private static void CopyDirectory(string source, string dest)
    {
        Directory.CreateDirectory(dest);
        foreach (var file in Directory.GetFiles(source))
        {
            var name = Path.GetFileName(file);
            File.Copy(file, Path.Combine(dest, name), true);
        }

        foreach (var dir in Directory.GetDirectories(source))
        {
            var name = Path.GetFileName(dir);
            CopyDirectory(dir, Path.Combine(dest, name));
        }
    }
}
