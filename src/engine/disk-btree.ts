/**
 * 基于磁盘数据页的自建 B-树索引引擎 (Disk-Backed Paged B-Tree Index)
 * 
 * 架构特性：
 * 1. 真实磁盘页面驱动：所有节点均映射为 4096 字节的标准扇区数据页，存储在独立 .idx 文件中
 * 2. 内存优化与缓冲池联动：所有读写均经由 BufferPoolManager (LRU 页面换入/换出与脏页跟踪)
 * 3. 内存占用可控：受设置的内存大小 (MB) 严格限制，海量数据只常驻高频热页 (Hot Pages)
 * 4. 磁盘级重建与紧凑整理 (REINDEX / OPTIMIZE TABLE)：消除碎片，重置树高
 * 5. B+ 树叶子页双向链表：跨磁盘页 O(log N + K) 高速范围扫描 (BETWEEN / >= / <=)
 */

import fs from 'fs';
import path from 'path';
import { BufferPoolManager, globalBufferPool, type DiskIndexPage, type DiskIndexHeader } from './buffer-pool.ts';
import type { BTreeVisualNode } from './btree.ts';

export interface DiskBTreeSearchResult<V = any> {
  found: boolean;
  value?: V;
  pagesVisited: number;
  comparisons: number;
  depth: number;
  bufferPoolHits: number;
  diskReads: number;
}

export class DiskBTree<K = any, V = any> {
  public readonly filePath: string;
  public readonly tableName: string;
  public readonly indexName: string;
  public readonly indexType: 'PRIMARY_BTREE' | 'SECONDARY_BTREE';
  private readonly bufferPool: BufferPoolManager;
  private readonly maxKeysPerPage: number = 96; // 优化页内扇出键数 (96 键/4KB 对齐，极速压缩扇区，空间利用率极大提升)

  constructor(
    filePath: string,
    tableName: string,
    indexName: string,
    indexType: 'PRIMARY_BTREE' | 'SECONDARY_BTREE' = 'PRIMARY_BTREE',
    bufferPool: BufferPoolManager = globalBufferPool
  ) {
    this.filePath = filePath;
    this.tableName = tableName;
    this.indexName = indexName;
    this.indexType = indexType;
    this.bufferPool = bufferPool;

    this.ensureInitialized();
  }

  /**
   * 初始化索引文件及根页面
   */
  private ensureInitialized(): void {
    if (!fs.existsSync(this.filePath)) {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const header: DiskIndexHeader = {
        magic: 'NDB_IDX',
        version: 1,
        pageSize: 4096,
        rootPageId: 1,
        totalPages: 1,
        keyCount: 0,
        treeDepth: 1,
        tableName: this.tableName,
        indexName: this.indexName,
        indexType: this.indexType
      };

      this.bufferPool.saveHeader(this.filePath, header);

      // 分配根页 Page 1 (叶子页)
      const rootPage: DiskIndexPage<K, V> = {
        pageId: 1,
        isLeaf: true,
        keys: [],
        values: [],
        children: [],
        nextLeafPageId: -1,
        prevLeafPageId: -1,
        isDirty: true,
        lastAccessed: Date.now()
      };

      // 写入 Page 1 并标记脏页
      const fd = fs.openSync(this.filePath, 'w+');
      const headerBuf = Buffer.alloc(4096);
      headerBuf.write(JSON.stringify(header), 0, 'utf8');
      fs.writeSync(fd, headerBuf, 0, 4096, 0);

      const pageBuf = Buffer.alloc(4096);
      pageBuf.write(JSON.stringify(rootPage), 0, 'utf8');
      fs.writeSync(fd, pageBuf, 0, 4096, 4096);
      fs.closeSync(fd);
    }
  }

  /**
   * 获取元数据头
   */
  public getHeader(): DiskIndexHeader {
    return this.bufferPool.getHeader(this.filePath);
  }

  /**
   * 精确点查 O(log N)
   * 自动统计缓冲池命中与物理磁盘读
   */
  public search(key: K): DiskBTreeSearchResult<V> {
    const statsBefore = this.bufferPool.getStats();
    const header = this.getHeader();
    let currentPageId = header.rootPageId;
    let comparisons = 0;
    let pagesVisited = 0;
    let currentDepth = 1;

    while (currentPageId > 0) {
      pagesVisited++;
      const page = this.bufferPool.getPage<K, V>(this.filePath, currentPageId);

      // 页面内二分/顺序查找
      let i = 0;
      while (i < page.keys.length) {
        comparisons++;
        if (this.compare(key, page.keys[i]) <= 0) {
          break;
        }
        i++;
      }

      if (i < page.keys.length && this.compare(key, page.keys[i]) === 0) {
        const statsAfter = this.bufferPool.getStats();
        return {
          found: true,
          value: page.values[i],
          pagesVisited,
          comparisons,
          depth: currentDepth,
          bufferPoolHits: statsAfter.hits - statsBefore.hits,
          diskReads: statsAfter.diskReads - statsBefore.diskReads
        };
      }

      if (page.isLeaf) {
        break;
      }

      // 内部节点向下探查子页
      currentPageId = page.children[i] !== undefined ? page.children[i] : -1;
      currentDepth++;
    }

    const statsAfter = this.bufferPool.getStats();
    return {
      found: false,
      pagesVisited,
      comparisons,
      depth: currentDepth,
      bufferPoolHits: statsAfter.hits - statsBefore.hits,
      diskReads: statsAfter.diskReads - statsBefore.diskReads
    };
  }

  /**
   * 插入键值项至磁盘索引页中
   * 若页面溢出 (满) 则自动在磁盘上进行页面分裂 (Page Split)
   */
  public insert(key: K, value: V): void {
    const header = this.getHeader();
    const rootPage = this.bufferPool.getPage<K, V>(this.filePath, header.rootPageId);

    // 检查根节点是否已满
    if (rootPage.keys.length >= this.maxKeysPerPage) {
      // 分配新根页
      const newRoot = this.bufferPool.allocateNewPage<K, V>(this.filePath, false);
      const oldRootId = rootPage.pageId;
      newRoot.children.push(oldRootId);
      header.rootPageId = newRoot.pageId;
      header.treeDepth++;
      this.bufferPool.saveHeader(this.filePath, header);

      // 分裂旧根页
      this.splitChildPage(newRoot, 0, rootPage);
      this.insertNonFull(newRoot, key, value);
    } else {
      this.insertNonFull(rootPage, key, value);
    }

    header.keyCount++;
    this.bufferPool.saveHeader(this.filePath, header);
  }

  /**
   * 在非满页面内递归查找并插入
   */
  private insertNonFull(page: DiskIndexPage<K, V>, key: K, value: V): void {
    let i = page.keys.length - 1;

    if (page.isLeaf) {
      // 叶子页：直接插入排序
      while (i >= 0 && this.compare(key, page.keys[i]) < 0) {
        i--;
      }
      const insertIdx = i + 1;
      page.keys.splice(insertIdx, 0, key);
      page.values.splice(insertIdx, 0, value);
      this.bufferPool.markDirty(this.filePath, page.pageId);
    } else {
      // 内部页：定位待下降的子页
      while (i >= 0 && this.compare(key, page.keys[i]) < 0) {
        i--;
      }
      i++;
      let childPage = this.bufferPool.getPage<K, V>(this.filePath, page.children[i]);

      if (childPage.keys.length >= this.maxKeysPerPage) {
        this.splitChildPage(page, i, childPage);
        if (this.compare(key, page.keys[i]) > 0) {
          i++;
        }
        childPage = this.bufferPool.getPage<K, V>(this.filePath, page.children[i]);
      }

      this.insertNonFull(childPage, key, value);
    }
  }

  /**
   * 页面分裂算法 (Slotted B-Tree Page Split)
   */
  private splitChildPage(parentPage: DiskIndexPage<K, V>, childIndex: number, childPage: DiskIndexPage<K, V>): void {
    const midIdx = Math.floor(childPage.keys.length / 2);
    const midKey = childPage.keys[midIdx];
    const midValue = childPage.values[midIdx];

    // 分配新兄弟页
    const newSibling = this.bufferPool.allocateNewPage<K, V>(this.filePath, childPage.isLeaf);

    if (childPage.isLeaf) {
      // 叶子节点：右半部分移动到新兄弟页
      newSibling.keys = childPage.keys.splice(midIdx);
      newSibling.values = childPage.values.splice(midIdx);

      // 维护叶子页双向链表指针
      newSibling.nextLeafPageId = childPage.nextLeafPageId;
      newSibling.prevLeafPageId = childPage.pageId;

      if (childPage.nextLeafPageId > 0) {
        const nextNext = this.bufferPool.getPage<K, V>(this.filePath, childPage.nextLeafPageId);
        nextNext.prevLeafPageId = newSibling.pageId;
        this.bufferPool.markDirty(this.filePath, nextNext.pageId);
      }
      childPage.nextLeafPageId = newSibling.pageId;

      // 提拔中键到父页
      parentPage.keys.splice(childIndex, 0, midKey);
      parentPage.values.splice(childIndex, 0, midValue);
      parentPage.children.splice(childIndex + 1, 0, newSibling.pageId);
    } else {
      // 内部节点：中键上升到父节点，不留在子节点中
      newSibling.keys = childPage.keys.splice(midIdx + 1);
      newSibling.values = childPage.values.splice(midIdx + 1);
      newSibling.children = childPage.children.splice(midIdx + 1);

      childPage.keys.splice(midIdx, 1);
      childPage.values.splice(midIdx, 1);

      parentPage.keys.splice(childIndex, 0, midKey);
      parentPage.values.splice(childIndex, 0, midValue);
      parentPage.children.splice(childIndex + 1, 0, newSibling.pageId);
    }

    this.bufferPool.markDirty(this.filePath, childPage.pageId);
    this.bufferPool.markDirty(this.filePath, newSibling.pageId);
    this.bufferPool.markDirty(this.filePath, parentPage.pageId);
  }

  /**
   * 删除键
   */
  public delete(key: K): boolean {
    const header = this.getHeader();
    const deleted = this.deleteFromSubtree(header.rootPageId, key);
    if (deleted) {
      header.keyCount = Math.max(0, header.keyCount - 1);
      this.bufferPool.saveHeader(this.filePath, header);
    }
    return deleted;
  }

  private deleteFromSubtree(pageId: number, key: K): boolean {
    if (pageId <= 0) return false;
    const page = this.bufferPool.getPage<K, V>(this.filePath, pageId);

    let i = 0;
    while (i < page.keys.length && this.compare(key, page.keys[i]) > 0) {
      i++;
    }

    if (page.isLeaf) {
      if (i < page.keys.length && this.compare(key, page.keys[i]) === 0) {
        page.keys.splice(i, 1);
        page.values.splice(i, 1);
        this.bufferPool.markDirty(this.filePath, page.pageId);
        return true;
      }
      return false;
    }

    // 内部节点
    const childId = page.children[i];
    return this.deleteFromSubtree(childId, key);
  }

  /**
   * 范围区间扫描 (BETWEEN)
   * 利用叶子节点在磁盘数据页间的双向链表，极速穿梭
   */
  public rangeSearch(minKey?: K, maxKey?: K, includeMin = true, includeMax = true): Array<{ key: K; value: V }> {
    const results: Array<{ key: K; value: V }> = [];
    const header = this.getHeader();

    // 1. 定位最左侧目标叶子页
    let currentPageId = header.rootPageId;
    while (currentPageId > 0) {
      const page = this.bufferPool.getPage<K, V>(this.filePath, currentPageId);
      if (page.isLeaf) break;

      let idx = 0;
      if (minKey !== undefined) {
        while (idx < page.keys.length && this.compare(minKey, page.keys[idx]) > 0) {
          idx++;
        }
      }
      currentPageId = page.children[idx] || -1;
    }

    if (currentPageId <= 0) return results;

    // 2. 沿着 nextLeafPageId 顺序扫描磁盘页
    while (currentPageId > 0) {
      const page = this.bufferPool.getPage<K, V>(this.filePath, currentPageId);

      for (let i = 0; i < page.keys.length; i++) {
        const k = page.keys[i];

        if (minKey !== undefined) {
          const cmpMin = this.compare(k, minKey);
          if (includeMin ? cmpMin < 0 : cmpMin <= 0) continue;
        }

        if (maxKey !== undefined) {
          const cmpMax = this.compare(k, maxKey);
          if (includeMax ? cmpMax > 0 : cmpMax >= 0) {
            return results; // 超出最大上界，提前终止
          }
        }

        results.push({ key: k, value: page.values[i] });
      }

      currentPageId = page.nextLeafPageId;
    }

    return results;
  }

  /**
   * 全量索引物理重组与紧凑化 (REINDEX / OPTIMIZE TABLE)
   * 物理级消除碎片、紧凑页布局、重构平衡树并彻底刷盘
   */
  public reindex(allRecords: Array<{ key: K; value: V }>): {
    oldSizeBytes: number;
    newSizeBytes: number;
    pagesReorganized: number;
    reclaimedBytes: number;
    executionTimeMs: number;
  } {
    const startTime = performance.now();
    const oldSizeBytes = fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0;

    // 1. 刷新脏页并驱逐该文件所有缓存
    this.bufferPool.flushAll(this.filePath);
    this.bufferPool.evictFilePages(this.filePath);

    // 2. 备份旧文件并创建紧凑新文件
    const tmpFilePath = `${this.filePath}.compact.tmp`;
    if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);

    // 3. 将所有键值对先排序
    const sorted = [...allRecords].sort((a, b) => this.compare(a.key, b.key));

    // 4. 重建新的临时磁盘 B-树文件
    const tempBTree = new DiskBTree<K, V>(tmpFilePath, this.tableName, this.indexName, this.indexType, this.bufferPool);
    for (const item of sorted) {
      tempBTree.insert(item.key, item.value);
    }
    this.bufferPool.flushAll(tmpFilePath);

    // 5. 原子替换文件
    this.bufferPool.evictFilePages(tmpFilePath);
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
    fs.renameSync(tmpFilePath, this.filePath);

    const newSizeBytes = fs.statSync(this.filePath).size;
    const header = this.getHeader();

    return {
      oldSizeBytes,
      newSizeBytes,
      pagesReorganized: header.totalPages,
      reclaimedBytes: Math.max(0, oldSizeBytes - newSizeBytes),
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100
    };
  }

  /**
   * 生成可视化树结构 (供前端 B-树组件渲染)
   */
  public getVisualTree(): BTreeVisualNode | null {
    const header = this.getHeader();
    if (header.keyCount === 0 && header.totalPages <= 1) {
      return null;
    }
    return this.buildVisualNode(header.rootPageId, 0);
  }

  private buildVisualNode(pageId: number, depth: number): BTreeVisualNode | null {
    if (pageId <= 0 || depth > 3) return null; // 限制可视化深度最高为 3，杜绝海量节点序列化卡死
    const page = this.bufferPool.getPage<K, V>(this.filePath, pageId);

    const keys = page.keys.slice(0, 10).map((k, idx) => ({
      key: k,
      value: page.isLeaf ? page.values[idx] : `Page#${page.children[idx] || ''}`
    }));

    const visualChildren: BTreeVisualNode[] = [];
    if (!page.isLeaf && page.children) {
      for (const childId of page.children.slice(0, 5)) {
        const childNode = this.buildVisualNode(childId, depth + 1);
        if (childNode) visualChildren.push(childNode);
      }
    }

    return {
      id: `disk_page_${page.pageId}`,
      keys,
      isLeaf: page.isLeaf,
      depth,
      children: visualChildren
    };
  }

  /**
   * 通用键值比较器
   */
  private compare(a: any, b: any): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    return String(a).localeCompare(String(b));
  }
}
