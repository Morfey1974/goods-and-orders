using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;

namespace LocalScanLauncher;

internal sealed class BackupMountConfigurator
{
    public void Apply(string hostPath)
    {
        if (string.IsNullOrWhiteSpace(hostPath))
            throw new ArgumentException("Backup path is required.");

        var normalized = Path.GetFullPath(hostPath.Trim());
        Directory.CreateDirectory(normalized);

        var repoRoot = RepoRoot.Find();
        UpdateEnvFile(Path.Combine(repoRoot, ".env"), normalized);
        RestartApiContainer(repoRoot);
    }

    private static void UpdateEnvFile(string envPath, string backupPath)
    {
        List<string> lines;
        if (File.Exists(envPath))
            lines = File.ReadAllLines(envPath, Encoding.UTF8).ToList();
        else
        {
            var examplePath = Path.Combine(Path.GetDirectoryName(envPath)!, ".env.example");
            lines = File.Exists(examplePath)
                ? File.ReadAllLines(examplePath, Encoding.UTF8).ToList()
                : [];
        }

        var dockerPath = backupPath.Replace('\\', '/');
        var newLine = dockerPath.Contains(' ')
            ? $"BACKUP_HOST_PATH=\"{dockerPath}\""
            : $"BACKUP_HOST_PATH={dockerPath}";
        var pattern = new Regex("^BACKUP_HOST_PATH=", RegexOptions.IgnoreCase);

        var index = lines.FindIndex(l => pattern.IsMatch(l.Trim()));
        if (index >= 0)
            lines[index] = newLine;
        else
            lines.Add(newLine);

        File.WriteAllLines(envPath, lines, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
    }

    private static void RestartApiContainer(string repoRoot)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "docker",
            Arguments = "compose up -d api",
            WorkingDirectory = repoRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
        };

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to start docker compose.");

        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            var detail = (stderr + "\n" + stdout).Trim();
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(detail)
                    ? $"docker compose exited with code {process.ExitCode}."
                    : detail);
        }
    }
}
