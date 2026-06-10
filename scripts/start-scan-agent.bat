@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0.."
set "ROOT=%CD%"

title Сканер — Учёт заказов

echo.
echo  LocalScanLauncher — http://127.0.0.1:9181
echo  LocalScanAgent    — http://127.0.0.1:9182 (запускается автоматически при сканировании)
echo  Профиль по умолчанию: A4, 300 dpi, PDF
echo  Настройки: tools\LocalScanLauncher\local-scan-launcher.json
echo.

where dotnet >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [Ошибка] .NET SDK не найден.
    pause
    exit /b 1
)

dotnet run --project "%ROOT%\tools\LocalScanLauncher\LocalScanLauncher.csproj"
pause
