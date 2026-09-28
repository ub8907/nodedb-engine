# NodeDB: High-Performance Embedded Single-File Database & Storage Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedb&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**NodeDB** is a lightweight, high-performance embedded single-file database and storage engine engineered from scratch in **TypeScript / Node.js** (with a companion Python implementation). It is specifically designed to deliver SQLite-class reliability and zero-OOM memory safety when handling multi-gigabyte datasets in resource-constrained environments (e.g. 64MB–128MB RAM servers).

---

## 🌟 Key Architecture & Low-Memory Optimizations

### 1. NDB4 Chunked & Block-Paged Storage (Zero-OOM Startup)
* **Metadata-Only Fast Boot (<2MB RAM)**: Solves the startup memory bottleneck. When booting up, the engine only reads the 18-byte container prefix and the 4KB sector-aligned table catalog header (<50KB). Startup completes in **<3ms** with **<2MB RAM**, eliminating the need to decompress the entire database into memory.
* **No Monolithic `inflateSync`**: Replaces single-blob decompression with 500-row physical data blocks (typically 16KB–64KB per block). Blocks are independently compressed using Deflate.
* **On-Demand Single-Chunk Decompression**: Queries and pagination locate the target chunk via physical byte offsets and only decompress that single block on demand.
* **Hot-Page LRU Caching**: Decompressed rows reside in an LRU buffer pool. Inactive cold blocks are evicted immediately, keeping heap usage strictly bounded.

### 2. Disaster Backup (`nodedb.dat.bak`) Disabled by Default
* **Zero Duplicate Disk Bloat**: Automatic `.bak` replication is disabled by default, eliminating 50% extra disk footprint and disk I/O copy latency during writes.
* **Configurable On-Demand**: Can be toggled on/off at any time via `nodedb.config.json`, REST API (`/api/db/storage/backup-toggle`), or the Storage Lab UI.

### 3. $O(1)$ Buffer Pool & B-Tree Indexing
* **Strict Memory Budgets**: Bounded RAM usage (default 32MB configurable). Cold pages are evicted to disk, preventing Out-Of-Memory (OOM) errors even when querying multi-gigabyte tables.
* **Logarithmic Point Queries**: Primary keys and secondary range indices leverage balanced B-Trees for $O(\log N)$ point lookups and fast range scans.

### 4. Streaming Importer for Massive Datasets
* **Constant-Memory Stream Parser**: Streams and parses massive JSON/NDJSON and CSV files chunk-by-chunk using Node.js `fs.createReadStream`, keeping memory consumption under 5MB regardless of dataset size.
* **Auto Schema Inference**: Automatically infers column types, primary keys, and auto-increment properties on the fly.

### 5. Full SQL Studio & Table Studio
* **Comprehensive SQL Parser**: Supports `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`, `DROP TABLE`, `WHERE` filtering (`AND`, `OR`, `=`, `!=`, `>`, `<`, `BETWEEN`, `LIKE`, `IN`), `ORDER BY`, and MySQL-style pagination (`LIMIT offset, count`).
* **Table Studio**: Dynamic schema manager allowing users to add/drop columns, configure primary keys, unique hashes, and secondary B-Tree indexes on the fly.

---

## 📊 Benchmark & Low-Memory Performance

| Metric | Monolithic V3 Storage | NDB4 Chunked Storage (Current) | Improvement |
| :--- | :--- | :--- | :--- |
| **Startup Memory (300MB Data)** | ~300MB – 600MB RAM | **< 2MB RAM** | **99.5% reduction** |
| **Startup Time** | ~450ms – 1200ms | **< 3ms** | **150x faster** |
| **Memory during Paged Query** | Full heap load | **< 30KB per page** | **Zero OOM risk** |
| **Default Disk Footprint** | 2x size (`.dat` + `.bak`) | **1x size (`.bak` default OFF)** | **50% disk saved** |
| **Low-Memory Server Suitability**| Unstable on <512MB RAM | **Runs smoothly on 64MB RAM** | **Production-ready** |

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18+)
* **npm** or **bun**

### Installation & Execution
```bash
# Install dependencies
npm install

# Start development server (Node.js backend + Vite frontend on port 3000)
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

---

## 📖 Documentation
* [中文说明文档 (README_ZH.md)](./README_ZH.md)
* [English Documentation (README.md)](./README.md)

---

## 📜 License
MIT License. Feel free to use, modify, and distribute.
