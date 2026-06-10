using LocalScanLauncher;

var config = LauncherConfig.Load();
var supervisor = new AgentSupervisor(config);
var server = new LauncherHttpServer(config, supervisor);

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
