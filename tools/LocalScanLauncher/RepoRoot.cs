namespace LocalScanLauncher;

internal static class RepoRoot
{
    public static string Find()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "docker-compose.yml")) ||
                Directory.Exists(Path.Combine(dir.FullName, "tools", "LocalScanAgent")))
                return dir.FullName;
            dir = dir.Parent;
        }

        throw new InvalidOperationException("Cannot find repository root (docker-compose.yml).");
    }
}
