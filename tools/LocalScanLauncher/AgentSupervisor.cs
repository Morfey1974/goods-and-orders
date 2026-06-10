using System.Diagnostics;

namespace LocalScanLauncher;

public sealed class AgentSupervisor(LauncherConfig config)
{
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(3) };
    private readonly SemaphoreSlim _startLock = new(1, 1);
    private Process? _agentProcess;
    private bool _startAttempted;

    public async Task<bool> IsAgentHealthyAsync(CancellationToken ct = default)
    {
        try
        {
            using var res = await _http.GetAsync(config.AgentHealthUrl, ct);
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task EnsureAgentRunningAsync(CancellationToken ct = default)
    {
        if (await IsAgentHealthyAsync(ct))
            return;

        await _startLock.WaitAsync(ct);
        try
        {
            if (await IsAgentHealthyAsync(ct))
                return;

            if (!_startAttempted || _agentProcess is { HasExited: true })
            {
                StartAgentProcess();
                _startAttempted = true;
            }

            var deadline = DateTime.UtcNow.AddSeconds(Math.Max(5, config.AgentStartTimeoutSeconds));
            while (DateTime.UtcNow < deadline)
            {
                ct.ThrowIfCancellationRequested();
                if (await IsAgentHealthyAsync(ct))
                    return;
                await Task.Delay(500, ct);
            }

            throw new InvalidOperationException("Scan agent did not respond in time.");
        }
        finally
        {
            _startLock.Release();
        }
    }

    private void StartAgentProcess()
    {
        var repoRoot = RepoRoot.Find();
        var projectPath = Path.Combine(repoRoot, config.AgentProjectRelative.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(projectPath))
            throw new FileNotFoundException($"Scan agent project not found: {projectPath}");

        var dotnet = ResolveDotnetPath();
        var psi = new ProcessStartInfo
        {
            FileName = dotnet,
            Arguments = $"run --project \"{projectPath}\"",
            WorkingDirectory = repoRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        _agentProcess?.Dispose();
        _agentProcess = Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to start scan agent process.");
        Console.WriteLine($"Started LocalScanAgent (pid {_agentProcess.Id})");
    }

    private static string ResolveDotnetPath()
    {
        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(dir.Trim(), OperatingSystem.IsWindows() ? "dotnet.exe" : "dotnet");
            if (File.Exists(candidate))
                return candidate;
        }

        return "dotnet";
    }
}
