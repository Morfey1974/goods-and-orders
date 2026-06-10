@echo off
setlocal EnableExtensions

cd /d "%~dp0.."
set "ROOT=%CD%"

where dotnet >nul 2>&1
if errorlevel 1 exit /b 1

dotnet run --project "%ROOT%\tools\LocalScanLauncher\LocalScanLauncher.csproj"
