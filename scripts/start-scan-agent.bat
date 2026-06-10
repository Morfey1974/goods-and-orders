@echo off
setlocal EnableExtensions

cd /d "%~dp0.."
set "ROOT=%CD%"

title LocalScanLauncher

echo.
echo  Local helper (port 9181) - backup folder picker + scan launcher
echo  Scan agent   (port 9182) - starts automatically when scanning
echo.
echo  Keep this window open while using the app.
echo.

where dotnet >nul 2>&1
if errorlevel 1 (
    echo ERROR - .NET SDK not found. Install from https://dotnet.microsoft.com/download
    pause
    exit /b 1
)

dotnet run --project "%ROOT%\tools\LocalScanLauncher\LocalScanLauncher.csproj"
pause
