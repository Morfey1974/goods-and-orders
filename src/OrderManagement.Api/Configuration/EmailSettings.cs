namespace OrderManagement.Api.Configuration;

public class EmailSettings
{
    public const string SectionName = "Email";

    /// <summary>When false, emails are queued/logged only (SMTP stub).</summary>
    public bool Enabled { get; set; }

    public string? SmtpHost { get; set; }
    public int SmtpPort { get; set; } = 587;
    public string? SmtpUser { get; set; }
    public string? SmtpPassword { get; set; }
    public bool UseSsl { get; set; } = true;
    public string? FromAddress { get; set; }
    public string? FromDisplayName { get; set; }
}
