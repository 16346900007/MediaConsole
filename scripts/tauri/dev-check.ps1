param(
  [switch]$SkipBuild
)
# 幂等资源检查：backend.tar 与 node.exe 齐备则跳过全量 prepare。
# 用途：tauri dev 的 beforeDevCommand——避免每次 dev 都全量重建 dist-tauri
# （全量重建需 3~4 分钟且会与 cargo 的资源检查形成时序竞争）。
# 手动更新产物时：powershell -File scripts\tauri\prepare.ps1 -SkipBuild
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tar = "$root\dist-tauri\backend.tar"
$node = "$root\dist-tauri\node\node.exe"
if ((Test-Path $tar) -and (Test-Path $node)) {
  $sizeMB = [math]::Round((Get-Item $tar).Length / 1MB, 1)
  Write-Host "[dev] 资源已就绪 (backend.tar ${sizeMB} MB + node.exe)，跳过 prepare"
  exit 0
}
Write-Host "[dev] 资源缺失（backend.tar / node.exe），执行 prepare -SkipBuild..."
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\prepare.ps1" -SkipBuild
exit $LASTEXITCODE
