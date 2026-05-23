@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-desktop-shortcuts.ps1"
echo.
echo Gotovo. Proverte yarlyki na rabochem stole.
pause
