#!/usr/bin/env bash
# ==============================================================================
# MiniDB-RS Linux & 交叉编译 Windows 一键自动化脚本
# 支持在 Linux 下直接编译出：
# 1. Linux 产物 (libminidb.so + minidb-cli) -> rust/dist/linux-x64/
# 2. Windows 产物 (minidb.dll + minidb-cli.exe) -> rust/dist/win-x64/
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"

mkdir -p "${DIST_DIR}/linux-x64"
mkdir -p "${DIST_DIR}/win-x64"

echo "=========================================================="
echo " MiniDB-RS 统一跨平台自动构建流程"
echo "=========================================================="

# 1. 编译 Linux 原生版本
echo ">> [1/2] 正在编译 Linux 原生版本..."
cargo build --release --all-targets

cp -f "${SCRIPT_DIR}/target/release/libminidb.so" "${DIST_DIR}/linux-x64/" 2>/dev/null || true
cp -f "${SCRIPT_DIR}/target/release/minidb-cli" "${DIST_DIR}/linux-x64/" 2>/dev/null || true
chmod +x "${DIST_DIR}/linux-x64/minidb-cli" 2>/dev/null || true
echo "  ✓ Linux 产物已整理至: rust/dist/linux-x64/"

# 2. 检查并交叉编译 Windows 版本
if [ "$1" == "--all" ] || [ "$1" == "--win" ]; then
    echo ">> [2/2] 正在交叉编译 Windows x86_64 版本 (MinGW)..."
    if ! rustup target list | grep -q "x86_64-pc-windows-gnu (installed)"; then
        echo "   正在自动安装 Rust Windows Target..."
        rustup target add x86_64-pc-windows-gnu
    fi

    cargo build --target x86_64-pc-windows-gnu --release --all-targets

    cp -f "${SCRIPT_DIR}/target/x86_64-pc-windows-gnu/release/minidb.dll" "${DIST_DIR}/win-x64/" 2>/dev/null || true
    cp -f "${SCRIPT_DIR}/target/x86_64-pc-windows-gnu/release/libminidb.a" "${DIST_DIR}/win-x64/minidb.lib" 2>/dev/null || true
    cp -f "${SCRIPT_DIR}/target/x86_64-pc-windows-gnu/release/minidb-cli.exe" "${DIST_DIR}/win-x64/" 2>/dev/null || true
    echo "  ✓ Windows 产物已整理至: rust/dist/win-x64/"
fi

echo "=========================================================="
echo "✓ 全部构建完成！统一目录输出如下:"
echo "  rust/dist/"
echo "  ├── linux-x64/ -> libminidb.so, minidb-cli"
echo "  └── win-x64/   -> minidb.dll, minidb.lib, minidb-cli.exe"
echo "=========================================================="
