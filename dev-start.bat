@echo off
rem ============================================
rem  Social Manager - Desktop Client Launcher
rem  Double-click to open the Win desktop client.
rem  Backend sidecar auto-starts on port 55725.
rem ============================================
chcp 65001 >nul
title Social Manager - Client

set "APP=%~dp0src-tauri\target\debug\social-manager.exe"

if not exist "%APP%" (
    echo [ERROR] Debug client not found.
    echo Build it first with:  pnpm tauri:dev
    pause
    exit /b 1
)

echo Starting SocialManager desktop client ...
echo Backend sidecar listens on 127.0.0.1:55725. First launch takes a few seconds.
start "" "%APP%"
timeout /t 3 >nul
