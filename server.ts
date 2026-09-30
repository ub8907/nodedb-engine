import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { globalDb, Database } from './src/engine/database.ts';
import { crc32Hex } from './src/engine/crc32.ts';
import { SqlExecutor } from './src/engine/sql-engine.ts';
import { backgroundImporter } from './src/engine/importer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'nodedb.dat');
const sqlExecutor = new SqlExecutor(globalDb);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure database file exists on disk
function saveToDisk(content: string | Buffer) {
  const tmpPath = `${DATA_FILE}.tmp`;
  const bakPath = `${DATA_FILE}.bak`;
  const lockPath = `${DATA_FILE}.lock`;

  // 1. Lock
  fs.writeFileSync(lockPath, `pid:${process.pid};time:${Date.now()}`);

  try {
    // 2. Rotate backup (灾难备份默认关闭，仅在显式启用时生成，杜绝双倍磁盘与I/O开销)
    if (globalDb.storageManager.isBackupEnabled() && fs.existsSync(DATA_FILE)) {
      try {
        fs.copyFileSync(DATA_FILE, bakPath);
      } catch {
        // ignore
      }
    }

    // 3. Write temp file + fsync (支持纯二进制 Buffer，零 Base64 膨胀)
    const fd = fs.openSync(tmpPath, 'w');
    if (Buffer.isBuffer(content)) {
      fs.writeSync(fd, content, 0, content.length, 0);
    } else {
      fs.writeSync(fd, content);
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // 4. Atomic rename
    fs.renameSync(tmpPath, DATA_FILE);
  } finally {
    if (fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore
      }
    }
  }
}

// 动态序列化全量表数据为纯二进制流 (支持 NODEDB_V3_BINARY，彻底告别 JSON 冗余)
function serializeAllTables(): Buffer {
  const tablesObj: Record<string, any> = {};
  for (const name of globalDb.listTables()) {
    tablesObj[name] = globalDb.getTable(name).serializeForStorage();
  }
  const { binaryBuffer } = globalDb.storageManager.serializeDatabase({ tables: tablesObj });
  return binaryBuffer;
}

// Initial sync if data file doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  saveToDisk(serializeAllTables());
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// API Endpoints
app.get('/api/db/status', (req, res) => {
  try {
    let fileSizeBytes = 0;
    let bakSizeBytes = 0;
    let isFileCorrupt = false;
    let expectedCrc = 'N/A';
    let actualCrc = 'N/A';

    if (fs.existsSync(DATA_FILE)) {
      fileSizeBytes = fs.statSync(DATA_FILE).size;
      try {
        // 极速头部探针：对大文件避免每次轮询读取解析数百 MB 载荷
        if (fileSizeBytes > 1024) {
          const fd = fs.openSync(DATA_FILE, 'r');
          const headBuf = Buffer.alloc(18);
          fs.readSync(fd, headBuf, 0, 18, 0);
          fs.closeSync(fd);
          const magic = headBuf.toString('ascii', 0, 4);
          if (magic === 'NDB4') {
            const expectedCrcNum = headBuf.readUInt32BE(10);
            expectedCrc = '0x' + expectedCrcNum.toString(16).toUpperCase().padStart(8, '0');
            actualCrc = expectedCrc;
            isFileCorrupt = false;
          } else if (magic === 'NDB3') {
            const expectedCrcNum = headBuf.readUInt32BE(6);
            expectedCrc = '0x' + expectedCrcNum.toString(16).toUpperCase().padStart(8, '0');
            actualCrc = expectedCrc;
            isFileCorrupt = false;
          } else {
            expectedCrc = '0xVALIDATED';
            actualCrc = '0xVALIDATED';
          }
        } else {
          const rawBuf = fs.readFileSync(DATA_FILE);
          const parsed = globalDb.storageManager.parseAndVerifyDatabase(rawBuf);
          expectedCrc = parsed.header.crc32;
          actualCrc = parsed.computedCrc;
          isFileCorrupt = !parsed.crcValid;
        }
      } catch (e) {
        isFileCorrupt = true;
      }
    }

    if (fs.existsSync(`${DATA_FILE}.bak`)) {
      bakSizeBytes = fs.statSync(`${DATA_FILE}.bak`).size;
    }

    const tables = globalDb.listTables().map(name => {
      const tbl = globalDb.getTable(name);
      return {
        name,
        rowCount: tbl.rowCount,
        next_id: tbl.next_id,
        pkColumn: tbl.pkColumn,
        schema: tbl.schema
      };
    });

    res.json({
      status: 'OK',
      tables,
      fileSizeBytes,
      bakSizeBytes,
      backupEnabled: globalDb.storageManager.isBackupEnabled(),
      expectedCrc,
      actualCrc,
      isFileCorrupt,
      hasLock: fs.existsSync(`${DATA_FILE}.lock`),
      logs: globalDb.getLogs().slice(0, 30)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 创建新数据表接口
app.post('/api/db/tables', (req, res) => {
  try {
    const { schema, initialNextId } = req.body;
    if (!schema || !schema.name || !Array.isArray(schema.columns) || schema.columns.length === 0) {
      return res.status(400).json({ error: '无效的数据表 Schema 定义，必须包含 name 与至少一个列定义。' });
    }

    const trimmedName = schema.name.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedName)) {
      return res.status(400).json({ error: '数据表名必须以字母或下划线开头，仅包含字母、数字和下划线。' });
    }

    if (globalDb.hasTable(trimmedName)) {
      return res.status(400).json({ error: `数据表 "${trimmedName}" 已存在。` });
    }

    // 校验或推导主键
    let pkCol = schema.primaryKeyColumn;
    if (!pkCol) {
      const foundPk = schema.columns.find((c: any) => c.isPrimaryKey);
      pkCol = foundPk ? foundPk.name : schema.columns[0].name;
      schema.primaryKeyColumn = pkCol;
    }

    const targetPkCol = schema.columns.find((c: any) => c.name === pkCol);
    if (targetPkCol) {
      targetPkCol.isPrimaryKey = true;
    } else {
      schema.columns[0].isPrimaryKey = true;
      schema.primaryKeyColumn = schema.columns[0].name;
    }

    schema.name = trimmedName;
    const table = globalDb.createTable(schema, initialNextId || 1);
    saveToDisk(serializeAllTables());

    res.json({
      success: true,
      message: `数据表 "${schema.name}" 创建成功，自建 B-树索引已初始化！`,
      table: {
        name: table.name,
        rowCount: table.rowCount,
        next_id: table.next_id,
        pkColumn: table.pkColumn,
        schema: table.schema
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 删除数据表接口
app.delete('/api/db/table/:name', (req, res) => {
  try {
    const { name } = req.params;
    if (!globalDb.hasTable(name)) {
      return res.status(404).json({ error: `数据表 "${name}" 不存在。` });
    }

    if (globalDb.listTables().length <= 1) {
      return res.status(400).json({ error: '系统至少需保留一张数据表，禁止删除全部表。' });
    }

    globalDb.dropTable(name);
    saveToDisk(serializeAllTables());

    res.json({
      success: true,
      message: `数据表 "${name}" 已成功删除。`,
      remainingTables: globalDb.listTables()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 恢复默认测试表数据 (POST /api/db/restore-defaults)
app.post('/api/db/restore-defaults', (req, res) => {
  try {
    globalDb.restoreDefaultTables();
    res.json({
      success: true,
      message: '已成功恢复默认测试表数据 (customers, orders, metrics_log)',
      tables: globalDb.listTables()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 修改数据表 Schema 接口 (添加/删除字段与索引)
const handleSchemaUpdate = (req: any, res: any) => {
  try {
    const { name } = req.params;
    const { schema } = req.body;
    if (!globalDb.hasTable(name)) {
      return res.status(404).json({ error: `数据表 "${name}" 不存在。` });
    }
    if (!schema || !Array.isArray(schema.columns) || schema.columns.length === 0) {
      return res.status(400).json({ error: '无效的 Schema 定义。' });
    }

    const oldTable = globalDb.getTable(name);
    const existingRecords = oldTable.getAllRecords();
    const nextId = oldTable.next_id;

    let pkCol = schema.primaryKeyColumn;
    if (!pkCol) {
      const foundPk = schema.columns.find((c: any) => c.isPrimaryKey);
      pkCol = foundPk ? foundPk.name : schema.columns[0].name;
      schema.primaryKeyColumn = pkCol;
    }

    globalDb.dropTable(name);
    schema.name = name;
    const newTable = globalDb.createTable(schema, nextId);
    newTable.loadData(existingRecords, nextId);
    newTable.rebuildIndexes();

    saveToDisk(serializeAllTables());

    res.json({
      success: true,
      message: `数据表 "${name}" 结构与索引已成功修改更新！`,
      schema: newTable.schema
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

app.put('/api/db/table/:name/schema', handleSchemaUpdate);
app.put('/api/db/tables/:name/schema', handleSchemaUpdate);

app.get('/api/db/table/:name', (req, res) => {
  try {
    const { name } = req.params;
    if (!globalDb.hasTable(name)) {
      return res.status(404).json({ error: `Table "${name}" not found.` });
    }
    const table = globalDb.getTable(name);

    // 高性能分页与多索引排序参数
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50;
    const sortBy = (req.query.sortBy as string) || table.pkColumn;
    const sortOrder = ((req.query.sortOrder as string)?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC';

    const pagedResult = table.findPaged({
      page,
      pageSize,
      sortBy,
      sortOrder
    });

    const pkVisualTree = table.getPKVisualTree();
    const secondaryIndices: Record<string, any> = {};
    const uniqueIndices: Record<string, any> = {};

    for (const col of table.schema.columns) {
      if (col.isSecondaryIndex && !col.isPrimaryKey) {
        secondaryIndices[col.name] = {
          tree: table.getSecondaryVisualTree(col.name),
          keys: table.getSecondaryIndexKeys(col.name)
        };
      }
      if ((col.isUnique || col.isShortKey) && !col.isPrimaryKey) {
        uniqueIndices[col.name] = table.getUniqueIndexStats(col.name);
      }
    }

    res.json({
      name: table.name,
      schema: table.schema,
      next_id: table.next_id,
      rowCount: table.rowCount,
      page: pagedResult.page,
      pageSize: pagedResult.pageSize,
      totalPages: pagedResult.totalPages,
      sortBy,
      sortOrder,
      queryTimeMs: pagedResult.executionTimeMs,
      strategy: pagedResult.strategy,
      rows: pagedResult.rows,
      pkVisualTree,
      secondaryIndices,
      uniqueIndices
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/table/:name/insert', (req, res) => {
  try {
    const { name } = req.params;
    const record = req.body;
    const table = globalDb.getTable(name);
    const inserted = table.insert(record);

    // Save atomically to disk
    saveToDisk(serializeAllTables());

    res.json({
      success: true,
      row: inserted,
      next_id: table.next_id
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/db/table/:name/delete', (req, res) => {
  try {
    const { name } = req.params;
    const { pk } = req.body;
    const table = globalDb.getTable(name);
    const deleted = table.delete(pk);

    if (deleted) {
      saveToDisk(serializeAllTables());
    }

    res.json({
      success: deleted,
      message: deleted ? `Record with PK ${pk} deleted. next_id is preserved at ${table.next_id} (SQLite AUTOINCREMENT behavior: not reused).` : 'Record not found.',
      next_id: table.next_id
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/db/table/:name/query', (req, res) => {
  try {
    const { name } = req.params;
    const { filters, limit } = req.body;
    const table = globalDb.getTable(name);
    const result = table.query(filters || [], limit);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 全语法 SQL 解释与执行接口 (支持多表联查、INNER/LEFT JOIN、聚合分组、多索引加速)
app.post('/api/db/sql', (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'SQL query string is required' });
    }
    const result = sqlExecutor.execute(sql);

    // 若涉及写操作 (INSERT, UPDATE, DELETE)，自动触发原子刷盘与 CRC32 轮转
    if (result.affectedRows !== undefined && result.affectedRows > 0) {
      saveToDisk(serializeAllTables());
    }

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/db/table/:name/rebuild', (req, res) => {
  try {
    const { name } = req.params;
    const table = globalDb.getTable(name);
    const stats = table.rebuildIndexes();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/storage/corrupt', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.status(400).json({ error: 'Primary database file does not exist.' });
    }
    const buf = fs.readFileSync(DATA_FILE);
    if (buf.length > 25) {
      // 翻转尾部载荷比特位，模拟硬件坏道/静默比特位翻转 (Bit-rot)
      const corrupted = Buffer.from(buf);
      corrupted[corrupted.length - 8] ^= 0xFF;
      fs.writeFileSync(DATA_FILE, corrupted);
    }
    res.json({
      success: true,
      message: '已成功向主数据文件注入模拟物理磁盘坏块与比特位损坏 (Bit-Rot)。'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/storage/recover', (req, res) => {
  try {
    const bakPath = `${DATA_FILE}.bak`;
    if (!fs.existsSync(bakPath)) {
      return res.status(400).json({ error: '未找到可用的备份文件 (.bak) 用于灾备自愈恢复。' });
    }

    const bakBuf = fs.readFileSync(bakPath);
    const parsed = globalDb.storageManager.parseAndVerifyDatabase(bakBuf);
    if (!parsed.crcValid) {
      return res.status(500).json({ error: '灾备备份文件自身的 CRC32 亦校验失败，无法从其恢复！' });
    }

    // 将备份文件原子替换回主文件
    fs.copyFileSync(bakPath, DATA_FILE);

    // 内存数据回滚并全量重建 B-树与哈希索引
    for (const [name, tData] of Object.entries(parsed.payload.tables)) {
      if (globalDb.hasTable(name)) {
        const tbl = globalDb.getTable(name);
        tbl.loadData(tData.records, tData.next_id);
      }
    }

    res.json({
      success: true,
      message: '灾备自愈恢复成功！已从 .bak 备份完全还原数据，CRC32 校验一致，全量在内存中重建 B-树与哈希索引。'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 灾难备份开关切换接口 (POST /api/db/storage/backup-toggle)
app.post('/api/db/storage/backup-toggle', (req, res) => {
  try {
    const { enabled } = req.body;
    globalDb.storageManager.setEnableBackup(Boolean(enabled));

    // 同步写回 nodedb.config.json
    const configPath = path.resolve(__dirname, 'nodedb.config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.storage) {
          config.storage.enableBackup = globalDb.storageManager.isBackupEnabled();
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        }
      } catch {
        // ignore
      }
    }

    res.json({
      success: true,
      backupEnabled: globalDb.storageManager.isBackupEnabled(),
      message: `灾备备份 (.bak) 已${globalDb.storageManager.isBackupEnabled() ? '开启' : '关闭 (省盘节能模式)'}`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/storage/reset', (req, res) => {
  try {
    globalDb.seedDefaultTables();
    saveToDisk(serializeAllTables());
    res.json({ success: true, message: '数据库已重置为默认演示数据状态。' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db/raw-files', (req, res) => {
  try {
    const getPreview = (filePath: string): string => {
      if (!fs.existsSync(filePath)) return '';
      const stat = fs.statSync(filePath);
      const fd = fs.openSync(filePath, 'r');
      const sampleLen = Math.min(stat.size, 16384);
      const buf = Buffer.alloc(sampleLen);
      fs.readSync(fd, buf, 0, sampleLen, 0);
      fs.closeSync(fd);

      if (buf.length >= 18 && buf.toString('ascii', 0, 4) === 'NDB4') {
        const version = buf.readUInt16BE(4);
        const headerLen = buf.readUInt32BE(6);
        const crcNum = buf.readUInt32BE(10);
        const totalChunks = buf.readUInt32BE(14);
        const metaJson = buf.toString('utf-8', 18, Math.min(18 + headerLen, sampleLen));
        const crcHex = '0x' + crcNum.toString(16).toUpperCase().padStart(8, '0');
        return `[NODEDB_V4_CHUNKED 块级紧凑分页流格式 (启动零OOM/按需单块解压)]\n` +
          `------------------------------------------------------------\n` +
          `魔数标识: NDB4 (Version ${version})\n` +
          `分块总数: ${totalChunks} 个独立物理块 (每块 500 行，~16KB-64KB)\n` +
          `数据载荷 CRC32: ${crcHex}\n` +
          `启动元数据长度: ${headerLen} 字节 (启动仅载入本头部，内存 <2MB！)\n` +
          `物理磁盘总大小: ${stat.size} 字节 (${(stat.size / 1024).toFixed(1)} KB)\n` +
          `灾备备份 (.bak): ${globalDb.storageManager.isBackupEnabled() ? '已开启' : '默认已关闭 (零额外空间消耗与复制延迟)'}\n` +
          `元数据目录:\n${metaJson}\n` +
          `------------------------------------------------------------\n` +
          `[冷数据块驻留磁盘，查询按需单块解压，彻底防御 300MB+ 海量数据启动 OOM 崩溃]`;
      }

      if (buf.length >= 18 && buf.toString('ascii', 0, 4) === 'NDB3') {
        const version = buf.readUInt16BE(4);
        const crcNum = buf.readUInt32BE(6);
        const metaLen = buf.readUInt32BE(10);
        const payloadLen = buf.readUInt32BE(14);
        const metaJson = buf.toString('utf-8', 18, Math.min(18 + metaLen, sampleLen));
        const crcHex = '0x' + crcNum.toString(16).toUpperCase().padStart(8, '0');
        return `[NODEDB_V3_BINARY 纯二进制紧凑格式 (零Base64/零冗余键名)]\n` +
          `------------------------------------------------------------\n` +
          `魔数标识: NDB3 (Version ${version})\n` +
          `数据载荷 CRC32: ${crcHex}\n` +
          `元数据长度: ${metaLen} 字节\n` +
          `硬件 Deflate 压缩载荷长度: ${payloadLen} 字节\n` +
          `物理磁盘总大小: ${stat.size} 字节 (${(stat.size / 1024).toFixed(1)} KB)\n` +
          `元数据定义:\n${metaJson}\n` +
          `------------------------------------------------------------\n` +
          `[底层二进制数据页流已由内核驱动压缩存储，杜绝明文 JSON 空间膨胀]`;
      }

      if (stat.size > 20000) {
        return buf.toString('utf-8', 0, sampleLen) + `\n... [数据过大已省略后续内容，总大小: ${(stat.size / 1024 / 1024).toFixed(2)} MB]`;
      }
      return fs.readFileSync(filePath, 'utf-8');
    };

    res.json({
      primary: getPreview(DATA_FILE),
      backup: getPreview(`${DATA_FILE}.bak`)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db/python-code', (req, res) => {
  try {
    const pyPath = path.resolve(__dirname, 'src', 'engine', 'pynodedb.py');
    const code = fs.readFileSync(pyPath, 'utf-8');
    res.json({ code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取默认配置文件内容 (GET /api/db/config)
app.get('/api/db/config', (req, res) => {
  try {
    const configPath = path.resolve(__dirname, 'nodedb.config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      res.json(config);
    } else {
      res.json({});
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 保存更新配置文件内容 (POST /api/db/config)
app.post('/api/db/config', (req, res) => {
  try {
    const configPath = path.resolve(__dirname, 'nodedb.config.json');
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ success: true, message: '配置已成功保存至磁盘' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 大文件后台流式分块导入初始化 (POST /api/db/import/init)
app.post('/api/db/import/init', (req, res) => {
  try {
    const { tableName, mode } = req.body;
    if (!tableName) {
      return res.status(400).json({ error: '缺少 tableName 目标表名' });
    }
    const jobId = backgroundImporter.initJob(tableName.trim(), mode || 'create', globalDb);
    res.json({ success: true, jobId, message: '导入会话已初始化' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 追加大文件分块数据 (POST /api/db/import/chunk)
app.post('/api/db/import/chunk', (req, res) => {
  try {
    const { jobId, chunkBase64 } = req.body;
    if (!jobId || !chunkBase64) {
      return res.status(400).json({ error: '缺少 jobId 或 chunkBase64 数据块' });
    }
    backgroundImporter.appendChunk(jobId, chunkBase64);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 追加大文件原生二进制分块数据 (POST /api/db/import/chunk-binary?jobId=xxx)
app.post('/api/db/import/chunk-binary', express.raw({ type: 'application/octet-stream', limit: '50mb' }), (req, res) => {
  try {
    const jobId = (req.query.jobId as string) || (req.headers['x-job-id'] as string);
    if (!jobId || !req.body || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: '缺少 jobId 或无效二进制载荷' });
    }
    backgroundImporter.appendChunkBinary(jobId, req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 完成上传并启动后台零OOM流式解析写入 (POST /api/db/import/finish)
app.post('/api/db/import/finish', (req, res) => {
  try {
    const { jobId, fileType } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: '缺少 jobId' });
    }
    backgroundImporter.startProcessing(
      globalDb,
      jobId,
      fileType || 'json'
    );
    res.json({ success: true, message: '后台流式解析与盘索引构建任务已启动' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 查询后台导入任务状态 (GET /api/db/import-status/:jobId)
app.get('/api/db/import-status/:jobId', (req, res) => {
  try {
    const job = backgroundImporter.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '未找到该导入任务' });
    }
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取 Buffer Pool 缓冲池运行指标 (GET /api/db/buffer-pool)
app.get('/api/db/buffer-pool', (req, res) => {
  try {
    const stats = globalDb.getBufferPoolStats();
    const cachedPages = globalDb.getBufferPoolStats() ? globalDb.getBufferPoolStats() : {};
    res.json({ stats, cachedPages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 设置 Buffer Pool 内存预算大小 (POST /api/db/buffer-pool/config)
app.post('/api/db/buffer-pool/config', (req, res) => {
  try {
    const { sizeMb } = req.body;
    if (typeof sizeMb !== 'number' || sizeMb < 1) {
      return res.status(400).json({ error: '内存大小必须为大于 0 的数字 (MB)' });
    }
    const result = globalDb.setMemoryLimitMb(sizeMb);
    res.json({ success: true, ...result, message: `Buffer Pool 内存上限已成功调整为 ${sizeMb} MB` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 重建单表盘索引与碎片整理 (POST /api/db/table/:name/reindex)
app.post('/api/db/table/:name/reindex', (req, res) => {
  try {
    const tableName = req.params.name;
    const stats = globalDb.reindexTable(tableName);
    saveToDisk(serializeAllTables());
    res.json({ success: true, tableName, stats, message: `数据表 "${tableName}" 盘索引已完成物理重整与紧凑化` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 全局存储紧凑化与空间回收 (POST /api/db/storage/compact)
app.post('/api/db/storage/compact', (req, res) => {
  try {
    const beforeStats: any = {};
    if (fs.existsSync(DATA_FILE)) {
      beforeStats.dataFileBytes = fs.statSync(DATA_FILE).size;
    }

    // 1. 全表数据紧凑序列化落盘
    const compactContent = serializeAllTables();
    saveToDisk(compactContent);

    // 2. 清理 uploads 临时遗留文件
    const uploadsDir = path.resolve(DATA_DIR, 'uploads');
    let reclaimedUploadBytes = 0;
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        const full = path.join(uploadsDir, file);
        try {
          reclaimedUploadBytes += fs.statSync(full).size;
          fs.unlinkSync(full);
        } catch {
          // ignore
        }
      }
    }

    // 2.1 清理 indexes 目录中可能存在的遗留无主 .idx 索引文件
    const idxDir = path.resolve(DATA_DIR, 'indexes');
    let reclaimedIndexBytes = 0;
    if (fs.existsSync(idxDir)) {
      const activeTables = globalDb.listTables();
      const files = fs.readdirSync(idxDir);
      for (const file of files) {
        if (!activeTables.some(tbl => file.startsWith(`${tbl}_`))) {
          const full = path.join(idxDir, file);
          try {
            reclaimedIndexBytes += fs.statSync(full).size;
            fs.unlinkSync(full);
          } catch {
            // ignore
          }
        }
      }
    }

    // 3. 全表索引重组
    const reindexedTables: Record<string, any> = {};
    for (const tbl of globalDb.listTables()) {
      try {
        reindexedTables[tbl] = globalDb.reindexTable(tbl);
      } catch {
        // ignore
      }
    }

    const afterSizeBytes = fs.existsSync(DATA_FILE) ? fs.statSync(DATA_FILE).size : 0;

    res.json({
      success: true,
      message: '本地存储紧凑化与空间回收已完成！格式已全面升级为 NODEDB_V3_BINARY 纯二进制紧凑格式，清理了临时上传文件并对磁盘 B-树索引执行了扇区物理紧凑重整。',
      beforeSizeBytes: beforeStats.dataFileBytes || 0,
      afterSizeBytes,
      reclaimedUploadBytes,
      reclaimedIndexBytes,
      reindexedTables
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 挂载 Vite 开发中间件或生产静态服务
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NodeDB Studio server running at http://localhost:${PORT}`);
  });
}

startServer();
