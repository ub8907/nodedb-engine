/**
 * 自建多阶平衡 B-树引擎 (Self-Implemented B-Tree, Order t)
 * 
 * 核心性质与数学不变量：
 * 1. 最小度数 t (t >= 2)：
 *    - 每个内部节点（除根外）最少包含 t - 1 个键，最多包含 2t - 1 个键
 *    - 含有 k 个键的内部节点，严格拥有 k + 1 个子节点指针
 *    - 根节点非空时最少包含 1 个键，最多包含 2t - 1 个键
 * 2. 严格的平衡性：所有叶子节点处于树的完全相同深度 (depth)
 * 3. 性能指标：
 *    - 精确点查查找：O(log N)
 *    - 键值插入（配合中序主动分裂）：O(log N)
 *    - 键值删除（处理前驱/后继借键与子树合并）：O(log N)
 *    - 范围区间扫描 (Range Scan)：O(log N + K)
 */

export interface BTreeSearchStats {
  found: boolean;
  value?: any;
  comparisons: number;
  depth: number;
  visitedNodes: string[];
}

export interface BTreeVisualNode {
  id: string;
  keys: Array<{ key: any; value: any }>;
  isLeaf: boolean;
  depth: number;
  children: BTreeVisualNode[];
}

let nodeIdCounter = 0;

/**
 * B-树节点类
 */
export class BTreeNode<K, V> {
  id: string;
  keys: K[];
  values: V[];
  children: BTreeNode<K, V>[];
  isLeaf: boolean;

  constructor(isLeaf: boolean = true) {
    this.id = `node_${++nodeIdCounter}`;
    this.keys = [];
    this.values = [];
    this.children = [];
    this.isLeaf = isLeaf;
  }
}

/**
 * 自建 B-树主类
 */
export class BTree<K = any, V = any> {
  private root: BTreeNode<K, V> | null = null;
  private readonly t: number; // 树的最小度数 (Minimum Degree)
  private keyCount: number = 0;
  private readonly comparator: (a: K, b: K) => number;

  constructor(t: number = 3, comparator?: (a: K, b: K) => number) {
    if (t < 2) {
      throw new Error('B-树最小度数 t 必须 >= 2');
    }
    this.t = t;
    this.comparator = comparator || this.defaultComparator;
  }

  private defaultComparator(a: K, b: K): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /** 获取树中存储的总键数量 */
  public get size(): number {
    return this.keyCount;
  }

  /** 获取树的最小度数 t */
  public get degree(): number {
    return this.t;
  }

  /** 清空树中所有节点 */
  public clear(): void {
    this.root = null;
    this.keyCount = 0;
  }

  /**
   * 精确查找键 (带深度与节点比较次数的遥测统计)
   * @param key 目标键
   */
  public search(key: K): BTreeSearchStats {
    const stats: BTreeSearchStats = {
      found: false,
      comparisons: 0,
      depth: 0,
      visitedNodes: []
    };

    if (!this.root) return stats;

    let current: BTreeNode<K, V> | null = this.root;
    let currentDepth = 0;

    while (current) {
      stats.visitedNodes.push(current.id);
      currentDepth++;

      let i = 0;
      while (i < current.keys.length) {
        stats.comparisons++;
        const cmp = this.comparator(key, current.keys[i]);
        if (cmp === 0) {
          stats.found = true;
          stats.value = current.values[i];
          stats.depth = currentDepth;
          return stats;
        }
        if (cmp < 0) {
          break;
        }
        i++;
      }

      if (current.isLeaf) {
        stats.depth = currentDepth;
        return stats;
      }

      current = current.children[i];
    }

    stats.depth = currentDepth;
    return stats;
  }

  /**
   * 插入键值对
   * 采用前向主动分裂法：若根节点已满 (2t-1 个键)，树高主动增加 1
   */
  public insert(key: K, value: V): void {
    if (!this.root) {
      this.root = new BTreeNode<K, V>(true);
      this.root.keys.push(key);
      this.root.values.push(value);
      this.keyCount++;
      return;
    }

    // 根节点满时，主动创建新根并分裂旧根
    if (this.root.keys.length === 2 * this.t - 1) {
      const newRoot = new BTreeNode<K, V>(false);
      newRoot.children.push(this.root);
      this.splitChild(newRoot, 0, this.root);
      this.root = newRoot;
    }

    this.insertNonFull(this.root, key, value);
  }

  /**
   * 向未满节点中递归插入
   */
  private insertNonFull(node: BTreeNode<K, V>, key: K, value: V): void {
    let i = node.keys.length - 1;

    if (node.isLeaf) {
      // 若叶子中已存在相同键，更新其对应值
      for (let j = 0; j < node.keys.length; j++) {
        if (this.comparator(key, node.keys[j]) === 0) {
          node.values[j] = value;
          return;
        }
      }

      // 保持叶子节点有序插入
      while (i >= 0 && this.comparator(key, node.keys[i]) < 0) {
        i--;
      }
      node.keys.splice(i + 1, 0, key);
      node.values.splice(i + 1, 0, value);
      this.keyCount++;
    } else {
      // 内部节点：定位子树指针
      while (i >= 0 && this.comparator(key, node.keys[i]) < 0) {
        i--;
      }
      i++;

      // 若内部节点直接匹配键，更新对应值
      if (i > 0 && this.comparator(key, node.keys[i - 1]) === 0) {
        node.values[i - 1] = value;
        return;
      }

      // 下降前若发现子节点已满，提前分裂
      if (node.children[i].keys.length === 2 * this.t - 1) {
        this.splitChild(node, i, node.children[i]);
        if (this.comparator(key, node.keys[i]) > 0) {
          i++;
        }
      }

      this.insertNonFull(node.children[i], key, value);
    }
  }

  /**
   * 分裂已满子节点 y（其中位数提取上升至父节点 x）
   */
  private splitChild(x: BTreeNode<K, V>, i: number, y: BTreeNode<K, V>): void {
    const z = new BTreeNode<K, V>(y.isLeaf);
    const t = this.t;

    // 位于索引 (t - 1) 的中位键将提拔上升至父节点
    const medianKey = y.keys[t - 1];
    const medianValue = y.values[t - 1];

    // z 分配获得 y 后半部分的 (t - 1) 个键
    z.keys = y.keys.splice(t);
    z.values = y.values.splice(t);

    // 若 y 为内部节点，z 同样继承后半部分的 t 个子指针
    if (!y.isLeaf) {
      z.children = y.children.splice(t);
    }

    // 弹出提取中位键
    y.keys.pop();
    y.values.pop();

    // 将新节点 z 挂入父节点子指针数组
    x.children.splice(i + 1, 0, z);

    // 中位键插入父节点对应位置
    x.keys.splice(i, 0, medianKey);
    x.values.splice(i, 0, medianValue);
  }

  /**
   * 从 B-树中删除指定键
   */
  public delete(key: K): boolean {
    if (!this.root) return false;

    const initialCount = this.keyCount;
    this.deleteInternal(this.root, key);

    // 根节点键数归零时，树高收缩
    if (this.root.keys.length === 0) {
      if (this.root.isLeaf) {
        this.root = null;
      } else {
        this.root = this.root.children[0];
      }
    }

    return this.keyCount < initialCount;
  }

  private deleteInternal(node: BTreeNode<K, V>, key: K): void {
    const t = this.t;
    let idx = 0;
    while (idx < node.keys.length && this.comparator(node.keys[idx], key) < 0) {
      idx++;
    }

    // 命中当前节点
    if (idx < node.keys.length && this.comparator(node.keys[idx], key) === 0) {
      if (node.isLeaf) {
        // 场景 1：键在叶子节点中，直接移除
        node.keys.splice(idx, 1);
        node.values.splice(idx, 1);
        this.keyCount--;
      } else {
        // 场景 2：键在内部节点中
        this.deleteFromInternalNode(node, idx);
      }
    } else {
      // 场景 3：键在子树中
      if (node.isLeaf) {
        return; // 树中不存在该键
      }

      // 下降前确保子节点拥有至少 t 个键，不足时借键或合并
      const isLastChild = (idx === node.keys.length);
      if (node.children[idx].keys.length < t) {
        this.fillChild(node, idx);
      }

      if (isLastChild && idx > node.keys.length) {
        this.deleteInternal(node.children[idx - 1], key);
      } else {
        this.deleteInternal(node.children[idx], key);
      }
    }
  }

  private deleteFromInternalNode(node: BTreeNode<K, V>, idx: number): void {
    const t = this.t;
    const key = node.keys[idx];

    // 场景 2a：左子节点至少包含 t 个键，寻找直接前驱替换
    if (node.children[idx].keys.length >= t) {
      const pred = this.getPredecessor(node.children[idx]);
      node.keys[idx] = pred.key;
      node.values[idx] = pred.value;
      this.deleteInternal(node.children[idx], pred.key);
    }
    // 场景 2b：右子节点至少包含 t 个键，寻找直接后继替换
    else if (node.children[idx + 1].keys.length >= t) {
      const succ = this.getSuccessor(node.children[idx + 1]);
      node.keys[idx] = succ.key;
      node.values[idx] = succ.value;
      this.deleteInternal(node.children[idx + 1], succ.key);
    }
    // 场景 2c：左右子节点键数均为 t-1，执行子节点合并
    else {
      this.mergeChildren(node, idx);
      this.deleteInternal(node.children[idx], key);
    }
  }

  private getPredecessor(node: BTreeNode<K, V>): { key: K; value: V } {
    let curr = node;
    while (!curr.isLeaf) {
      curr = curr.children[curr.children.length - 1];
    }
    const lastIdx = curr.keys.length - 1;
    return { key: curr.keys[lastIdx], value: curr.values[lastIdx] };
  }

  private getSuccessor(node: BTreeNode<K, V>): { key: K; value: V } {
    let curr = node;
    while (!curr.isLeaf) {
      curr = curr.children[0];
    }
    return { key: curr.keys[0], value: curr.values[0] };
  }

  private fillChild(node: BTreeNode<K, V>, idx: number): void {
    const t = this.t;

    // 向左兄弟节点借键
    if (idx !== 0 && node.children[idx - 1].keys.length >= t) {
      this.borrowFromPrev(node, idx);
    }
    // 向右兄弟节点借键
    else if (idx !== node.children.length - 1 && node.children[idx + 1].keys.length >= t) {
      this.borrowFromNext(node, idx);
    }
    // 与兄弟节点合并
    else {
      if (idx !== node.children.length - 1) {
        this.mergeChildren(node, idx);
      } else {
        this.mergeChildren(node, idx - 1);
      }
    }
  }

  private borrowFromPrev(node: BTreeNode<K, V>, idx: number): void {
    const child = node.children[idx];
    const sibling = node.children[idx - 1];

    child.keys.unshift(node.keys[idx - 1]);
    child.values.unshift(node.values[idx - 1]);

    if (!child.isLeaf) {
      child.children.unshift(sibling.children.pop()!);
    }

    node.keys[idx - 1] = sibling.keys.pop()!;
    node.values[idx - 1] = sibling.values.pop()!;
  }

  private borrowFromNext(node: BTreeNode<K, V>, idx: number): void {
    const child = node.children[idx];
    const sibling = node.children[idx + 1];

    child.keys.push(node.keys[idx]);
    child.values.push(node.values[idx]);

    if (!child.isLeaf) {
      child.children.push(sibling.children.shift()!);
    }

    node.keys[idx] = sibling.keys.shift()!;
    node.values[idx] = sibling.values.shift()!;
  }

  private mergeChildren(node: BTreeNode<K, V>, idx: number): void {
    const child = node.children[idx];
    const sibling = node.children[idx + 1];

    child.keys.push(node.keys[idx]);
    child.values.push(node.values[idx]);

    child.keys.push(...sibling.keys);
    child.values.push(...sibling.values);

    if (!child.isLeaf) {
      child.children.push(...sibling.children);
    }

    node.keys.splice(idx, 1);
    node.values.splice(idx, 1);
    node.children.splice(idx + 1, 1);
  }

  /**
   * 中序区间范围查询 [minKey, maxKey]
   */
  public range(
    minKey: K | null,
    maxKey: K | null,
    includeMin: boolean = true,
    includeMax: boolean = true
  ): Array<{ key: K; value: V }> {
    const results: Array<{ key: K; value: V }> = [];
    if (!this.root) return results;

    this.rangeTraverse(this.root, minKey, maxKey, includeMin, includeMax, results);
    return results;
  }

  private rangeTraverse(
    node: BTreeNode<K, V>,
    minKey: K | null,
    maxKey: K | null,
    includeMin: boolean,
    includeMax: boolean,
    results: Array<{ key: K; value: V }>
  ): void {
    let i = 0;
    while (i < node.keys.length) {
      const k = node.keys[i];

      if (!node.isLeaf) {
        if (minKey === null || this.comparator(k, minKey) >= 0) {
          this.rangeTraverse(node.children[i], minKey, maxKey, includeMin, includeMax, results);
        }
      }

      const matchesMin = minKey === null || (includeMin ? this.comparator(k, minKey) >= 0 : this.comparator(k, minKey) > 0);
      const matchesMax = maxKey === null || (includeMax ? this.comparator(k, maxKey) <= 0 : this.comparator(k, maxKey) < 0);

      if (matchesMin && matchesMax) {
        results.push({ key: k, value: node.values[i] });
      }

      if (maxKey !== null && this.comparator(k, maxKey) > 0) {
        return;
      }

      i++;
    }

    if (!node.isLeaf) {
      this.rangeTraverse(node.children[i], minKey, maxKey, includeMin, includeMax, results);
    }
  }

  /** 获取全树中序有序排列集合 */
  public inOrder(): Array<{ key: K; value: V }> {
    return this.range(null, null);
  }

  /**
   * 中序游标分页查询 (跳过 offset，获取至多 limit 条，支持 ASC / DESC)
   * 采用早停逻辑 (Early Termination)，避免全树遍历与海量内存分配
   */
  public inOrderCursor(
    offset: number = 0,
    limit: number = 50,
    direction: 'ASC' | 'DESC' = 'ASC'
  ): Array<{ key: K; value: V }> {
    const results: Array<{ key: K; value: V }> = [];
    if (!this.root || limit <= 0) return results;

    let skipped = 0;

    const traverseAsc = (node: BTreeNode<K, V>): boolean => {
      let i = 0;
      while (i < node.keys.length) {
        if (!node.isLeaf) {
          if (traverseAsc(node.children[i])) return true;
        }

        if (skipped < offset) {
          skipped++;
        } else {
          results.push({ key: node.keys[i], value: node.values[i] });
          if (results.length >= limit) return true;
        }
        i++;
      }

      if (!node.isLeaf) {
        if (traverseAsc(node.children[i])) return true;
      }
      return false;
    };

    const traverseDesc = (node: BTreeNode<K, V>): boolean => {
      let i = node.keys.length - 1;
      if (!node.isLeaf) {
        if (traverseDesc(node.children[i + 1])) return true;
      }

      while (i >= 0) {
        if (skipped < offset) {
          skipped++;
        } else {
          results.push({ key: node.keys[i], value: node.values[i] });
          if (results.length >= limit) return true;
        }

        if (!node.isLeaf) {
          if (traverseDesc(node.children[i])) return true;
        }
        i--;
      }
      return false;
    };

    if (direction === 'DESC') {
      traverseDesc(this.root);
    } else {
      traverseAsc(this.root);
    }

    return results;
  }

  /**
   * 获取用于前端渲染的层次树模型 (限定最大深度 3 与子节点上限，防止大数据量序列化耗尽内存)
   */
  public getVisualTree(maxDepth: number = 3): BTreeVisualNode | null {
    if (!this.root) return null;
    return this.buildVisualNode(this.root, 0, maxDepth);
  }

  private buildVisualNode(node: BTreeNode<K, V>, depth: number, maxDepth: number = 3): BTreeVisualNode {
    const visualKeys = node.keys.slice(0, 10).map((k, idx) => ({
      key: k,
      value: node.values[idx]
    }));

    return {
      id: node.id,
      keys: visualKeys,
      isLeaf: node.isLeaf,
      depth,
      children: (node.isLeaf || depth >= maxDepth)
        ? []
        : node.children.slice(0, 6).map(c => this.buildVisualNode(c, depth + 1, maxDepth))
    };
  }

  /** 计算当前树的层数/高度 */
  public getHeight(): number {
    if (!this.root) return 0;
    let height = 1;
    let curr = this.root;
    while (!curr.isLeaf) {
      height++;
      curr = curr.children[0];
    }
    return height;
  }
}
