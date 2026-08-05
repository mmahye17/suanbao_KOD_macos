@echo off
setlocal
cd /d D:\kod
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "D:\kod\start-kod-dev.ps1"
exit /b %errorlevel%
