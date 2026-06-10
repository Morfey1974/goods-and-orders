namespace OrderManagement.Api.Configuration;

public class BackupSettings
{
    public const string SectionName = "Backup";

    /// <summary>Docker-mounted directory where backup ZIP files are written (/app/backups).</summary>
    public string RootPath { get; set; } = "/app/backups";
}
