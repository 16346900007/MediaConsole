param(
  [switch]$SkipBuild,
  [switch]$SkipPrune
)
# SocialManager Tauri packaging prepare script.
# 1) Build server+client if artifacts missing  2) prune runtime deps  3) normalize dist layout
# 4) stage into dist-tauri/ and pack the backend into a single backend.tar
# (resources are bundled into the client via tauri.conf.json; a single archive avoids
#  tauri-build stack overflow with 100k+ individual files and keeps the installer lean)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

# ---------- 1. build (skip allowed; forced when artifacts missing) ----------
if (-not $SkipBuild) {
  $needBuild = -not (Test-Path "$root\dist\server\main.js") -or -not (Test-Path "$root\dist\client\assets")
  if ($needBuild) {
    Write-Host '[prepare] building server (nest build)...'
    $env:NODE_ENV = 'production'
    npx nest build
    if ($LASTEXITCODE -ne 0) { throw 'server build failed' }
    Write-Host '[prepare] building client (vite build)...'
    npx vite build --config vite.config.ts
    if ($LASTEXITCODE -ne 0) { throw 'client build failed' }
  } else {
    Write-Host '[prepare] dist artifacts exist, skip build (run npm run build:prod for incremental builds)'
  }
}

# ---------- 2. prune runtime dependencies ----------
if (-not $SkipPrune) {
  if (-not (Test-Path "$root\dist\node_modules")) {
    Write-Host '[prepare] pruning runtime dependencies (prune-smart)...'
    node "$root\scripts\prune-smart.js"
    if ($LASTEXITCODE -ne 0) { throw 'dependency pruning failed' }
  } else {
    Write-Host '[prepare] dist\node_modules exists, skip pruning'
  }
}

# ---------- 3. normalize dist layout: dist/dist/client/{index.html,assets,...} ----------
# In production the server starts with cwd=dist; both the HBS views dir and the static
# assets middleware resolve to <cwd>/dist/client.
$clientRoot = "$root\dist\client"
$clientOut = "$root\dist\dist\client"
New-Item -ItemType Directory -Force -Path $clientOut | Out-Null
if (Test-Path "$clientRoot\assets") { Copy-Item "$clientRoot\assets" -Destination $clientOut -Recurse -Force }
foreach ($f in @('favicon.svg', 'routes.json')) {
  if (Test-Path "$clientRoot\$f") { Copy-Item "$clientRoot\$f" -Destination $clientOut -Force }
}
$html = $null
if (Test-Path "$clientRoot\index.html") { $html = "$clientRoot\index.html" }
elseif (Test-Path "$clientRoot\client\index.html") { $html = "$clientRoot\client\index.html" }
if ($null -eq $html) { throw 'client/index.html not found; build the frontend first' }
Copy-Item $html -Destination "$clientOut\index.html" -Force
if (Test-Path "$root\client\public") { Copy-Item "$root\client\public\*" -Destination $clientOut -Recurse -Force }

# ---------- 4. stage dist-tauri (filtered, no .map/.d.ts which are useless at runtime) ----------
$stage = "$root\dist-tauri"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path "$stage" | Out-Null
New-Item -ItemType Directory -Path "$stage\dist" | Out-Null

# robocopy: /E recurse, /XF exclude files, /NFL /NDL /NJH /NJS quiet-ish (exit codes 0-7 = success)
& robocopy "$root\dist\server" "$stage\dist\server" /E /XF *.map *.d.ts /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -gt 7) { throw "robocopy server failed (exit $LASTEXITCODE)" }
if (Test-Path "$root\dist\shared") {
  & robocopy "$root\dist\shared" "$stage\dist\shared" /E /XF *.map *.d.ts /NFL /NDL /NJH /NJS
  if ($LASTEXITCODE -gt 7) { throw "robocopy shared failed (exit $LASTEXITCODE)" }
}
& robocopy "$root\dist\node_modules" "$stage\dist\node_modules" /E /XF *.map *.d.ts /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -gt 7) { throw "robocopy node_modules failed (exit $LASTEXITCODE)" }
if (Test-Path "$root\dist\package.json") { Copy-Item "$root\dist\package.json" -Destination "$stage\dist\package.json" }
& robocopy "$root\dist\dist" "$stage\dist\dist" /E /XF *.map /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -gt 7) { throw "robocopy client failed (exit $LASTEXITCODE)" }

# DB init assets (idempotent; executed by the client before starting the backend)
New-Item -ItemType Directory -Force -Path "$stage\dist\db" | Out-Null
Copy-Item "$root\db\init.sql" -Destination "$stage\dist\db\init.sql"
Copy-Item "$PSScriptRoot\init-db.js" -Destination "$stage\dist\init-db.js"

# ---------- 5. pack backend into a single tar (extracted to %APPDATA% on first launch) ----------
Write-Host '[prepare] packing backend.tar...'
& tar.exe -cf "$stage\backend.tar" -C "$stage" dist
if ($LASTEXITCODE -ne 0) { throw 'tar packing failed' }
$tarSize = (Get-Item "$stage\backend.tar").Length
Remove-Item "$stage\dist" -Recurse -Force
Write-Host "[prepare] backend.tar = $([math]::Round($tarSize / 1MB, 1)) MB"

# ---------- 6. Node runtime ----------
New-Item -ItemType Directory -Force -Path "$stage\node" | Out-Null
& "$PSScriptRoot\fetch-node.ps1" -OutDir "$stage\node"

$sizeMB = [math]::Round((Get-ChildItem $stage -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "[prepare] done: $stage (total $sizeMB MB)"
