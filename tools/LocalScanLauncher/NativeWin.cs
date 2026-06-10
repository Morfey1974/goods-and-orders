using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace LocalScanLauncher;

internal static class NativeWin
{
    private const int AsfwAny = -1;

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool FlashWindow(IntPtr hWnd, bool bInvert);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool AllowSetForegroundWindow(int dwProcessId);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint attach, uint attachTo, bool attachFlag);

    public static void BringToForeground(IntPtr handle)
    {
        if (handle == IntPtr.Zero) return;

        var foreground = GetForegroundWindow();
        if (foreground != IntPtr.Zero && foreground != handle)
        {
            var fgThread = GetWindowThreadProcessId(foreground, out _);
            var currentThread = GetCurrentThreadId();
            if (fgThread != currentThread)
            {
                AttachThreadInput(currentThread, fgThread, true);
                SetForegroundWindow(handle);
                AttachThreadInput(currentThread, fgThread, false);
            }
        }

        AllowSetForegroundWindow(AsfwAny);
        FlashWindow(handle, true);
        SetForegroundWindow(handle);
    }

    public static IWin32Window? GetForegroundOwner()
    {
        var handle = GetForegroundWindow();
        return handle == IntPtr.Zero ? null : new Win32Window(handle);
    }
}

internal sealed class Win32Window(IntPtr handle) : IWin32Window
{
    public IntPtr Handle { get; } = handle;
}
