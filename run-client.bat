@echo off
rem quick run: start release client
set "APP=%~dp0src-tauri\target\release\social-manager.exe"
if not exist "%APP%" (
    echo [ERROR] release client not found, run build-installer.bat first.
    pause
    exit /b 1
)
echo [Start] SocialManager release client...
start "" "%APP%"
echo started; first launch extracts backend, about 1-3 min.
exit /b 0
