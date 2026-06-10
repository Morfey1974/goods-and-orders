using System.Text.Json;
using System.Text.Json.Serialization;

namespace LocalScanLauncher;

public sealed class LauncherConfig
{
    public string ListenUrl { get; set; } = "http://127.0.0.1:9181/";
    public string AgentHealthUrl { get; set; } = "http://127.0.0.1:9182/health";
    public string AgentProjectRelative { get; set; } = "tools/LocalScanAgent/LocalScanAgent.csproj";
    public int AgentStartTimeoutSeconds { get; set; } = 25;
    public string[] AllowedOrigins { get; set; } = ["http://localhost:5173", "http://127.0.0.1:5173"];

    public static LauncherConfig Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "local-scan-launcher.json");
        if (!File.Exists(path))
            return new LauncherConfig();

        try
        {
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<LauncherConfig>(json, JsonOptions) ?? new LauncherConfig();
        }
        catch
        {
            return new LauncherConfig();
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
