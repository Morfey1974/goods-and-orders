using System.Net;
using System.Text;
using System.Text.Json;

namespace LocalScanAgent;

public sealed class ScanHttpServer(AgentConfig config, Naps2Scanner scanner)
{
    private readonly HttpListener _listener = new();
    private readonly SemaphoreSlim _scanLock = new(1, 1);
    private DateTime _lastActivityUtc = DateTime.UtcNow;
    private volatile bool _running;

    public void Start()
    {
        _listener.Prefixes.Clear();
        _listener.Prefixes.Add(config.ListenUrl);
        _listener.Start();
        _running = true;
        Console.WriteLine($"LocalScanAgent listening on {config.ListenUrl}");
        Console.WriteLine($"Profile: {config.ProfileName}");
        if (scanner.TryResolveConsolePath())
            Console.WriteLine($"NAPS2: {scanner.ResolvedConsolePath}");
        else
            Console.WriteLine("NAPS2: not found (install NAPS2 or set Naps2ConsolePath)");
    }

    public async Task RunAsync(CancellationToken ct)
    {
        Start();
        _ = Task.Run(() => IdleWatchAsync(ct), ct);

        while (_running && !ct.IsCancellationRequested)
        {
            HttpListenerContext context;
            try
            {
                context = await _listener.GetContextAsync().WaitAsync(ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (HttpListenerException) when (ct.IsCancellationRequested || !_running)
            {
                break;
            }

            _ = Task.Run(() => HandleRequestAsync(context), ct);
        }
    }

    public void Stop()
    {
        _running = false;
        try { _listener.Stop(); } catch { /* ignore */ }
        try { _listener.Close(); } catch { /* ignore */ }
    }

    private async Task IdleWatchAsync(CancellationToken ct)
    {
        if (config.IdleExitMinutes <= 0)
            return;

        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            var idleFor = DateTime.UtcNow - _lastActivityUtc;
            if (idleFor >= TimeSpan.FromMinutes(config.IdleExitMinutes))
            {
                Console.WriteLine($"Idle for {config.IdleExitMinutes} min — exiting.");
                Stop();
                Environment.Exit(0);
            }
        }
    }

    private void Touch() => _lastActivityUtc = DateTime.UtcNow;

    private async Task HandleRequestAsync(HttpListenerContext context)
    {
        Touch();
        var request = context.Request;
        var response = context.Response;

        try
        {
            var origin = request.Headers["Origin"];
            if (request.HttpMethod == "OPTIONS")
            {
                WriteCors(response, origin);
                response.StatusCode = 204;
                response.Close();
                return;
            }

            WriteCors(response, origin);

            var path = request.Url?.AbsolutePath.TrimEnd('/') ?? "";
            if (path.Equals("/health", StringComparison.OrdinalIgnoreCase))
            {
                await WriteJsonAsync(response, 200, new
                {
                    ok = true,
                    profile = config.ProfileName,
                    naps2Found = scanner.TryResolveConsolePath(),
                    naps2Path = scanner.ResolvedConsolePath,
                });
                return;
            }

            if (path.Equals("/scan", StringComparison.OrdinalIgnoreCase) &&
                (request.HttpMethod == "POST" || request.HttpMethod == "GET"))
            {
                await HandleScanAsync(response);
                return;
            }

            await WriteJsonAsync(response, 404, new { message = "Not found." });
        }
        catch (Exception ex)
        {
            try
            {
                await WriteJsonAsync(response, 500, new { message = ex.Message });
            }
            catch
            {
                // ignore
            }
        }
    }

    private async Task HandleScanAsync(HttpListenerResponse response)
    {
        if (!scanner.TryResolveConsolePath())
        {
            await WriteJsonAsync(response, 503, new
            {
                message = "NAPS2.Console.exe not found. Install NAPS2 or set Naps2ConsolePath in local-scan-agent.json.",
            });
            return;
        }

        if (!await _scanLock.WaitAsync(0))
        {
            await WriteJsonAsync(response, 409, new { message = "Scan already in progress." });
            return;
        }

        string? pdfPath = null;
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(Math.Max(30, config.ScanTimeoutSeconds)));
            var result = await scanner.ScanToPdfAsync(cts.Token);
            if (!result.Success || string.IsNullOrEmpty(result.PdfPath))
            {
                await WriteJsonAsync(response, 500, new { message = result.ErrorMessage ?? "Scan failed." });
                return;
            }

            pdfPath = result.PdfPath;
            var bytes = await File.ReadAllBytesAsync(pdfPath);
            var fileName = $"scan_{DateTime.Now:yyyy-MM-dd_HHmmss}.pdf";

            response.StatusCode = 200;
            response.ContentType = "application/pdf";
            response.Headers.Add("Content-Disposition", $"attachment; filename=\"{fileName}\"");
            response.ContentLength64 = bytes.Length;
            await response.OutputStream.WriteAsync(bytes);
            response.Close();
        }
        finally
        {
            _scanLock.Release();
            if (pdfPath != null)
            {
                try { File.Delete(pdfPath); } catch { /* ignore */ }
            }
        }
    }

    private void WriteCors(HttpListenerResponse response, string? origin)
    {
        var allowed = config.AllowedOrigins ?? [];
        if (!string.IsNullOrEmpty(origin) && allowed.Any(o => string.Equals(o, origin, StringComparison.OrdinalIgnoreCase)))
            response.Headers["Access-Control-Allow-Origin"] = origin;
        else if (allowed.Length == 0)
            response.Headers["Access-Control-Allow-Origin"] = "*";

        response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
        response.Headers["Access-Control-Max-Age"] = "86400";
    }

    private static async Task WriteJsonAsync(HttpListenerResponse response, int statusCode, object body)
    {
        var json = JsonSerializer.Serialize(body);
        var bytes = Encoding.UTF8.GetBytes(json);
        response.StatusCode = statusCode;
        response.ContentType = "application/json; charset=utf-8";
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes);
        response.Close();
    }
}
