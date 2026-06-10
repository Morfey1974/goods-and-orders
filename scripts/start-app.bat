@echo off
setlocal EnableExtensions

cd /d "%~dp0.."
set "ROOT=%CD%"

title Zapusk - Uchet zakazov

echo.
echo  ========================================
echo   Uchet zakazov - zapusk
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

echo [1/4] Starting database and API...
docker compose up -d --build
if errorlevel 1 (
    echo ERROR - docker compose failed.
    pause
    exit /b 1
)

echo [2/4] Waiting for API 15 sec...
timeout /t 15 /nobreak >nul

echo [3/4] Starting local helper on port 9181...
start "LocalHelper" /MIN cmd /c call "%~dp0start-local-helper.bat"

echo [4/4] Starting web UI on port 5173...
start "OrderWeb" cmd /k call "%~dp0start-web.bat"

timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo  Done.
echo  Browser - localhost port 5173
echo  API     - localhost port 8080
echo.
echo  Keep the OrderWeb window open while using the app.
echo  Press any key to minimize this window.
echo.
pause >nul
