@echo off
title ADB Bullet - Launcher

set "ROOT=%~dp0"

echo ==========================================
echo   ADB BULLET - Iniciando Framework
echo ==========================================
echo.

where adb >nul 2>nul
if errorlevel 1 (
    echo [AVISO] adb nao encontrado no PATH. Verifique seu Android SDK.
    echo.
)

echo [1/2] Subindo backend em http://127.0.0.1:8000 ...
start "ADB Bullet - API" cmd /k "cd /d "%ROOT%" & py -3 api.py"

timeout /t 2 /nobreak >nul

echo [2/2] Subindo frontend em http://localhost:5173 ...
start "ADB Bullet - Frontend" cmd /k "cd /d "%ROOT%frontend" & npm run dev"

echo.
echo ==========================================
echo   Tudo iniciado. Duas janelas foram abertas:
echo     API:      http://127.0.0.1:8000/docs
echo     Frontend: http://localhost:5173
echo ==========================================
echo.
pause
