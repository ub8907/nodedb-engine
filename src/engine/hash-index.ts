/**
 * 唯一列哈希索引 (Unique Column Hash Index)
 * 
 * 核心特性：
 * 1. O(1) 常数时间复杂度点查查找
 * 2. 严格唯一性约束拦截：插入时若存在同名异主键冲突，主动抛出 UniqueConstraintError
 * 3. 支撑自动生成的 Base62 唯一短键及业务唯一列 (如 email, username, order_no)
 */

/**
 * 唯一性约束冲突异常
 */
export class UniqueConstraintError extends Error {
  public readonly column: string;
  public readonly value: any;
  public readonly existingPk: any;

  constructor(column: string, value: any, existingPk: any) {
    super(`唯一性约束校验失败：列 "${column}" 的键值 ${JSON.stringify(value)} 已被主键 ${existingPk} 占用`);
    this.name = 'UniqueConstraintError';
    this.column = column;
    this.value = value;
    this.existingPk = existingPk;
  }
}

/**
 * 唯一列哈希索引管理类
 */
export class HashIndex<K = any, PK = any> {
  private map: Map<string, { rawKey: K; pk: PK }>;
  private readonly columnName: string;

  constructor(columnName: string) {
    this.columnName = columnName;
    this.map = new Map();
  }

  /** 获取索引所绑定的列名 */
  public get column(): string {
    return this.columnName;
  }

  /** 获取当前哈希索引存储的条目数 */
  public get size(): number {
    return this.map.size;
  }

  /** 清空哈希索引 */
  public clear(): void {
    this.map.clear();
  }

  /** 序列化键以支持多类型混合匹配 */
  private serializeKey(key: K): string {
    if (typeof key === 'string') return `s:${key}`;
    if (typeof key === 'number') return `n:${key}`;
    if (typeof key === 'boolean') return `b:${key}`;
    return `j:${JSON.stringify(key)}`;
  }

  /**
   * 插入唯一键映射 key -> PK
   * 若键已存在且映射至不同 PK，抛出 UniqueConstraintError
   */
  public insert(key: K, pk: PK): void {
    if (key === undefined || key === null) return;

    const serialized = this.serializeKey(key);
    const existing = this.map.get(serialized);
    if (existing) {
      if (existing.pk !== pk) {
        throw new UniqueConstraintError(this.columnName, key, existing.pk);
      }
      return;
    }

    this.map.set(serialized, { rawKey: key, pk });
  }

  /**
   * O(1) 查询唯一键对应的记录主键 PK
   */
  public get(key: K): { found: boolean; pk?: PK } {
    if (key === undefined || key === null) return { found: false };
    const serialized = this.serializeKey(key);
    const entry = this.map.get(serialized);
    if (entry) {
      return { found: true, pk: entry.pk };
    }
    return { found: false };
  }

  /**
   * 检查唯一键是否存在
   */
  public has(key: K): boolean {
    if (key === undefined || key === null) return false;
    return this.map.has(this.serializeKey(key));
  }

  /**
   * 删除指定的唯一索引条目
   */
  public delete(key: K): boolean {
    if (key === undefined || key === null) return false;
    return this.map.delete(this.serializeKey(key));
  }

  /**
   * 导出所有唯一索引键值对
   */
  public entries(): Array<{ key: K; pk: PK }> {
    return Array.from(this.map.values()).map(v => ({ key: v.rawKey, pk: v.pk }));
  }

  /**
   * 遥测统计信息
   */
  public getStats() {
    return {
      entriesCount: this.map.size,
      memoryEstimateBytes: this.map.size * 64
    };
  }
}
