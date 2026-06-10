using System.Diagnostics;
using System.Text;

namespace LocalScanAgent;

public sealed class Naps2Scanner(AgentConfig config)
{
    private static readonly string[] DefaultNaps2Paths =
    [
        @"C:\Program Files\NAPS2\NAPS2.Console.exe",
        @"C:\Program Files (x86)\NAPS2\NAPS2.Console.exe",
    ];

    public string? ResolvedConsolePath { get; private set; }

    public bool TryResolveConsolePath()
    {
        if (!string.IsNullOrWhiteSpace(config.Naps2ConsolePath) && File.Exists(config.Naps2ConsolePath))
        {
            ResolvedConsolePath = config.Naps2ConsolePath;
            return true;
        }

        foreach (var candidate in DefaultNaps2Paths)
        {
            if (File.Exists(candidate))
            {
                ResolvedConsolePath = candidate;
                return true;
            }
        }

        ResolvedConsolePath = null;
        return false;
    }

    public async Task<ScanResult> ScanToPdfAsync(CancellationToken ct)
    {
        if (!TryResolveConsolePath())
        {
            return ScanResult.Fail(
                "NAPS2.Console.exe not found. Install NAPS2 or set Naps2ConsolePath in local-scan-agent.json.");
        }

        var outputPath = Path.Combine(Path.GetTempPath(), $"ordermgmt-scan-{Guid.NewGuid():N}.pdf");
        var profile = config.ProfileName.Trim();
        if (string.IsNullOrEmpty(profile))
            return ScanResult.Fail("ProfileName is empty in local-scan-agent.json.");

        var args = new StringBuilder();
        args.Append("-o \"").Append(outputPath).Append('"');
        args.Append(" -p \"").Append(profile.Replace("\"", "\\\"", StringComparison.Ordinal)).Append('"');
        args.Append(" -f -n 1");

        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = ResolvedConsolePath,
                    Arguments = args.ToString(),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                },
            };

            if (!process.Start())
                return ScanResult.Fail("Failed to start NAPS2.Console.exe.");

            var stdout = new StringBuilder();
            var stderr = new StringBuilder();
            process.OutputDataReceived += (_, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
            process.ErrorDataReceived += (_, e) => { if (e.Data != null) stderr.AppendLine(e.Data); };
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var timeoutMs = Math.Max(30, config.ScanTimeoutSeconds) * 1000;
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(timeoutMs);

            try
            {
                await process.WaitForExitAsync(timeoutCts.Token);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                try { process.Kill(entireProcessTree: true); } catch { /* ignore */ }
                return ScanResult.Fail("Scan timed out.");
            }

            if (process.ExitCode != 0)
            {
                var detail = stderr.Length > 0 ? stderr.ToString().Trim() : stdout.ToString().Trim();
                var message = string.IsNullOrWhiteSpace(detail)
                    ? $"NAPS2 exited with code {process.ExitCode}."
                    : detail;
                return ScanResult.Fail(message);
            }

            if (!File.Exists(outputPath) || new FileInfo(outputPath).Length == 0)
                return ScanResult.Fail("NAPS2 did not produce a PDF file.");

            return ScanResult.Ok(outputPath);
        }
        catch (Exception ex)
        {
            TryDelete(outputPath);
            return ScanResult.Fail(ex.Message);
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
            // ignore
        }
    }
}

public sealed record ScanResult(bool Success, string? PdfPath, string? ErrorMessage)
{
    public static ScanResult Ok(string pdfPath) => new(true, pdfPath, null);
    public static ScanResult Fail(string message) => new(false, null, message);
}
