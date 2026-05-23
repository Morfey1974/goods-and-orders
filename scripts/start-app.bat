@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0.."
set "ROOT=%CD%"

title Запуск — Учёт заказов

echo.
echo  ========================================
echo   Учёт заказов — запуск
echo  ========================================
echo.

where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [Ошибка] Docker не найден. Установите Docker Desktop.
    pause
    exit /b 1
)

docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [Ошибка] Docker Engine не запущен.
    echo        Откройте Docker Desktop и дождитесь Engine running.
    pause
    exit /b 1
)

echo [1/3] Запуск базы данных и API...
docker compose up -d --build
if %ERRORLEVEL% NEQ 0 (
    echo [Ошибка] Не удалось запустить docker compose.
    pause
    exit /b 1
)

echo [2/3] Ожидание API (15 сек)...
timeout /t 15 /nobreak >nul

echo [3/3] Запуск веб-интерфейса...
start "OrderWeb" cmd /k call "%~dp0start-web.bat"

timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo  Готово.
echo  - Браузер: http://localhost:5173
echo  - API:     http://localhost:8080/swagger
echo.
echo  НЕ ЗАКРЫВАЙТЕ окно "OrderWeb" / "Учёт заказов - веб" - там сайт.
echo  Это окно можно свернуть. Закрыть - ярлык Ostanovit.
echo.
echo  Нажмите любую клавишу здесь, чтобы свернуть это окно (сайт продолжит работать).
pause >nul
