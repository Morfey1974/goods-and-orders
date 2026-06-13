@echo off
setlocal EnableExtensions

cd /d "%~dp0.."

title Perezapusk API

echo.
echo  ========================================
echo   Perezapusk API (Docker)
echo  ========================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
    echo ERROR - Docker not found. Install Docker Desktop.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR - Docker Engine is not running. Start Docker Desktop first.
    pause
    exit /b 1
)

echo Rebuilding and restarting API container...
docker compose up -d --build api
if errorlevel 1 (
    echo ERROR - docker compose failed.
    pause
    exit /b 1
)

echo Waiting for API 15 sec...
timeout /t 15 /nobreak >nul

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8080/api/health' -UseBasicParsing -TimeoutSec 5; Write-Host ('Health: HTTP ' + $r.StatusCode) } catch { Write-Host 'Health: not ready yet (wait a few seconds and refresh the app)' }"

echo.
echo  Done. Web and scan agent windows were not touched.
echo  API - http://localhost:8080
echo.
pause
