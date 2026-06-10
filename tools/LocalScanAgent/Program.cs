using LocalScanAgent;

var config = AgentConfig.Load();
var scanner = new Naps2Scanner(config);
var server = new ScanHttpServer(config, scanner);

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

try
{
    await server.RunAsync(cts.Token);
}
catch (OperationCanceledException)
{
    // graceful shutdown
}
finally
{
    server.Stop();
}
