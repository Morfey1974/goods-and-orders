using System.Text.Json;
using System.Text.Json.Serialization;

namespace LocalScanAgent;

public sealed class AgentConfig
{
    public string ListenUrl { get; set; } = "http://127.0.0.1:9182/";
    public string Naps2ConsolePath { get; set; } = "";
    public string ProfileName { get; set; } = "A4, 300 dpi, PDF";
    public int IdleExitMinutes { get; set; } = 60;
    public int ScanTimeoutSeconds { get; set; } = 300;
    public string[] AllowedOrigins { get; set; } = ["http://localhost:5173", "http://127.0.0.1:5173"];

    public static AgentConfig Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "local-scan-agent.json");
        if (!File.Exists(path))
            return new AgentConfig();

        try
        {
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<AgentConfig>(json, JsonOptions) ?? new AgentConfig();
        }
        catch
        {
            return new AgentConfig();
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
