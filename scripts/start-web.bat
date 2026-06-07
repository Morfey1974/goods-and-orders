@echo off
setlocal EnableExtensions
title OrderWeb

cd /d "%~dp0..\src\order-management-web"
if not exist "package.json" (
    echo ERROR: frontend folder not found.
    echo %~dp0..\src\order-management-web
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found. Install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Free port 5173 if another dev server is stuck (PowerShell, ASCII-safe)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
echo  Web UI: http://localhost:5173
echo  Keep this window open while using the app.
echo.

npm run dev
if errorlevel 1 (
    echo.
    echo ERROR: npm run dev failed.
    pause
)
