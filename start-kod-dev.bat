@echo off
title KOD Dev
chcp 65001 >nul 2>&1

cd /d D:\kod

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] pnpm not found
    echo Install Node.js ^>=22.12 then run: npm install -g pnpm
    pause
    exit /b 1
)

echo.
echo ============================================
echo   KOD Dev Mode - Starting...
echo ============================================
echo.
echo   Dir : D:\kod
echo   Node: --max-old-space-size=4096
echo.
echo   Close this window to stop KOD
echo ============================================
echo.

set NODE_OPTIONS=--max-old-space-size=4096
call pnpm dev

if %errorlevel% neq 0 (
    echo.
    echo ============================================
    echo   KOD exited with error code: %errorlevel%
    echo ============================================
    pause
)
