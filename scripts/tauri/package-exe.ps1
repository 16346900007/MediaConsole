<#
.SYNOPSIS
  MediaConsole 一键打包 EXE（Tauri 2 / NSIS）

.DESCRIPTION
  用法:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tauri\package-exe.ps1            完整打包
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tauri\package-exe.ps1 -Fast      仅编译 exe（跳过安装包）
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tauri\package-exe.ps1 -Rebuild   先重新构建 server+client 再打包
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tauri\package-exe.ps1 -Open      结束后自动打开产物所在文件夹
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tauri\package-exe.ps1 -NoPause   结束后不暂停（供脚本/CI 调用）
  也可以直接双击 `bat\打包exe.bat`。
#>
param(
  [switch]$Fast,      # 快速模式: 仅编译 exe, 跳过 NSIS 安装包
  [switch]$Rebuild,   # 先重新构建 server+client 再打包
  [switch]$Clean,     # 先清理 Rust 编译缓存 (cargo clean) 再打包, 项目移动目录后缓存失效时使用
  [switch]$Open,      # 结束后自动打开产物所在文件夹
  [switch]$NoPause    # 结束后不暂停
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

# 兼容「bat\打包exe.bat fast nopause」这类裸参数调用（bat 直接透传 %*）
foreach ($a in $args) {
  switch ($a.ToLower()) {
    'fast'    { $Fast = $true }
    'rebuild' { $Rebuild = $true }
    'clean'   { $Clean = $true }
    'open'    { $Open = $true }
    'nopause' { $NoPause = $true }
  }
}

function Fail($msg) {
  Write-Host ''
  Write-Host "[X] $msg" -ForegroundColor Red
  if (-not $NoPause) { Read-Host '按回车键退出...' }
  exit 1
}

Write-Host ''
Write-Host ' ==================================================' -ForegroundColor Cyan
Write-Host '    MediaConsole 一键打包 EXE (Tauri 2 / NSIS)' -ForegroundColor Cyan
Write-Host ' ==================================================' -ForegroundColor Cyan
Write-Host ''

# ---------- 1. 环境检查 ----------
Write-Host '[1/4] 检查环境依赖...'
$envChecks = @(
  @{ Name = 'node'  ; Cmd = 'node'  ; Hint = '请先安装 Node.js 22+ 并加入 PATH' },
  @{ Name = 'pnpm'  ; Cmd = 'pnpm'  ; Hint = '请执行: npm i -g pnpm' },
  @{ Name = 'rustc' ; Cmd = 'rustc' ; Hint = '请安装 Rust 工具链: https://rustup.rs' },
  @{ Name = 'cargo' ; Cmd = 'cargo' ; Hint = '请安装 Rust 工具链: https://rustup.rs' }
)
foreach ($e in $envChecks) {
  if (-not (Get-Command $e.Cmd -ErrorAction SilentlyContinue)) {
    Fail "缺少 $($e.Name): $($e.Hint)"
  }
}
if (-not (Test-Path "$root\node_modules")) { Fail '缺少根目录 node_modules, 请先执行: pnpm install' }
if (-not (Test-Path "$root\src-tauri\Cargo.toml")) { Fail '缺少 src-tauri 工程, 无法打包' }
Write-Host '[OK] 环境检查通过' -ForegroundColor Green
Write-Host ''

# ---------- 2. 构建 ----------
if ($Clean) {
  Write-Host '[0/4] 清理 Rust 编译缓存 (cargo clean)...'
  & cargo clean --manifest-path "$root\src-tauri\Cargo.toml"
  if ($LASTEXITCODE -ne 0) { Fail 'cargo clean 失败' }
  Write-Host ''
}
if ($Rebuild) {
  Write-Host '[0/4] 重新构建 server+client ...'
  $env:NODE_ENV = 'production'
  & npx nest build
  if ($LASTEXITCODE -ne 0) { Fail 'nest build 失败' }
  & npx vite build --config vite.config.ts
  if ($LASTEXITCODE -ne 0) { Fail 'vite build 失败' }
  Write-Host ''
} else {
  # 源码比上次构建新时给出提示（prepare.ps1 在产物存在时会跳过重建）
  $marker = "$root\dist\server\main.js"
  if (Test-Path $marker) {
    $markerTime = (Get-Item $marker).LastWriteTime
    $latest = Get-ChildItem -Path "$root\server", "$root\client\src", "$root\shared" -Recurse -File -ErrorAction SilentlyContinue |
              Where-Object { $_.LastWriteTime -gt $markerTime } |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) {
      Write-Host "[提示] 检测到源码更新: $($latest.FullName.Replace($root, ''))" -ForegroundColor Yellow
      Write-Host '      如需包含最新代码, 请加 -Rebuild 参数, 或先执行: pnpm run build:prod' -ForegroundColor Yellow
    }
  }
}

$mode = if ($Fast) { '快速模式: 仅编译 exe (跳过 NSIS 安装包)' } else { '完整模式: 编译 exe + NSIS 安装包 (首次约 5-15 分钟, 增量很快)' }
Write-Host "[2/4] $mode"
Write-Host ''
# tauri build 会自动执行 tauri.conf.json 的 beforeBuildCommand (scripts\tauri\prepare.ps1):
# 构建产物 -> 裁剪依赖 -> 暂存 dist-tauri/ -> 打 backend.tar -> 准备 node.exe
if ($Fast) {
  & npx tauri build --no-bundle
} else {
  & npx tauri build
}
if ($LASTEXITCODE -ne 0) { Fail 'tauri build 失败, 请查看上方错误信息 (常见: prepare.ps1 报错 / Rust 编译失败 / 磁盘空间不足)' }
Write-Host ''

# ---------- 3. 定位产物 ----------
Write-Host '[3/4] 定位产物...'
$dir = if ($Fast) { "$root\src-tauri\target\release" } else { "$root\src-tauri\target\release\bundle\nsis" }
$artifact = Get-ChildItem -Path $dir -Filter '*.exe' -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $artifact) { Fail "构建成功但未在 $dir 找到 exe 产物" }
Write-Host ''

# ---------- 4. 收集产物到根目录 dist-exe/（原 deep 路径保留，target 是构建缓存） ----------
$collectDir = "$root\dist-exe"
New-Item -ItemType Directory -Force -Path $collectDir | Out-Null
$collectedFiles = @()
function Collect-One($src) {
  if (-not (Test-Path $src)) { return }
  $name = Split-Path $src -Leaf
  try {
    Copy-Item $src -Destination $collectDir -Force -ErrorAction Stop
    $script:collectedFiles += $name
  } catch {
    # 目标被运行中的客户端占用时, 改为带时间戳的副本, 避免覆盖失败中断
    $alt = Join-Path $collectDir ($name -replace '\.exe$', ('-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.exe'))
    try {
      Copy-Item $src -Destination $alt -Force -ErrorAction Stop
      Write-Host "  [提示] $name 正被运行中的客户端占用, 已另存为 $([System.IO.Path]::GetFileName($alt))" -ForegroundColor Yellow
      $script:collectedFiles += [System.IO.Path]::GetFileName($alt)
    } catch {
      Write-Host "  [提示] $name 复制失败（可能被占用）: $($_.Exception.Message)" -ForegroundColor Yellow
      $script:collectedFiles += "$name (跳过)"
    }
  }
}
if ($Fast) {
  Collect-One $artifact
} else {
  Collect-One $artifact
  foreach ($cand in @('social-manager.exe', 'SocialManager.exe')) {
    $p = "$root\src-tauri\target\release\$cand"
    if (Test-Path $p) { Collect-One $p; break }
  }
}

# ---------- 5. 完成 ----------
Write-Host ' ==================================================' -ForegroundColor Green
Write-Host '   打包完成' -ForegroundColor Green
Write-Host ' ==================================================' -ForegroundColor Green
Write-Host ''
Write-Host "  安装包/程序 : $artifact"
if (-not $Fast) {
  $standalone = "$root\src-tauri\target\release\social-manager.exe"
  if (-not (Test-Path $standalone)) { $standalone = "$root\src-tauri\target\release\SocialManager.exe" }
  if (Test-Path $standalone) { Write-Host "  免安装 exe   : $standalone" }
}
Write-Host "  产物已收集到 : $collectDir  ($($collectedFiles -join ', '))"
Write-Host "  日志目录     : $env:APPDATA\SocialManager\logs"
Write-Host "  数据源提示   : 需在 %APPDATA%\SocialManager\env.local 配置 SUDA_DATABASE_URL"
Write-Host ''
if ($Open) {
  Start-Process explorer.exe -ArgumentList "/select,`"$artifact`""
}
if (-not $NoPause) { Read-Host '按回车键退出...' }
exit 0
