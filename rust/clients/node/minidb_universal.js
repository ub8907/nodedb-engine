/**
 * Node.js 跨语言通用客户端 (Universal Node.js Client - Zero Build / Zero Dependencies)
 * 
 * 核心优势：
 * 1. 0 个 npm 依赖包，0 个 C/C++ 编译器要求，无 node-gyp 报错烦恼！
 * 2. 通过标准子进程管道 (stdio IPC) 与 Rust 编译好的单个可执行文件进行流式 JSON-RPC 通信。
 * 3. 内存与稳定性全隔离，数据库内核采用纯磁盘索引二分检索，全流程极速且超低内存。
 */

import { spawn } from 'child_process';
import readline from 'readline';

export class MiniDBClient {
  constructor(dbPath, binPath = 'minidb-cli') {
    this.dbPath = dbPath;
    this.binPath = binPath;
    this.process = null;
    this.rl = null;
    this.pendingRequests = new Map();
    this.seqId = 1;
    this.isReady = false;
    this.init();
  }

  init() {
    this.process = spawn(this.binPath, [this.dbPath, 'stdio'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.rl = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const msg = JSON.parse(trimmed);
        if (msg.ready) {
          this.isReady = true;
          return;
        }

        const id = msg.id;
        if (id && this.pendingRequests.has(id)) {
          const { resolve, reject } = this.pendingRequests.get(id);
          this.pendingRequests.delete(id);

          if (msg.error) {
            reject(new Error(msg.error));
          } else {
            resolve(msg.result !== undefined ? msg.result : msg);
          }
        }
      } catch (err) {
        // ignore malformed lines
      }
    });

    this.process.stderr.on('data', (data) => {
      // 捕获 Rust 端的错误输出
      console.error(`[MiniDB Engine STDERR]: ${data.toString()}`);
    });

    this.process.on('close', (code) => {
      for (const { reject } of this.pendingRequests.values()) {
        reject(new Error(`MiniDB 守护进程意外退出，退出码: ${code}`));
      }
      this.pendingRequests.clear();
    });
  }

  send(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = this.seqId++;
      const req = { id, action, ...payload };
      this.pendingRequests.set(id, { resolve, reject });

      const line = JSON.stringify(req) + '\n';
      this.process.stdin.write(line);
    });
  }

  /**
   * 批量插入数据 (500 行自动切块压缩落盘)
   */
  async insertBatch(rows) {
    const res = await this.send('insert', { rows });
    return res.inserted;
  }

  /**
   * 磁盘原地二分查找单条主键 (零内存索引，响应 < 1ms)
   */
  async findByPk(pk) {
    const res = await this.send('find', { pk: Number(pk) });
    return res;
  }

  /**
   * 分页游标直查
   */
  async queryPaged(page = 1, pageSize = 20) {
    const res = await this.send('page', { page, pageSize });
    return res;
  }

  /**
   * 获取元数据与文件规格
   */
  async getStats() {
    const res = await this.send('stats');
    return res.stats;
  }

  /**
   * 关闭释放连接
   */
  close() {
    if (this.process) {
      this.process.stdin.end();
      this.process.kill();
      this.process = null;
    }
  }
}
