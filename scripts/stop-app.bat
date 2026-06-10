@echo off
setlocal EnableExtensions

cd /d "%~dp0.."

title Ostanovit - Uchet zakazov

echo.
echo  Stopping Docker database and API...
docker compose down 2>nul

echo  Close the OrderWeb window manually if it is still open.
echo.
echo  Done.
echo.
pause
