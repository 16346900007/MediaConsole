@echo off
rem quick build: prepare -^> release + NSIS installer
cd /d "%~dp0"

echo [1/2] preparing resources...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\tauri\prepare.ps1"
if errorlevel 1 goto :err

echo [2/2] building release + NSIS (about 6-10 min)...
set "NODE_ENV=production"
call npx tauri build
if errorlevel 1 goto :err

echo.
echo ============ BUILD DONE ============
echo installer: src-tauri\target\release\bundle\nsis\SocialManager_2.3.0_x64-setup.exe
echo ==================================
pause
exit /b 0
:err
echo [ERROR] build failed, check log above.
pause
exit /b 1
