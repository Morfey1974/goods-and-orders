namespace LocalScanLauncher;

internal static class FolderPicker
{
    public static string? Pick(string? initialPath, string description, IntPtr ownerHandle = default)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Folder picker is only available on Windows.");

        string? result = null;
        Exception? threadError = null;

        var thread = new Thread(() =>
        {
            try
            {
                result = PickOnStaThread(initialPath, description, ownerHandle);
            }
            catch (Exception ex)
            {
                threadError = ex;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();

        if (threadError != null)
            throw threadError;

        return result;
    }

    private static string? PickOnStaThread(string? initialPath, string description, IntPtr ownerHandle)
    {
        System.Windows.Forms.Application.EnableVisualStyles();

        IWin32Window? owner = ownerHandle != IntPtr.Zero
            ? new Win32Window(ownerHandle)
            : NativeWin.GetForegroundOwner();

        using var dialog = new System.Windows.Forms.FolderBrowserDialog
        {
            Description = description,
            UseDescriptionForTitle = true,
            ShowNewFolderButton = true,
        };

        ApplyInitialDirectory(dialog, initialPath);

        var dialogResult = owner is null
            ? dialog.ShowDialog()
            : dialog.ShowDialog(owner);

        return dialogResult == System.Windows.Forms.DialogResult.OK
            ? dialog.SelectedPath
            : null;
    }

    private static void ApplyInitialDirectory(System.Windows.Forms.FolderBrowserDialog dialog, string? initialPath)
    {
        if (string.IsNullOrWhiteSpace(initialPath)) return;

        var dir = initialPath.Trim();
        if (dir.StartsWith("./", StringComparison.Ordinal) || dir.StartsWith(".\\", StringComparison.Ordinal))
        {
            try
            {
                dir = Path.GetFullPath(Path.Combine(RepoRoot.Find(), dir.TrimStart('.', '/', '\\')));
            }
            catch
            {
                return;
            }
        }

        if (Directory.Exists(dir))
            dialog.InitialDirectory = dir;
        else
        {
            var parent = Path.GetDirectoryName(dir);
            if (!string.IsNullOrEmpty(parent) && Directory.Exists(parent))
                dialog.InitialDirectory = parent;
        }
    }
}
