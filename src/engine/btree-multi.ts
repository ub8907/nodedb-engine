/**
 * 二级列多值 B-树索引 (Secondary Multi-value B-Tree Index)
 * 
 * 核心特性：
 * 1. 允许重复键值：单键映射至主键集合 Key -> Set<PK>
 * 2. 精确查找：search(key) -> 返回该索引值对应的所有主键列表
 * 3. 范围查询：range(minKey, maxKey) -> 借助 B-树的有序性高效遍历子树，合并主键并集
 * 4. 动态维护：当某键对应的主键集合变空时，自动在 B-树中删除该键节点
 */

import { BTree } from './btree.ts';

export interface RangeQueryOptions {
  includeMin?: boolean;
  includeMax?: boolean;
}

export class BTreeMultiIndex<K = any, PK = any> {
  private tree: BTree<K, Set<PK>>;
  private readonly columnName: string;
  private totalEntries: number = 0;

  constructor(columnName: string, degree: number = 3, comparator?: (a: K, b: K) => number) {
    this.columnName = columnName;
    this.tree = new BTree<K, Set<PK>>(degree, comparator);
  }

  /** 获取索引对应的二级列名 */
  public get column(): string {
    return this.columnName;
  }

  /** 获取不重复键的去重数量 */
  public get distinctKeys(): number {
    return this.tree.size;
  }

  /** 获取索引中存储的总记录映射数 */
  public get size(): number {
    return this.totalEntries;
  }

  /** 清空多值索引 */
  public clear(): void {
    this.tree.clear();
    this.totalEntries = 0;
  }

  /**
   * 插入二级索引键到主键 PK 的映射
   * @param key 二级列数值
   * @param pk 主键 ID
   */
  public insert(key: K, pk: PK): void {
    if (key === undefined || key === null) return;

    const searchRes = this.tree.search(key);
    if (searchRes.found && searchRes.value) {
      const set = searchRes.value as Set<PK>;
      if (!set.has(pk)) {
        set.add(pk);
        this.totalEntries++;
      }
    } else {
      const newSet = new Set<PK>();
      newSet.add(pk);
      this.tree.insert(key, newSet);
      this.totalEntries++;
    }
  }

  /**
   * 移除二级索引映射关系
   */
  public remove(key: K, pk: PK): boolean {
    if (key === undefined || key === null) return false;

    const searchRes = this.tree.search(key);
    if (!searchRes.found || !searchRes.value) return false;

    const set = searchRes.value as Set<PK>;
    const deleted = set.delete(pk);
    if (deleted) {
      this.totalEntries--;
      if (set.size === 0) {
        this.tree.delete(key);
      }
    }
    return deleted;
  }

  /**
   * 精确查找：返回满足 key = target 的所有记录主键
   */
  public search(key: K): { pks: PK[]; comparisons: number; depth: number } {
    const res = this.tree.search(key);
    return {
      pks: res.found && res.value ? Array.from(res.value as Set<PK>) : [],
      comparisons: res.comparisons,
      depth: res.depth
    };
  }

  /**
   * 区间范围查询：[minKey, maxKey]
   * 遍历 B-树中序子区间，合并返回匹配主键集合
   */
  public range(
    minKey: K | null,
    maxKey: K | null,
    options: RangeQueryOptions = {}
  ): { pks: PK[]; matchedKeys: number; comparisons: number } {
    const { includeMin = true, includeMax = true } = options;
    const entries = this.tree.range(minKey, maxKey, includeMin, includeMax);
    
    const pkSet = new Set<PK>();
    for (const entry of entries) {
      for (const pk of entry.value) {
        pkSet.add(pk);
      }
    }

    return {
      pks: Array.from(pkSet),
      matchedKeys: entries.length,
      comparisons: entries.length + (this.tree.getHeight() * 2)
    };
  }

  /** 获取所有排序后的键值主键映射列表 */
  public inOrder(): Array<{ key: K; pks: PK[] }> {
    return this.tree.inOrder().map(item => ({
      key: item.key,
      pks: Array.from(item.value)
    }));
  }

  /**
   * 二级多值索引游标遍历 (返回按二级列排序的主键列表，支持分页)
   */
  public inOrderPkCursor(
    offset: number = 0,
    limit: number = 50,
    direction: 'ASC' | 'DESC' = 'ASC'
  ): PK[] {
    const pks: PK[] = [];
    if (limit <= 0) return pks;

    let skipped = 0;
    // 获取足够的键集合
    const entries = this.tree.inOrderCursor(0, offset + limit * 10, direction);
    for (const entry of entries) {
      for (const pk of entry.value) {
        if (skipped < offset) {
          skipped++;
        } else {
          pks.push(pk);
          if (pks.length >= limit) return pks;
        }
      }
    }
    return pks;
  }

  /** 获取可视化树节点 */
  public getVisualTree() {
    return this.tree.getVisualTree();
  }
}
