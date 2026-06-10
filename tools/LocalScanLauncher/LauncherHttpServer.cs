using System.Net;
using System.Text;
using System.Text.Json;

namespace LocalScanLauncher;

public sealed class LauncherHttpServer(LauncherConfig config, AgentSupervisor supervisor)
{
    private readonly BackupMountConfigurator _backupMount = new();
    private readonly HttpListener _listener = new();
    private volatile bool _running;

    public void Start()
    {
        _listener.Prefixes.Clear();
        _listener.Prefixes.Add(config.ListenUrl);
        _listener.Start();
        _running = true;
        Console.WriteLine($"LocalScanLauncher listening on {config.ListenUrl}");
        Console.WriteLine($"Agent health: {config.AgentHealthUrl}");
    }

    public async Task RunAsync(CancellationToken ct)
    {
        Start();

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

    private async Task HandleRequestAsync(HttpListenerContext context)
    {
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
                var agentOk = await supervisor.IsAgentHealthyAsync();
                await WriteJsonAsync(response, 200, new { ok = true, agentRunning = agentOk });
                return;
            }

            if (path.Equals("/ensure", StringComparison.OrdinalIgnoreCase) &&
                (request.HttpMethod == "POST" || request.HttpMethod == "GET"))
            {
                try
                {
                    await supervisor.EnsureAgentRunningAsync();
                    await WriteJsonAsync(response, 200, new { ok = true, agentRunning = true });
                }
                catch (Exception ex)
                {
                    await WriteJsonAsync(response, 503, new { message = ex.Message });
                }

                return;
            }

            if (path.Equals("/pick-folder", StringComparison.OrdinalIgnoreCase) &&
                request.HttpMethod == "POST")
            {
                var ownerHandle = NativeWin.GetForegroundWindow();
                try
                {
                    var body = await ReadJsonBodyAsync<PickFolderRequest>(request);
                    Console.WriteLine("Opening Windows folder picker...");
                    var picked = FolderPicker.Pick(
                        body?.InitialPath,
                        body?.Description ?? "Vyberite papku dlya rezervnyh kopij",
                        ownerHandle);
                    if (string.IsNullOrWhiteSpace(picked))
                    {
                        await WriteJsonAsync(response, 200, new { cancelled = true });
                        return;
                    }

                    await WriteJsonAsync(response, 200, new { cancelled = false, path = picked });
                }
                catch (Exception ex)
                {
                    await WriteJsonAsync(response, 500, new { message = ex.Message });
                }

                return;
            }

            if (path.Equals("/apply-backup-path", StringComparison.OrdinalIgnoreCase) &&
                request.HttpMethod == "POST")
            {
                try
                {
                    var body = await ReadJsonBodyAsync<ApplyBackupPathRequest>(request);
                    if (string.IsNullOrWhiteSpace(body?.Path))
                    {
                        await WriteJsonAsync(response, 400, new { message = "Path is required." });
                        return;
                    }

                    _backupMount.Apply(body.Path);
                    await WriteJsonAsync(response, 200, new { ok = true, path = body.Path.Trim() });
                }
                catch (Exception ex)
                {
                    await WriteJsonAsync(response, 500, new { message = ex.Message });
                }

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

    private void WriteCors(HttpListenerResponse response, string? origin)
    {
        var allowed = config.AllowedOrigins ?? [];
        if (!string.IsNullOrEmpty(origin) &&
            allowed.Any(o => string.Equals(o, origin, StringComparison.OrdinalIgnoreCase)))
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

    private static async Task<T?> ReadJsonBodyAsync<T>(HttpListenerRequest request)
    {
        using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
        var json = await reader.ReadToEndAsync();
        if (string.IsNullOrWhiteSpace(json))
            return default;

        return JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        });
    }

    private sealed record PickFolderRequest(string? InitialPath, string? Description);
    private sealed record ApplyBackupPathRequest(string? Path);
}
