@echo off
setlocal EnableExtensions
title OrderWeb

cd /d "%~dp0..\src\order-management-web"
if not exist "package.json" (
    echo ERROR - frontend folder not found.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR - npm not found. Install Node.js 20 or newer.
    pause
    exit /b 1
)

powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
echo  Web UI on port 5173
echo  Keep this window open while using the app.
echo.

powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:9181/health' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { 0 }" | findstr /x "200" >nul 2>&1
if errorlevel 1 (
    echo  Starting local helper on port 9181...
    start "LocalHelper" /MIN cmd /c call "%~dp0start-local-helper.bat"
    timeout /t 3 /nobreak >nul
)

npm run dev
if errorlevel 1 (
    echo.
    echo ERROR - npm run dev failed.
    pause
)
