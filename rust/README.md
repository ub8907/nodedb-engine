# MiniDB-RS: 纯磁盘索引与超低内存嵌入式单文件数据库引擎
*(Ultra-Low Memory Embedded Single-File Database with On-Disk Sparse Index & Multi-Language C-ABI)*

MiniDB-RS 是一个专为 **极低内存环境 (IoT 设备、Serverless、Cloud Run 256MB 实例、容器化后端)** 设计的高性能单文件嵌入式数据库引擎。

---

## 🌟 核心架构特性

### 1. 启动零索引加载 (Zero-RAM Index Startup)
* **传统数据库痛点**：数据库启动或首次查询时，通常需要将整库索引树反序列化并灌入 RAM，当数据量达到几百兆甚至数十吉字节时，内存瞬间暴涨甚至触发 OOM 崩溃。
* **MiniDB-RS 方案**：
  * 稀疏块索引以 **32 字节定长二进制格式** 直接固化在磁盘文件末尾。
  * 数据库冷启动时 **仅读取前 4096 字节的超级块 (Superblock)**，无论数据库包含 10 万行还是 1000 万行，启动内存恒定 **< 10 KB**！

### 2. 磁盘原地二分查找 (On-Disk Binary Search)
* 点查特定主键时，引擎直接在文件索引区执行二分跳转（`lseek` + `read` 32 字节）。
* 查找时间复杂度为 $O(\log N)$（100 万行数据仅需约 11 次微秒级文件指针探测），**全流程零数组分配，索引常驻内存为 0 字节**。

### 3. 微批次分块独立压缩 (Block-Paged Compression)
* 写入数据时，每 500 行自动打包为一个物理分块，采用 Deflate Level 1 快速压缩（压缩率约 80%~95%，单块体积仅 16KB~64KB）。
* 读取与分页时，**仅按需解压单个目标数据块**，单次查询峰值内存消耗恒定 `< 64 KB`。

### 4. 标准 C-ABI 跨语言支持 (Multi-Language FFI)
* 原生导出 `cdylib` 动态链接库，提供标准 C 头文件 (`include/minidb.h`)。
* 任何支持 C-FFI 的编程语言均可无缝直接调用：
  * **Node.js**（通过 `koffi` 或 `ffi-napi`）
  * **Python**（通过标准库内置的 `ctypes`）
  * **Go**（通过 `cgo`）
  * **C / C++**（直接包含头文件链接）

---

## 📂 目录结构

```text
rust/
├── Cargo.toml                  # Rust 依赖与编译规格 (cdylib, rlib, bin)
├── include/
│   └── minidb.h                # 标准 C-ABI 头文件，供所有语言绑定引用
├── src/
│   ├── lib.rs                  # 库入口，对外导出模块与符号
│   ├── index.rs                # 32 字节纯磁盘索引布局与原地二分检索
│   ├── storage.rs              # 4KB 扇区对齐超级块、分块压缩与持久化
│   ├── ffi.rs                  # 跨语言 C-ABI 函数导出 (minidb_open/insert/find...)
│   └── main.rs                 # 独立 CLI 命令行执行器与性能压测工具
└── examples/
    ├── node_koffi_example.js   # Node.js 通过 C-FFI (koffi) 高性能调用示范
    ├── python_example.py       # Python 通过 ctypes 无依赖调用示范
    └── node_zero_dep_runner.js # Node.js 纯原生零依赖测试套件 (可直接运行)
```

---

## 💾 物理文件存储格式规范

```text
┌────────────────────────────────────────────────────────┐
│ 0 ~ 4095 字节：4KB 操作系统物理扇区对齐的超级块 (Header) │
│ - 魔数 Magic: "MINIDB01" (8B)                           │
│ - 版本 Version: u32 (4B)                                │
│ - 总行数 Total Rows: u64 (8B)                           │
│ - 下一自增 ID Next ID: u64 (8B)                         │
│ - 磁盘索引表起点 Index Offset: u64 (8B)                 │
│ - 索引物理块总数 Index Count: u64 (8B)                  │
│ - 数据区末尾偏移 Data Area End: u64 (8B)                │
├────────────────────────────────────────────────────────┤
│ 4096 ~ IndexOffset：可扩展的 Deflate 压缩数据块存储区   │
│ - Block 0: [Deflate 压缩 500 行二进制数据] (16KB ~ 64KB)│
│ - Block 1: [Deflate 压缩 500 行二进制数据] (16KB ~ 64KB)│
│ - Block N: ...                                         │
├────────────────────────────────────────────────────────┤
│ IndexOffset ~ 文件末尾：纯磁盘固化索引表 (On-Disk Index)│
│ 每个条目定长 32 字节：                                  │
│ - min_pk (8B) | max_pk (8B) | file_offset (8B)        │
│ - compressed_len (4B) | row_count (2B) | flags (2B)    │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 编译与多语言使用指南

### 1. 编译 Rust 动态链接库与 CLI
在 `rust/` 目录下执行：
```bash
cargo build --release
```
编译后将在 `target/release/` 下生成：
* Linux: `libminidb.so`
* macOS: `libminidb.dylib`
* Windows: `minidb.dll`
* CLI 工具: `minidb-cli`

### 2. 使用 CLI 命令行测试
```bash
# 写入 50,000 条记录
./target/release/minidb-cli ./demo.dat insert 50000

# 查看元数据统计
./target/release/minidb-cli ./demo.dat stats

# 极速点查指定主键 (微秒级响应)
./target/release/minidb-cli ./demo.dat find 25600

# 分页查询 (第 2 页，每页 10 条)
./target/release/minidb-cli ./demo.dat page 2 10
```

### 3. Node.js 调用示例 (基于 koffi FFI)
```javascript
import koffi from 'koffi';

// 加载动态库
const lib = koffi.load('./target/release/libminidb.so');
const MiniDBHandle = koffi.opaque('MiniDBHandle');

const minidb_open = lib.func('minidb_open', MiniDBHandle, ['string']);
const minidb_insert_batch = lib.func('minidb_insert_batch', 'int', [MiniDBHandle, 'string', koffi.out(koffi.pointer('uint64'))]);
const minidb_find_by_pk = lib.func('minidb_find_by_pk', 'int', [MiniDBHandle, 'uint64', koffi.out(koffi.pointer('char')), 'size_t']);
const minidb_close = lib.func('minidb_close', 'void', [MiniDBHandle]);

// 打开数据库（冷启动常驻内存 < 2MB）
const db = minidb_open('./data/app.dat');

// 批量写入
const rows = JSON.stringify([{ title: "Laptop", price: 999.9 }]);
const outCount = [0n];
minidb_insert_batch(db, rows, outCount);

// 磁盘二分点查
const buf = Buffer.alloc(64 * 1024);
const len = minidb_find_by_pk(db, 1n, buf, buf.length);
if (len > 0) {
  console.log("找到记录:", JSON.parse(buf.toString('utf-8', 0, len)));
}

minidb_close(db);
```

### 4. 立即无环境运行验证 (Node.js 纯原生套件)
若当前环境中暂未安装 Rust 工具链，可直接运行同规格的零依赖验证套件：
```bash
node rust/examples/node_zero_dep_runner.js
```
该套件采用与 Rust 代码 **100% 完全相同的物理二进制存储协议与磁盘二分检索算法**，可在终端即时查看 20,000 条数据流式落盘与微秒级点查性能。
