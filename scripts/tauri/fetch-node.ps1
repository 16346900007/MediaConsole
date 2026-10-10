param(
  [Parameter(Mandatory = $true)][string]$OutDir
)
# Fetch the Node.js runtime (win-x64 zip) for bundling into the client.
# Downloads to build-tools/ cache; falls back to the local node.exe if all downloads fail.
$ErrorActionPreference = 'Stop'
$ver = if ($env:TAURI_NODE_VERSION) { $env:TAURI_NODE_VERSION } else { 'v22.23.2' }
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cacheRoot = Join-Path $root 'build-tools'
$cacheZip = Join-Path $cacheRoot "node-$ver-win-x64.zip"
$cacheDir = Join-Path $cacheRoot "node-$ver-win-x64"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if (Test-Path (Join-Path $cacheDir 'node.exe')) {
  Copy-Item (Join-Path $cacheDir 'node.exe') -Destination (Join-Path $OutDir 'node.exe') -Force
  Write-Host "[node] using cache: $cacheDir"
  exit 0
}

New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
$ok = $false
$url1 = "https://npmmirror.com/mirrors/node/$ver/node-$ver-win-x64.zip"
Write-Host "[node] downloading $url1"
try {
  if (Test-Path $cacheZip) { Remove-Item $cacheZip -Force }
  Invoke-WebRequest -Uri $url1 -OutFile $cacheZip -UseBasicParsing
  if ((Get-Item $cacheZip).Length -gt 10MB) { $ok = $true }
} catch {
  Write-Warning "npmmirror download failed: $($_.Exception.Message)"
}
if (-not $ok) {
  $url2 = "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip"
  Write-Host "[node] fallback to official source $url2"
  try {
    & curl.exe -L -o $cacheZip $url2 2>$null
    if ($LASTEXITCODE -eq 0 -and (Get-Item $cacheZip).Length -gt 10MB) { $ok = $true }
  } catch {
    Write-Warning "official download failed: $($_.Exception.Message)"
  }
}
if (-not $ok) {
  Write-Warning '[node] download failed; falling back to the local node.exe (dev only - re-run prepare with network for a proper bundle)'
  $local = (Get-Command node).Source
  if (-not $local) { throw 'no local node found' }
  Copy-Item $local -Destination (Join-Path $OutDir 'node.exe') -Force
  Write-Host "[node] copied local node: $local"
  exit 0
}
Expand-Archive -Path $cacheZip -DestinationPath $cacheDir -Force
# The official zip nests node.exe under a versioned top-level folder; normalize it to $cacheDir\node.exe
$found = Get-ChildItem $cacheDir -Recurse -Filter node.exe | Select-Object -First 1
if (-not $found) { throw 'node.exe not found in extracted archive' }
Copy-Item $found.FullName -Destination (Join-Path $cacheDir 'node.exe') -Force
Copy-Item (Join-Path $cacheDir 'node.exe') -Destination (Join-Path $OutDir 'node.exe') -Force
Write-Host "[node] done: node-$ver-win-x64"
