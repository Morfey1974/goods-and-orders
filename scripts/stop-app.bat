@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0.."
cd /d "%ROOT%"

title Остановка — Учёт заказов

echo.
echo  Остановка Docker (база + API)...
docker compose down 2>nul

echo  Закройте окно "Учёт заказов — веб" вручную (Ctrl+C или крестик).
echo.
echo  Готово.
echo.
pause
