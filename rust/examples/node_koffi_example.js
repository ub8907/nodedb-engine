/**
 * Node.js 通过 C-FFI (koffi / ffi-napi) 调用 Rust MiniDB 示例
 * 
 * 安装依赖: npm install koffi
 * 运行: node node_koffi_example.js
 */

import koffi from 'koffi';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. 定位编译生成的动态链接库 (.so / .dylib / .dll)
const libPath = process.platform === 'win32'
  ? path.resolve(__dirname, '../target/release/minidb.dll')
  : process.platform === 'darwin'
    ? path.resolve(__dirname, '../target/release/libminidb.dylib')
    : path.resolve(__dirname, '../target/release/libminidb.so');

console.log(`正在加载 Rust 动态链接库: ${libPath}`);
const lib = koffi.load(libPath);

// 2. 声明 C-ABI 函数签名
const MiniDBHandle = koffi.opaque('MiniDBHandle');

const minidb_open = lib.func('minidb_open', MiniDBHandle, ['string']);
const minidb_insert_batch = lib.func('minidb_insert_batch', 'int', [MiniDBHandle, 'string', koffi.out(koffi.pointer('uint64'))]);
const minidb_find_by_pk = lib.func('minidb_find_by_pk', 'int', [MiniDBHandle, 'uint64', koffi.out(koffi.pointer('char')), 'size_t']);
const minidb_query_paged = lib.func('minidb_query_paged', 'int', [MiniDBHandle, 'uint64', 'uint64', koffi.out(koffi.pointer('char')), 'size_t']);
const minidb_get_stats = lib.func('minidb_get_stats', 'int', [MiniDBHandle, koffi.out(koffi.pointer('char')), 'size_t']);
const minidb_close = lib.func('minidb_close', 'void', [MiniDBHandle]);

// 3. 面向对象的友好封装包装类
export class MiniDB {
  constructor(dbPath) {
    this.handle = minidb_open(dbPath);
    if (!this.handle) {
      throw new Error(`无法打开或创建数据库文件: ${dbPath}`);
    }
  }

  insertBatch(rows) {
    const jsonStr = JSON.stringify(rows);
    const outCount = [0n];
    const ret = minidb_insert_batch(this.handle, jsonStr, outCount);
    if (ret !== 0) {
      throw new Error(`插入批次失败，错误码: ${ret}`);
    }
    return Number(outCount[0]);
  }

  findByPk(pk) {
    const bufSize = 64 * 1024; // 64KB 输出缓冲
    const buf = Buffer.alloc(bufSize);
    const ret = minidb_find_by_pk(this.handle, BigInt(pk), buf, bufSize);
    if (ret < 0) throw new Error(`查询主键 ${pk} 失败，错误码: ${ret}`);
    if (ret === 0) return null; // 未找到
    const str = buf.toString('utf-8', 0, ret);
    return JSON.parse(str);
  }

  queryPaged(page = 1, pageSize = 20) {
    const bufSize = 256 * 1024; // 256KB 输出缓冲
    const buf = Buffer.alloc(bufSize);
    const ret = minidb_query_paged(this.handle, BigInt(page), BigInt(pageSize), buf, bufSize);
    if (ret < 0) throw new Error(`分页查询失败，错误码: ${ret}`);
    const str = buf.toString('utf-8', 0, ret);
    return JSON.parse(str);
  }

  getStats() {
    const bufSize = 4096;
    const buf = Buffer.alloc(bufSize);
    const ret = minidb_get_stats(this.handle, buf, bufSize);
    if (ret < 0) throw new Error('获取元数据失败');
    return JSON.parse(buf.toString('utf-8', 0, ret));
  }

  close() {
    if (this.handle) {
      minidb_close(this.handle);
      this.handle = null;
    }
  }
}

// 4. 执行测试案例
async function runDemo() {
  const db = new MiniDB('./data/test_rust.dat');
  console.log('数据库已打开，冷启动初始内存:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

  console.log('写入 5,000 条记录...');
  const batch = [];
  for (let i = 1; i <= 5000; i++) {
    batch.push({
      title: `Item #${i}`,
      price: (Math.random() * 500).toFixed(2),
      in_stock: i % 2 === 0
    });
    if (batch.length >= 500) {
      db.insertBatch(batch);
      batch.length = 0;
    }
  }
  if (batch.length > 0) db.insertBatch(batch);

  console.log('统计元数据:', db.getStats());

  console.log('按主键点查 ID=2500:');
  console.log(db.findByPk(2500));

  console.log('分页查询 (Page 1, 3 rows):');
  console.log(db.queryPaged(1, 3));

  db.close();
  console.log('测试完成，当前内存:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
}

// runDemo().catch(console.error);
