@echo off
chcp 65001 >nul
title Учёт заказов — веб

cd /d "%~dp0..\src\order-management-web"
if not exist "package.json" (
    echo [Ошибка] Не найдена папка фронтенда:
    echo %~dp0..\src\order-management-web
    pause
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [Ошибка] Node.js не установлен. Скачайте с https://nodejs.org
    pause
    exit /b 1
)

echo Запуск веб-интерфейса...
echo Адрес: http://localhost:5173
echo.
npm run dev
