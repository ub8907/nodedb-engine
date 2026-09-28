/**
 * 高性能有界 Top-K 堆排序引擎 (Bounded Top-K Priority Queue & Paged Heap)
 * 专为海量数据分页查询 (LIMIT offset, count) 与 ORDER BY 设计：
 * 将全量 O(N log N) 内存排序复杂度骤降至 O(N log K)，内存消耗从 O(N) 缩减至 O(K)。
 */

export class TopKHeap<T> {
  private heap: T[];
  private readonly capacity: number;
  private readonly compare: (a: T, b: T) => number;

  constructor(k: number, compare: (a: T, b: T) => number, isAscending: boolean = true) {
    this.capacity = Math.max(1, k);
    this.heap = [];
    // 若希望最终结果升序 (ASC)，则堆维护前 K 小元素，堆顶为其中的最大者 (Max-Heap)
    // 反之降序 (DESC) 时维护前 K 大元素，堆顶为其中的最小者 (Min-Heap)
    this.compare = isAscending ? (a, b) => compare(a, b) : (a, b) => -compare(a, b);
  }

  public get size(): number {
    return this.heap.length;
  }

  public add(item: T): void {
    if (this.heap.length < this.capacity) {
      this.heap.push(item);
      this.siftUp(this.heap.length - 1);
    } else if (this.compare(item, this.heap[0]) < 0) {
      this.heap[0] = item;
      this.siftDown(0);
    }
  }

  public extractSorted(): T[] {
    const result: T[] = [...this.heap];
    result.sort(this.compare);
    return result;
  }

  private siftUp(index: number): void {
    let curr = index;
    while (curr > 0) {
      const parent = (curr - 1) >> 1;
      if (this.compare(this.heap[curr], this.heap[parent]) > 0) {
        const tmp = this.heap[curr];
        this.heap[curr] = this.heap[parent];
        this.heap[parent] = tmp;
        curr = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let curr = index;
    const len = this.heap.length;
    while (true) {
      let largest = curr;
      const left = (curr << 1) + 1;
      const right = left + 1;

      if (left < len && this.compare(this.heap[left], this.heap[largest]) > 0) {
        largest = left;
      }
      if (right < len && this.compare(this.heap[right], this.heap[largest]) > 0) {
        largest = right;
      }

      if (largest !== curr) {
        const tmp = this.heap[curr];
        this.heap[curr] = this.heap[largest];
        this.heap[largest] = tmp;
        curr = largest;
      } else {
        break;
      }
    }
  }
}

/**
 * 高性能 Top-K 分页数据选择器
 * @param items 可迭代数据源
 * @param totalCount 数据源总行数预估
 * @param offset 偏移量
 * @param limit 每页数量
 * @param compare 比较器
 * @param isAscending 是否升序
 */
export function selectTopK<T>(
  items: Iterable<T>,
  totalCount: number,
  offset: number,
  limit: number,
  compare: (a: T, b: T) => number,
  isAscending: boolean = true
): T[] {
  const k = offset + limit;
  if (k <= 0) return [];

  // 如果总数较小或 K 较大 (> 60% 总数)，直接快速排序
  if (totalCount < 200 || k >= totalCount * 0.6) {
    const arr = Array.isArray(items) ? [...items] : Array.from(items);
    arr.sort(isAscending ? compare : (a, b) => -compare(a, b));
    return arr.slice(offset, offset + limit);
  }

  const heap = new TopKHeap<T>(k, compare, isAscending);
  for (const item of items) {
    heap.add(item);
  }

  const sortedK = heap.extractSorted();
  return sortedK.slice(offset, offset + limit);
}
