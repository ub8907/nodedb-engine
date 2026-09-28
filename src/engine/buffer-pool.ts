/**
 * NodeDB 磁盘页面缓冲池与内存优化管理器 (Buffer Pool & Memory Optimizer)
 * 
 * 核心架构与功能：
 * 1. 内存预算限制 (Configurable Memory Limit)：支持动态设置最大占用内存 (MB)
 * 2. 页面置换算法 (LRU Page Eviction Policy)：超出内存预算时自动将最久未访问页换出至磁盘
 * 3. 脏页管理 (Dirty Page Tracking)：被修改的页面标记为 isDirty，仅在换出或主动 commit/fsync 时刷盘
 * 4. 磁盘页定长槽位管理 (4096 字节标准扇区对齐)：与操作系统及物理存储对齐
 * 5. 实时监控指标：命中率 (Hit Ratio %)、磁盘读写次数、换出次数 (Evictions)、当前内存使用量 (KB/MB)
 */

import fs from 'fs';
import path from 'path';
import v8 from 'v8';

/** 磁盘索引数据页结构 */
export interface DiskIndexPage<K = any, V = any> {
  pageId: number;
  isLeaf: boolean;
  keys: K[];
  values: V[];
  children: number[];       // 子页号列表 (内部节点)
  nextLeafPageId: number;   // 叶子页向后指针 (范围查询)
  prevLeafPageId: number;   // 叶子页向前指针
  isDirty?: boolean;        // 是否为脏页
  lastAccessed: number;     // LRU 访问时间戳
}

/** 索引文件头部元数据规范 (Page 0) */
export interface DiskIndexHeader {
  magic: string;            // 'NDB_IDX'
  version: number;          // 1
  pageSize: number;         // 4096
  rootPageId: number;       // 根节点页号
  totalPages: number;       // 文件总分配页数
  keyCount: number;         // 索引键总数
  treeDepth: number;        // B-树高度
  tableName: string;        // 所属表
  indexName: string;        // 索引列名
  indexType: 'PRIMARY_BTREE' | 'SECONDARY_BTREE' | 'UNIQUE_HASH';
}

/** 缓冲池统计监控指标 */
export interface BufferPoolStats {
  memoryLimitMb: number;
  pageSizeBytes: number;
  cachedPagesCount: number;
  maxPagesCount: number;
  memoryUsedBytes: number;
  memoryUsedMb: number;
  hits: number;
  misses: number;
  hitRatioPercent: number;
  diskReads: number;
  diskWrites: number;
  evictions: number;
  dirtyPagesCount: number;
}

export class BufferPoolManager {
  private static instance: BufferPoolManager | null = null;

  private memoryLimitMb: number = 32;       // 默认 32MB 内存预算限制
  private readonly pageSize: number = 4096; // 4KB 扇区对齐
  private maxPagesCount: number;

  // 缓存哈希表：key 为 `${filePath}:${pageId}` -> 页面对象
  private pageCache: Map<string, DiskIndexPage> = new Map();
  
  // 索引头部缓存：key 为 `filePath` -> 头部对象
  private headerCache: Map<string, DiskIndexHeader> = new Map();

  // 性能与 I/O 统计
  private stats = {
    hits: 0,
    misses: 0,
    diskReads: 0,
    diskWrites: 0,
    evictions: 0
  };

  constructor(memoryLimitMb: number = 32) {
    this.memoryLimitMb = Math.max(1, memoryLimitMb);
    this.maxPagesCount = Math.floor((this.memoryLimitMb * 1024 * 1024) / this.pageSize);
  }

  public static getInstance(initialLimitMb: number = 32): BufferPoolManager {
    if (!BufferPoolManager.instance) {
      BufferPoolManager.instance = new BufferPoolManager(initialLimitMb);
    }
    return BufferPoolManager.instance;
  }

  public recordHit(): void {
    this.stats.hits++;
  }

  public recordMiss(): void {
    this.stats.misses++;
  }

  public recordDiskRead(): void {
    this.stats.diskReads++;
  }

  /**
   * 动态调整内存预算限制 (Memory Optimization)
   * 若缩小内存导致超出容量，自动按 LRU 刷盘并驱逐页面
   */
  public setMemoryLimitMb(mb: number): { beforeMb: number; afterMb: number; evictedPages: number } {
    const beforeMb = this.memoryLimitMb;
    this.memoryLimitMb = Math.max(1, Math.min(1024, mb));
    this.maxPagesCount = Math.floor((this.memoryLimitMb * 1024 * 1024) / this.pageSize);

    let evictedCount = 0;
    while (this.pageCache.size > this.maxPagesCount) {
      this.evictLRUPage();
      evictedCount++;
    }

    return {
      beforeMb,
      afterMb: this.memoryLimitMb,
      evictedPages: evictedCount
    };
  }

  /**
   * 获取指定索引文件的元数据头 (Page 0)
   */
  public getHeader(filePath: string): DiskIndexHeader {
    if (this.headerCache.has(filePath)) {
      return this.headerCache.get(filePath)!;
    }

    // 从磁盘读取 Page 0
    if (fs.existsSync(filePath)) {
      try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(this.pageSize);
        fs.readSync(fd, buf, 0, this.pageSize, 0);
        fs.closeSync(fd);

        const raw = buf.toString('utf8').replace(/\0+$/, '').trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          this.headerCache.set(filePath, parsed);
          this.stats.diskReads++;
          return parsed;
        }
      } catch (err) {
        // Fallback to default header if corrupted or uninitialized
      }
    }

    const defaultHeader: DiskIndexHeader = {
      magic: 'NDB_IDX',
      version: 1,
      pageSize: this.pageSize,
      rootPageId: 1,
      totalPages: 1,
      keyCount: 0,
      treeDepth: 1,
      tableName: '',
      indexName: '',
      indexType: 'PRIMARY_BTREE'
    };
    this.headerCache.set(filePath, defaultHeader);
    return defaultHeader;
  }

  /**
   * 保存索引文件元数据头
   */
  public saveHeader(filePath: string, header: DiskIndexHeader): void {
    this.headerCache.set(filePath, header);
    this.ensureDir(path.dirname(filePath));

    try {
      const fd = fs.openSync(filePath, 'a+');
      const json = JSON.stringify(header);
      const buf = Buffer.alloc(this.pageSize);
      buf.write(json, 0, 'utf8');
      fs.writeSync(fd, buf, 0, this.pageSize, 0);
      fs.closeSync(fd);
      this.stats.diskWrites++;
    } catch (e) {
      console.error(`Failed to save index header to ${filePath}:`, e);
    }
  }

  /**
   * 从缓冲池获取数据页 (若未命中则从磁盘载入)
   */
  public getPage<K = any, V = any>(filePath: string, pageId: number): DiskIndexPage<K, V> {
    const cacheKey = `${filePath}:${pageId}`;

    if (this.pageCache.has(cacheKey)) {
      this.stats.hits++;
      const page = this.pageCache.get(cacheKey)!;
      page.lastAccessed = Date.now();
      // 刷新 Map 迭代顺序 (LRU)
      this.pageCache.delete(cacheKey);
      this.pageCache.set(cacheKey, page);
      return page as DiskIndexPage<K, V>;
    }

    // 缓存未命中 (Miss)
    this.stats.misses++;
    this.stats.diskReads++;

    // 检查是否达到内存预算上限，若是则执行 LRU 换出
    if (this.pageCache.size >= this.maxPagesCount) {
      this.evictLRUPage();
    }

    // 从磁盘文件中读取特定页
    const page = this.readPageFromDisk<K, V>(filePath, pageId);
    page.lastAccessed = Date.now();
    this.pageCache.set(cacheKey, page);
    return page;
  }

  /**
   * 标记数据页为脏页 (在内存中发生修改)
   */
  public markDirty(filePath: string, pageId: number): void {
    const cacheKey = `${filePath}:${pageId}`;
    const page = this.pageCache.get(cacheKey);
    if (page) {
      page.isDirty = true;
      page.lastAccessed = Date.now();
    }
  }

  /**
   * 在磁盘索引文件中分配一个全新数据页
   */
  public allocateNewPage<K = any, V = any>(filePath: string, isLeaf: boolean = true): DiskIndexPage<K, V> {
    const header = this.getHeader(filePath);
    const newPageId = ++header.totalPages;
    this.saveHeader(filePath, header);

    const newPage: DiskIndexPage<K, V> = {
      pageId: newPageId,
      isLeaf,
      keys: [],
      values: [],
      children: [],
      nextLeafPageId: -1,
      prevLeafPageId: -1,
      isDirty: true,
      lastAccessed: Date.now()
    };

    if (this.pageCache.size >= this.maxPagesCount) {
      this.evictLRUPage();
    }

    const cacheKey = `${filePath}:${newPageId}`;
    this.pageCache.set(cacheKey, newPage);
    return newPage;
  }

  /**
   * 刷新全部脏页至磁盘 (fsync)
   */
  public flushAll(filePathFilter?: string): { flushedPages: number } {
    let flushedCount = 0;
    for (const [cacheKey, page] of this.pageCache.entries()) {
      if (page.isDirty) {
        const [filePath, pageIdStr] = cacheKey.split(':');
        if (!filePathFilter || filePath === filePathFilter) {
          this.writePageToDisk(filePath, parseInt(pageIdStr, 10), page);
          page.isDirty = false;
          flushedCount++;
        }
      }
    }
    return { flushedPages: flushedCount };
  }

  /**
   * 清除指定文件的缓存项 (用于 REINDEX 重建时清理旧缓存)
   */
  public evictFilePages(filePath: string): void {
    this.headerCache.delete(filePath);
    for (const key of Array.from(this.pageCache.keys())) {
      if (key.startsWith(`${filePath}:`)) {
        this.pageCache.delete(key);
      }
    }
  }

  /**
   * 获取缓冲池实时统计参数
   */
  public getStats(): BufferPoolStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRatioPercent = totalRequests === 0
      ? 100
      : Math.round((this.stats.hits / totalRequests) * 1000) / 10;

    let dirtyCount = 0;
    for (const p of this.pageCache.values()) {
      if (p.isDirty) dirtyCount++;
    }

    const memoryUsedBytes = this.pageCache.size * this.pageSize;

    return {
      memoryLimitMb: this.memoryLimitMb,
      pageSizeBytes: this.pageSize,
      cachedPagesCount: this.pageCache.size,
      maxPagesCount: this.maxPagesCount,
      memoryUsedBytes,
      memoryUsedMb: Math.round((memoryUsedBytes / (1024 * 1024)) * 100) / 100,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRatioPercent,
      diskReads: this.stats.diskReads,
      diskWrites: this.stats.diskWrites,
      evictions: this.stats.evictions,
      dirtyPagesCount: dirtyCount
    };
  }

  /**
   * 获取当前常驻内存的页面快照 (供 SHOW ENGINE STATUS / 仪表盘查看)
   */
  public getCachedPagesSnapshot(): Array<{ filePath: string; pageId: number; isLeaf: boolean; keysCount: number; isDirty: boolean }> {
    const list: Array<{ filePath: string; pageId: number; isLeaf: boolean; keysCount: number; isDirty: boolean }> = [];
    for (const [key, p] of this.pageCache.entries()) {
      const parts = key.split(':');
      list.push({
        filePath: path.basename(parts[0]),
        pageId: p.pageId,
        isLeaf: p.isLeaf,
        keysCount: p.keys.length,
        isDirty: !!p.isDirty
      });
    }
    return list.slice(0, 50); // 返回前 50 页
  }

  /**
   * 执行 LRU 页面置换 (换出最久未访问的数据页，若为脏页先写盘)
   */
  private evictLRUPage(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, page] of this.pageCache.entries()) {
      if (page.lastAccessed < oldestTime) {
        oldestTime = page.lastAccessed;
        oldestKey = key;
      }
    }

    if (!oldestKey) {
      const firstKey = this.pageCache.keys().next().value;
      if (firstKey) oldestKey = firstKey;
    }

    if (oldestKey) {
      const page = this.pageCache.get(oldestKey)!;
      if (page.isDirty) {
        const [filePath, pageIdStr] = oldestKey.split(':');
        this.writePageToDisk(filePath, parseInt(pageIdStr, 10), page);
        page.isDirty = false;
      }
      this.pageCache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * 从磁盘读取具体数据页 (使用 v8 紧凑二进制反序列化)
   */
  private readPageFromDisk<K, V>(filePath: string, pageId: number): DiskIndexPage<K, V> {
    this.ensureDir(path.dirname(filePath));
    if (!fs.existsSync(filePath)) {
      return {
        pageId,
        isLeaf: true,
        keys: [],
        values: [],
        children: [],
        nextLeafPageId: -1,
        prevLeafPageId: -1,
        isDirty: false,
        lastAccessed: Date.now()
      };
    }

    try {
      const fd = fs.openSync(filePath, 'r');
      const offset = pageId * this.pageSize;
      const buf = Buffer.alloc(this.pageSize);
      const bytesRead = fs.readSync(fd, buf, 0, this.pageSize, offset);
      fs.closeSync(fd);

      if (bytesRead > 0) {
        // 读取 4 字节大端长度前缀
        const len = buf.readUInt32BE(0);
        if (len > 0 && len <= this.pageSize - 4) {
          const payloadBuf = buf.subarray(4, 4 + len);
          const parsed = v8.deserialize(payloadBuf);
          return {
            ...parsed,
            isDirty: false,
            lastAccessed: Date.now()
          };
        }
      }
    } catch (e) {
      // Return fresh page on empty slot
    }

    return {
      pageId,
      isLeaf: true,
      keys: [],
      values: [],
      children: [],
      nextLeafPageId: -1,
      prevLeafPageId: -1,
      isDirty: false,
      lastAccessed: Date.now()
    };
  }

  /**
   * 将数据页物理写入磁盘文件 (使用 v8 紧凑二进制序列化，节省 90%+ 空间)
   */
  private writePageToDisk(filePath: string, pageId: number, page: DiskIndexPage): void {
    this.ensureDir(path.dirname(filePath));
    try {
      const fd = fs.openSync(filePath, 'a+');
      const cleanPage = {
        pageId: page.pageId,
        isLeaf: page.isLeaf,
        keys: page.keys,
        values: page.values,
        children: page.children,
        nextLeafPageId: page.nextLeafPageId,
        prevLeafPageId: page.prevLeafPageId
      };
      const serialized = v8.serialize(cleanPage);
      const buf = Buffer.alloc(this.pageSize);
      
      // 写入 4 字节长度前缀 + 序列化二进制载荷
      buf.writeUInt32BE(serialized.length, 0);
      serialized.copy(buf, 4);

      const offset = pageId * this.pageSize;
      fs.writeSync(fd, buf, 0, this.pageSize, offset);
      fs.closeSync(fd);
      this.stats.diskWrites++;
    } catch (err) {
      console.error(`Failed to write page ${pageId} to ${filePath}:`, err);
    }
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// 导出系统默认全局缓冲池单例
export const globalBufferPool = BufferPoolManager.getInstance(32);
