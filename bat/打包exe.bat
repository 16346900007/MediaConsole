@echo off
rem MediaConsole one-click exe packaging (wrapper for scripts\tauri\package-exe.ps1)
rem usage: this.bat [fast] [rebuild] [clean] [open] [nopause]  -- see ps1 header for details
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\tauri\package-exe.ps1" %*
exit /b %errorlevel%
