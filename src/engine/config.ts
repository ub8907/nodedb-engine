/**
 * NodeDB 数据库核心配置文件
 * 包含：存储防护、自建 B-树阶数、自增主键规则、时间有序 Base62 唯一短键生成配置
 */

export interface NodeDBConfig {
  /** 存储底层配置 */
  storage: {
    /** 主数据文件存储路径 */
    dataPath: string;
    /** 自动备份文件路径 (.bak) */
    backupPath: string;
    /** 排他独占锁文件路径 (.lock) */
    lockPath: string;
    /** 原子写入临时文件路径 (.tmp) */
    tempPath: string;
    /** 是否启用 IEEE 802.3 标准 CRC32 校验码防护 */
    enableCrc32: boolean;
    /** 是否启用物理磁盘硬件刷盘 (fsync) */
    enableFsync: boolean;
    /** 是否启用原子写入 (.tmp -> fsync -> rename) */
    enableAtomicWrite: boolean;
    /** 是否启用灾难备份 (.bak)，默认严格关闭以节省小内存/小磁盘服务器开销与I/O延迟 */
    enableBackup: boolean;
    /** 块级分页存储单块目标行数 (默认 500 行，单块仅 ~16KB-64KB，实现启动零OOM) */
    chunkRowSize: number;
    /** 最大内存预算 (MB) */
    maxMemoryMb: number;
    /** 独占锁超时判定时间 (毫秒)，防止死锁 */
    lockTimeoutMs: number;
  };
  /** 索引架构配置 */
  index: {
    /** 自建 B-树默认最小度数 t (每个节点最少 t-1 个键，最多 2t-1 个键) */
    defaultBTreeDegree: number;
    /** 启动或灾备恢复时是否由校验通过的数据逐条在内存中重建所有索引 */
    rebuildOnStartup: boolean;
    /** 唯一哈希索引初始容量 */
    uniqueHashCapacity: number;
  };
  /** 自增主键配置 (遵循 SQLite AUTOINCREMENT 规范) */
  autoIncrement: {
    /** 初始自增计数器起始值 */
    initialNextId: number;
    /** 删除记录后严格禁止复用历史主键 ID，确保存储历史完整性 */
    strictlyNeverReuse: boolean;
    /** 自增计数器每表独立并在存储文件中持久化 */
    persistInStorage: boolean;
  };
  /** 时间有序 Base62 简短唯一键配置 */
  base62ShortKey: {
    /** 插入记录未显式指定短键时是否自动生成 */
    autoGenerateOnInsert: boolean;
    /** 前置时间戳 Base62 编码长度 (补零对齐确保字典序等于时间序) */
    timePartLength: number;
    /** 后置 (计数器 ⊕ PID) 熵池编码长度 */
    entropyPartLength: number;
    /** 发生唯一索引冲突时的最大重试次数 */
    maxCollisionRetries: number;
  };
}

/** 默认配置实例 */
export const DEFAULT_CONFIG: NodeDBConfig = {
  storage: {
    dataPath: './data/nodedb.dat',
    backupPath: './data/nodedb.dat.bak',
    lockPath: './data/nodedb.dat.lock',
    tempPath: './data/nodedb.dat.tmp',
    enableCrc32: true,
    enableFsync: true,
    enableAtomicWrite: true,
    enableBackup: false,
    chunkRowSize: 500,
    maxMemoryMb: 32,
    lockTimeoutMs: 30000
  },
  index: {
    defaultBTreeDegree: 3,
    rebuildOnStartup: true,
    uniqueHashCapacity: 1024
  },
  autoIncrement: {
    initialNextId: 1,
    strictlyNeverReuse: true,
    persistInStorage: true
  },
  base62ShortKey: {
    autoGenerateOnInsert: true,
    timePartLength: 9,
    entropyPartLength: 4,
    maxCollisionRetries: 10
  }
};
