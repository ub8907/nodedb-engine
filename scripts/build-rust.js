#!/usr/bin/env node
/**
 * MiniDB-RS 统一跨平台自动构建与分发脚本 (Cross-Platform Rust Build Pipeline)
 * 
 * 核心功能：
 * 1. 跨平台统一目录：无论在 Linux 还是 Windows 下编译，产物均自动归档至标准目录：
 *    - rust/dist/win-x64/   (minidb.dll, minidb.lib, minidb-cli.exe)
 *    - rust/dist/linux-x64/ (libminidb.so, minidb-cli)
 * 2. 支持 Linux 下免切环境直接交叉编译 Windows 产物 (通过 mingw-w64 与 x86_64-pc-windows-gnu)。
 * 3. 自动检测编译环境与依赖，提供详细提示。
 * 
 * 使用方式：
 *   node scripts/build-rust.js              # 编译当前系统架构产物
 *   node scripts/build-rust.js --target all # 在 Linux 下同时编译 Linux 与 Windows 产物
 *   node scripts/build-rust.js --target win # 专门编译 Windows 产物 (Linux 交叉编译或 Win 原生)
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RUST_DIR = path.resolve(ROOT_DIR, 'rust');
const DIST_DIR = path.resolve(RUST_DIR, 'dist');

function run(cmd, args, cwd = RUST_DIR) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: true
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`Command failed with exit code ${res.status}`);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFileSafe(src, dst) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  ✓ 产物已归档: ${path.relative(ROOT_DIR, dst)} (${(fs.statSync(dst).size / 1024).toFixed(1)} KB)`);
    return true;
  }
  return false;
}

function buildLinux() {
  console.log('\n======================================================');
  console.log(' [1/2] 正在编译 Linux x86_64 产物 (libminidb.so + minidb-cli)...');
  console.log('======================================================');
  run('cargo', ['build', '--release', '--all-targets']);

  const outDir = path.join(DIST_DIR, 'linux-x64');
  ensureDir(outDir);

  const releaseDir = path.join(RUST_DIR, 'target', 'release');
  copyFileSafe(path.join(releaseDir, 'libminidb.so'), path.join(outDir, 'libminidb.so'));
  copyFileSafe(path.join(releaseDir, 'minidb-cli'), path.join(outDir, 'minidb-cli'));
  // 设置执行权限
  try {
    fs.chmodSync(path.join(outDir, 'minidb-cli'), 0o755);
  } catch {}
}

function buildWindows() {
  const isHostWindows = process.platform === 'win32';
  console.log('\n======================================================');
  console.log(` [2/2] 正在编译 Windows x86_64 产物 (minidb.dll + minidb-cli.exe)...`);
  console.log(` 当前编译宿主系统: ${isHostWindows ? 'Windows 原生' : 'Linux 交叉编译模式 (x86_64-pc-windows-gnu)'}`);
  console.log('======================================================');

  const outDir = path.join(DIST_DIR, 'win-x64');
  ensureDir(outDir);

  if (isHostWindows) {
    // Windows 原生构建
    run('cargo', ['build', '--release', '--all-targets']);
    const releaseDir = path.join(RUST_DIR, 'target', 'release');
    copyFileSafe(path.join(releaseDir, 'minidb.dll'), path.join(outDir, 'minidb.dll'));
    copyFileSafe(path.join(releaseDir, 'minidb.lib'), path.join(outDir, 'minidb.lib'));
    copyFileSafe(path.join(releaseDir, 'minidb-cli.exe'), path.join(outDir, 'minidb-cli.exe'));
  } else {
    // Linux 下免切换环境交叉编译 Windows
    console.log('提示: Linux 交叉编译 Windows 需要安装 mingw-w64 与 Rust Windows Target:');
    console.log('  1. rustup target add x86_64-pc-windows-gnu');
    console.log('  2. sudo apt-get install -y gcc-mingw-w64-x86-64\n');

    try {
      run('cargo', ['build', '--target', 'x86_64-pc-windows-gnu', '--release', '--all-targets']);
      const releaseDir = path.join(RUST_DIR, 'target', 'x86_64-pc-windows-gnu', 'release');
      copyFileSafe(path.join(releaseDir, 'minidb.dll'), path.join(outDir, 'minidb.dll'));
      copyFileSafe(path.join(releaseDir, 'libminidb.a'), path.join(outDir, 'minidb.lib'));
      copyFileSafe(path.join(releaseDir, 'minidb-cli.exe'), path.join(outDir, 'minidb-cli.exe'));
    } catch (err) {
      console.warn('⚠️ 交叉编译 Windows 未能成功执行，可能缺少 mingw-w64 或 target 未添加。');
      console.warn('   如需在 Linux 上构建 Windows EXE，请运行:');
      console.warn('   sudo apt update && sudo apt install -y mingw-w64 && rustup target add x86_64-pc-windows-gnu');
      return false;
    }
  }
  return true;
}

function main() {
  const args = process.argv.slice(2);
  let target = 'current';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) {
      target = args[i + 1];
    }
  }

  console.log('========================================================');
  console.log(' MiniDB-RS 统一跨平台编译管理器');
  console.log(` 目标架构模式: ${target.toUpperCase()}`);
  console.log(` 统一发布目录: ${DIST_DIR}`);
  console.log('========================================================');

  ensureDir(DIST_DIR);

  try {
    if (target === 'all') {
      buildLinux();
      buildWindows();
    } else if (target === 'win') {
      buildWindows();
    } else if (target === 'linux') {
      buildLinux();
    } else {
      // current
      if (process.platform === 'win32') {
        buildWindows();
      } else {
        buildLinux();
      }
    }

    console.log('\n========================================================');
    console.log('✓ 编译完成！统一发布目录结构如下:');
    console.log('  rust/dist/');
    if (fs.existsSync(path.join(DIST_DIR, 'win-x64'))) {
      console.log('  ├── win-x64/   -> minidb.dll, minidb-cli.exe');
    }
    if (fs.existsSync(path.join(DIST_DIR, 'linux-x64'))) {
      console.log('  └── linux-x64/ -> libminidb.so, minidb-cli');
    }
    console.log('========================================================');
  } catch (err) {
    console.error('\n❌ 编译出错:', err.message);
    process.exit(1);
  }
}

main();
