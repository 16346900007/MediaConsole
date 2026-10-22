@echo off
rem ============================================
rem  Social Manager - One-Click Start (v3, with auto-retry)
rem  0) kill stale processes (avoid port/handle conflict)
rem  1) start debug desktop client (backend sidecar on 55725)
rem  2) wait for backend ready (30s per round, up to 3 rounds)
rem  3) on final failure: echo backend log tail for diagnosis
rem  4) open publish center in browser
rem ============================================
chcp 65001 >nul
title Social Manager - Start All

set "APP=%~dp0..\src-tauri\target\debug\social-manager.exe"
set "RUNTIME=C:\Users\Administrator\AppData\Roaming\SocialManager\runtime\dist"
set "LOGFILE=C:\Users\Administrator\AppData\Roaming\SocialManager\logs\backend.log"

if not exist "%APP%" (
    echo [ERROR] debug client not found:
    echo   %APP%
    echo.
    echo Build it first with:  pnpm tauri:dev
    pause
    exit /b 1
)

set /a attempts=0

:retry
set /a attempts+=1
echo.
echo ===== Round %attempts% / 3 =====
echo [0/3] Killing stale SocialManager processes...
taskkill /F /IM social-manager.exe >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*SocialManager*' -or $_.CommandLine -like '*runtime\dist*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping -n 3 127.0.0.1 >nul

echo [1/3] Starting desktop client (backend sidecar on 127.0.0.1:55725)...
start "" /D "%RUNTIME%" "%APP%"

echo [2/3] Waiting for backend (30s round)...
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 30;$i++){ try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:55725/api/social/publish/tasks' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){ $ok=$true; break } } catch {}; Start-Sleep -Seconds 1 }; if($ok){ Write-Host ('[ok] backend ready after ' + ($i+1) + 's'); exit 0 } else { Write-Host '[fail] backend not ready in 30s'; exit 1 }"
if errorlevel 1 goto :round_fail

echo [3/3] Opening publish center in browser...
start "" "http://127.0.0.1:55725/publish"
echo.
echo All done. Desktop client window is open; browser at http://127.0.0.1:55725/publish
ping -n 4 127.0.0.1 >nul
exit /b 0

:round_fail
echo.
if %attempts% lss 3 (
    echo [retry] Round %attempts% failed, restarting...
    ping -n 4 127.0.0.1 >nul
    goto retry
)

echo.
echo [FAIL] Backend still not ready after %attempts% rounds. Errors from backend log:
echo --------------------------------------------------
if exist "%LOGFILE%" (
    powershell -NoProfile -Command "Get-Content '%LOGFILE%' -Tail 20 | ForEach-Object { Write-Host $_ }"
) else (
    echo (backend log not found: %LOGFILE%)
)
echo --------------------------------------------------
echo Possible causes: PostgreSQL (1Panel) not running / network blocked /
echo port 55725 occupied / debug client not built.
echo.
echo Opening publish center in browser anyway...
start "" "http://127.0.0.1:55725/publish"
echo Done (with errors above).
ping -n 4 127.0.0.1 >nul
exit /b 0
