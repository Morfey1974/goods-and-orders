@echo off
setlocal EnableExtensions

cd /d "%~dp0.."

echo Stopping old LocalScanLauncher...
powershell -NoProfile -Command "Get-Process -Name LocalScanLauncher -ErrorAction SilentlyContinue | Stop-Process -Force"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='dotnet.exe'\" | Where-Object { $_.CommandLine -like '*LocalScanLauncher*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

echo Starting LocalScanLauncher on port 9181...
start "LocalHelper" /MIN cmd /c call "%~dp0start-local-helper.bat"

timeout /t 3 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:9181/health' -UseBasicParsing -TimeoutSec 3).Content } catch { 'NOT RUNNING' }"

echo.
echo Done. Try the folder button again in Settings.
pause
