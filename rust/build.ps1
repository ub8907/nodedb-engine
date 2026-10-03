# MiniDB-RS Windows PowerShell 一键自动构建脚本
# 编译并输出到统一标准目录 rust/dist/win-x64/

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistWin = Join-Path $ScriptDir "dist\win-x64"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " MiniDB-RS Windows 原生自动构建流程" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path $DistWin)) {
    New-Item -ItemType Directory -Path $DistWin -Force | Out-Null
}

Write-Host ">> 正在编译 Windows 原生 Release 版本 (DLL + CLI)..." -ForegroundColor Yellow
cargo build --release --all-targets

$TargetRelease = Join-Path $ScriptDir "target\release"

Copy-Item (Join-Path $TargetRelease "minidb.dll") (Join-Path $DistWin "minidb.dll") -Force
Copy-Item (Join-Path $TargetRelease "minidb.lib") (Join-Path $DistWin "minidb.lib") -Force
Copy-Item (Join-Path $TargetRelease "minidb-cli.exe") (Join-Path $DistWin "minidb-cli.exe") -Force

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "✓ Windows 产物编译完成并已自动归档至:" -ForegroundColor Green
Write-Host "  rust\dist\win-x64\" -ForegroundColor Green
Write-Host "  - minidb.dll     (C-ABI 动态链接库)" -ForegroundColor White
Write-Host "  - minidb.lib     (导入符号库)" -ForegroundColor White
Write-Host "  - minidb-cli.exe (CLI 命令行独立执行工具)" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
