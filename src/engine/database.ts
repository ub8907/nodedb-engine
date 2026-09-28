/**
 * NodeDB 数据库总协调器 (Database Coordinator)
 * 统一管理多表存储生命周期、原子事务保存、文件级防灾保护、
 * CRC32 双向校验拦截与系统启动全量索引重建。
 */

import { Table, type TableSchema } from './table.ts';
import { StorageManager, type StoragePayload, type LoadResult, type StorageOperationLog } from './storage-manager.ts';
import { globalBufferPool, type BufferPoolStats } from './buffer-pool.ts';

export class Database {
  private tables: Map<string, Table> = new Map();
  private storage: StorageManager;
  private isInitialized: boolean = false;

  constructor(storagePath: string = './data/nodedb.dat') {
    this.storage = new StorageManager(storagePath);
  }

  /** 获取底层存储防护管理器 */
  public get storageManager(): StorageManager {
    return this.storage;
  }

  /**
   * 初始化数据库（从磁盘持久化文件加载并做完整性校验）
   * @param seedIfEmpty 若为空表文件，是否初始化预置演示数据
   */
  public init(seedIfEmpty: boolean = true): LoadResult {
    const result = this.storage.loadWithIntegrity();

    if (result.success && result.source !== 'EMPTY') {
      this.tables.clear();
      for (const [name, tableData] of Object.entries(result.payload.tables)) {
        const table = new Table(tableData.schema, tableData.next_id);
        table.loadData(tableData.records, tableData.next_id);
        this.tables.set(name, table);
      }
      this.isInitialized = true;
      return result;
    }

    if (seedIfEmpty) {
      this.seedDefaultTables();
      this.save();
    }

    this.isInitialized = true;
    return result;
  }

  /** 创建新数据表 */
  public createTable(schema: TableSchema, initialNextId: number = 1): Table {
    if (this.tables.has(schema.name)) {
      throw new Error(`数据表 "${schema.name}" 已存在。`);
    }
    const table = new Table(schema, initialNextId);
    this.tables.set(schema.name, table);
    return table;
  }

  /** 获取指定数据表 */
  public getTable<T extends Record<string, any> = Record<string, any>>(name: string): Table<T> {
    const table = this.tables.get(name);
    if (!table) {
      throw new Error(`数据库中不存在名为 "${name}" 的数据表。`);
    }
    return table as Table<T>;
  }

  public hasTable(name: string): boolean {
    return this.tables.has(name);
  }

  public dropTable(name: string): boolean {
    return this.tables.delete(name);
  }

  public listTables(): string[] {
    return Array.from(this.tables.keys());
  }

  public getSchemas(): TableSchema[] {
    return Array.from(this.tables.values()).map(t => t.schema);
  }

  /**
   * 原子持久化保存全量数据表至磁盘
   * 自动附带 CRC32 头部、fsync 硬件刷盘与 .bak 轮转
   */
  public save(): { crc: string; sizeBytes: number } {
    const payload: StoragePayload = {
      tables: {}
    };

    for (const [name, table] of this.tables.entries()) {
      payload.tables[name] = table.serializeForStorage();
    }

    return this.storage.saveAtomic(payload);
  }

  /**
   * 强制从磁盘重新加载全量数据并执行 CRC32 校验与内存索引重建
   */
  public reload(): LoadResult {
    const res = this.storage.loadWithIntegrity();
    if (res.success) {
      this.tables.clear();
      for (const [name, tableData] of Object.entries(res.payload.tables)) {
        const table = new Table(tableData.schema, tableData.next_id);
        table.loadData(tableData.records, tableData.next_id);
        this.tables.set(name, table);
      }
    }
    return res;
  }

  /**
   * 模拟注入磁盘静默比特位翻转损坏，测试 CRC32 报警与备份恢复
   */
  public triggerCorruptionSimulation(enabled: boolean): void {
    this.storage.setSimulatedCorruption(enabled);
  }

  /** 获取底层存储审计日志 */
  public getLogs(): StorageOperationLog[] {
    return this.storage.getLogs();
  }

  /**
   * 重建全库所有表的索引 (包括磁盘数据页重整与紧凑化)
   */
  public rebuildAllIndexes(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, table] of this.tables.entries()) {
      result[name] = table.rebuildIndexes();
    }
    return result;
  }

  /**
   * 重建单张表的物理磁盘索引 (REINDEX TABLE)
   */
  public reindexTable(name: string): any {
    const table = this.getTable(name);
    return table.rebuildIndexes();
  }

  /**
   * 获取当前全局缓冲池 (Buffer Pool) 内存与 I/O 运行指标
   */
  public getBufferPoolStats(): BufferPoolStats {
    return globalBufferPool.getStats();
  }

  /**
   * 动态设置缓冲池内存限制 (MB)
   */
  public setMemoryLimitMb(mb: number) {
    return globalBufferPool.setMemoryLimitMb(mb);
  }

  /**
   * 预填充示例演示表 (订单表 orders 与 传感器指标表 metrics_log)
   */
  public seedDefaultTables(): void {
    this.tables.clear();

    // 1. 客户表 customers (支持多表 JOIN 示范)
    const customersSchema: TableSchema = {
      name: 'customers',
      primaryKeyColumn: 'id',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true, autoIncrement: true },
        { name: 'customer_code', type: 'string', isShortKey: true, isUnique: true },
        { name: 'name', type: 'string' },
        { name: 'vip_level', type: 'string', isSecondaryIndex: true },
        { name: 'city', type: 'string', isSecondaryIndex: true },
        { name: 'credit_limit', type: 'number', isSecondaryIndex: true }
      ]
    };

    const customersTable = this.createTable(customersSchema, 1);
    const sampleCustomers = [
      { name: '爱丽丝 (Alice)', vip_level: 'Diamond', city: 'Shanghai', credit_limit: 50000 },
      { name: '鲍勃 (Bob)', vip_level: 'Gold', city: 'Tokyo', credit_limit: 20000 },
      { name: '查理 (Charlie)', vip_level: 'Silver', city: 'Berlin', credit_limit: 8000 },
      { name: '黛安娜 (Diana)', vip_level: 'Diamond', city: 'San Francisco', credit_limit: 80000 },
      { name: '埃文 (Evan)', vip_level: 'Gold', city: 'London', credit_limit: 30000 }
    ];

    for (const cust of sampleCustomers) {
      customersTable.insert(cust);
    }

    // 2. 订单表 orders：
    // - 自增主键 (自建 B-树，next_id 持久化且绝不复用)
    // - 关联客户 customer_id (支持高效 Index Nested Loop Join)
    // - 自动生成 Base62 时间有序短键 (前 9 位毫秒时间戳 + 4 位熵，唯一哈希校验 + 冲突重试)
    // - 客户邮箱 (唯一列哈希索引，O(1) 点查与唯一约束)
    // - 金额与状态 (二级多值 B-树索引，支持范围与等值查询)
    const ordersSchema: TableSchema = {
      name: 'orders',
      primaryKeyColumn: 'id',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true, autoIncrement: true },
        { name: 'customer_id', type: 'number', isSecondaryIndex: true },
        { name: 'order_no', type: 'string', isShortKey: true, isUnique: true },
        { name: 'customer_email', type: 'string', isUnique: true },
        { name: 'amount', type: 'number', isSecondaryIndex: true },
        { name: 'status', type: 'string', isSecondaryIndex: true },
        { name: 'created_at', type: 'string' }
      ]
    };

    const ordersTable = this.createTable(ordersSchema, 1);

    const sampleOrders = [
      { customer_id: 1, customer_email: 'alice@domain.io', amount: 120, status: 'completed', created_at: '2026-03-20 10:15:00' },
      { customer_id: 2, customer_email: 'bob@enterprise.co', amount: 480, status: 'completed', created_at: '2026-03-21 11:30:00' },
      { customer_id: 3, customer_email: 'charlie@tech.dev', amount: 85, status: 'pending', created_at: '2026-03-22 09:00:00' },
      { customer_id: 4, customer_email: 'diana@quantum.ai', amount: 950, status: 'shipped', created_at: '2026-03-23 14:22:00' },
      { customer_id: 5, customer_email: 'evan@matrix.org', amount: 310, status: 'completed', created_at: '2026-03-24 16:45:00' },
      { customer_id: 1, customer_email: 'fiona@hyper.net', amount: 120, status: 'pending', created_at: '2026-03-25 08:12:00' },
      { customer_id: 2, customer_email: 'george@apex.com', amount: 730, status: 'shipped', created_at: '2026-03-25 18:05:00' },
      { customer_id: 3, customer_email: 'helen@stellar.io', amount: 50, status: 'cancelled', created_at: '2026-03-25 19:10:00' },
      { customer_id: 4, customer_email: 'ian@nordic.se', amount: 620, status: 'completed', created_at: '2026-03-25 21:40:00' },
      { customer_id: 5, customer_email: 'julia@global.org', amount: 890, status: 'completed', created_at: '2026-03-26 07:15:00' }
    ];

    for (const order of sampleOrders) {
      ordersTable.insert(order);
    }

    // 3. 指标监控表 metrics_log
    const sensorsSchema: TableSchema = {
      name: 'metrics_log',
      primaryKeyColumn: 'seq',
      columns: [
        { name: 'seq', type: 'number', isPrimaryKey: true, autoIncrement: true },
        { name: 'sensor_code', type: 'string', isShortKey: true },
        { name: 'temperature', type: 'number', isSecondaryIndex: true },
        { name: 'voltage', type: 'number', isSecondaryIndex: true },
        { name: 'node_zone', type: 'string', isSecondaryIndex: true }
      ]
    };

    const sensorsTable = this.createTable(sensorsSchema, 100);
    const zones = ['US-EAST', 'EU-CENTRAL', 'AP-NORTHEAST'];

    for (let i = 0; i < 20; i++) {
      sensorsTable.insert({
        temperature: Math.round(20 + Math.random() * 65),
        voltage: Number((3.1 + Math.random() * 1.8).toFixed(2)),
        node_zone: zones[i % zones.length]
      });
    }
  }
}

/** 全局单例数据库实例 */
export const globalDb = new Database('./data/nodedb.dat');
globalDb.init(true);
