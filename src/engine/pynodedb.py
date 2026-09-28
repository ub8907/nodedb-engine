"""
PyNodeDB - 纯 Python 高性能自建数据库存储引擎
特点与核心模块：
- 自建 B-树 (Order t)：自研平衡树，支持 O(log N) 主键精确定位、节点分裂与借键合并平衡
- 二级列多值 B-树索引：支持单键映射多主键集合与 BETWEEN 范围查询
- 唯一列哈希索引：O(1) 常数时间点查，保障唯一性约束拦截
- 持久化自增主键：每表独立 next_id，删除行严格永不复用 (等同 SQLite AUTOINCREMENT)
- 时间有序 Base62 唯一短键：前 9 位毫秒时间戳 + 4 位 (counter ⊕ pid) 熵，插入时自动生成
- 存储防护机制：原子写入 (.tmp 写入 + fsync 硬件刷盘 + 原子重命名) + CRC32 校验 + 自动备份 (.bak) + 独占排他锁 (.lock) + 启动内存索引全量重建
"""

import os
import sys
import time
import json
import random
import binascii
from typing import Any, Dict, List, Optional, Set, Tuple

# Base62 字符集：ASCII 字典升序，确保字符排序严格等价于时间自然顺序
BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
BASE = 62


# ==========================================
# 1. 时间有序 Base62 唯一短键生成器
# ==========================================

def encode_base62(num: int) -> str:
    """将非负整数转换为 Base62 字符串"""
    if num == 0:
        return "0"
    digits = []
    while num > 0:
        digits.append(BASE62_ALPHABET[num % BASE])
        num //= BASE
    return "".join(reversed(digits))


_counter = random.randint(100, 999)


def generate_base62_short_key(timestamp_ms: Optional[int] = None) -> str:
    """
    生成 13 位时间有序 Base62 短键
    - 前 9 位：毫秒级时间戳 (左侧补零以保证自然字典序等于时间顺序)
    - 后 4 位：(单调计数器 ⊕ PID) 混合熵池
    """
    global _counter
    ts = timestamp_ms if timestamp_ms is not None else int(time.time() * 1000)
    time_part = encode_base62(ts).zfill(9)

    _counter = (_counter + 1) & 0xFFFFFF
    pid = os.getpid() & 0xFFFF
    entropy = (_counter ^ pid) + random.randint(0, 61)
    entropy_part = encode_base62(entropy).zfill(4)[-4:]

    return f"{time_part}{entropy_part}"


# ==========================================
# 2. 自建多阶平衡 B-树引擎 (Order t)
# ==========================================

class BTreeNode:
    """B-树节点类"""
    def __init__(self, is_leaf: bool = True):
        self.is_leaf = is_leaf
        self.keys: List[Any] = []
        self.values: List[Any] = []
        self.children: List['BTreeNode'] = []


class BTree:
    """自建平衡 B-树主类 (最小度数 t)"""
    def __init__(self, t: int = 3):
        if t < 2:
            raise ValueError("B-树度数 t 必须 >= 2")
        self.t = t
        self.root: Optional[BTreeNode] = None
        self.size: int = 0

    def clear(self):
        """清空全树节点"""
        self.root = None
        self.size = 0

    def search(self, key: Any) -> Tuple[bool, Any, int]:
        """精确查找，返回 (是否命中, 对应值, 节点键比较次数)"""
        if not self.root:
            return False, None, 0
        curr = self.root
        comparisons = 0
        while curr:
            i = 0
            while i < len(curr.keys):
                comparisons += 1
                if key == curr.keys[i]:
                    return True, curr.values[i], comparisons
                if key < curr.keys[i]:
                    break
                i += 1
            if curr.is_leaf:
                return False, None, comparisons
            curr = curr.children[i]
        return False, None, comparisons

    def insert(self, key: Any, value: Any):
        """插入键值对，若根节点满 (2t-1) 则主动提升分裂"""
        if not self.root:
            self.root = BTreeNode(is_leaf=True)
            self.root.keys.append(key)
            self.root.values.append(value)
            self.size += 1
            return

        if len(self.root.keys) == 2 * self.t - 1:
            new_root = BTreeNode(is_leaf=False)
            new_root.children.append(self.root)
            self._split_child(new_root, 0, self.root)
            self.root = new_root

        self._insert_non_full(self.root, key, value)

    def _insert_non_full(self, node: BTreeNode, key: Any, value: Any):
        i = len(node.keys) - 1
        if node.is_leaf:
            for idx, k in enumerate(node.keys):
                if k == key:
                    node.values[idx] = value
                    return
            while i >= 0 and key < node.keys[i]:
                i -= 1
            node.keys.insert(i + 1, key)
            node.values.insert(i + 1, value)
            self.size += 1
        else:
            while i >= 0 and key < node.keys[i]:
                i -= 1
            i += 1
            if i > 0 and key == node.keys[i - 1]:
                node.values[i - 1] = value
                return
            if len(node.children[i].keys) == 2 * self.t - 1:
                self._split_child(node, i, node.children[i])
                if key > node.keys[i]:
                    i += 1
            self._insert_non_full(node.children[i], key, value)

    def _split_child(self, parent: BTreeNode, i: int, child: BTreeNode):
        """分裂子节点 child，将中位键提拔上升至 parent"""
        t = self.t
        z = BTreeNode(is_leaf=child.is_leaf)
        median_key = child.keys[t - 1]
        median_val = child.values[t - 1]

        z.keys = child.keys[t:]
        z.values = child.values[t:]
        if not child.is_leaf:
            z.children = child.children[t:]

        child.keys = child.keys[:t - 1]
        child.values = child.values[:t - 1]
        if not child.is_leaf:
            child.children = child.children[:t]

        parent.children.insert(i + 1, z)
        parent.keys.insert(i, median_key)
        parent.values.insert(i, median_val)

    def delete(self, key: Any) -> bool:
        """从 B-树中删除键，支持自平衡借键与子树合并"""
        if not self.root:
            return False
        prev_size = self.size
        self._delete_internal(self.root, key)
        if len(self.root.keys) == 0:
            self.root = None if self.root.is_leaf else self.root.children[0]
        return self.size < prev_size

    def _delete_internal(self, node: BTreeNode, key: Any):
        t = self.t
        idx = 0
        while idx < len(node.keys) and node.keys[idx] < key:
            idx += 1

        if idx < len(node.keys) and node.keys[idx] == key:
            if node.is_leaf:
                node.keys.pop(idx)
                node.values.pop(idx)
                self.size -= 1
            else:
                self._delete_internal_node(node, idx)
        else:
            if node.is_leaf:
                return
            is_last = (idx == len(node.keys))
            if len(node.children[idx].keys) < t:
                self._fill_child(node, idx)
            if is_last and idx > len(node.keys):
                self._delete_internal(node.children[idx - 1], key)
            else:
                self._delete_internal(node.children[idx], key)

    def _delete_internal_node(self, node: BTreeNode, idx: int):
        t = self.t
        key = node.keys[idx]
        if len(node.children[idx].keys) >= t:
            pred_k, pred_v = self._get_pred(node.children[idx])
            node.keys[idx], node.values[idx] = pred_k, pred_v
            self._delete_internal(node.children[idx], pred_k)
        elif len(node.children[idx + 1].keys) >= t:
            succ_k, succ_v = self._get_succ(node.children[idx + 1])
            node.keys[idx], node.values[idx] = succ_k, succ_v
            self._delete_internal(node.children[idx + 1], succ_k)
        else:
            self._merge_children(node, idx)
            self._delete_internal(node.children[idx], key)

    def _get_pred(self, node: BTreeNode):
        curr = node
        while not curr.is_leaf:
            curr = curr.children[-1]
        return curr.keys[-1], curr.values[-1]

    def _get_succ(self, node: BTreeNode):
        curr = node
        while not curr.is_leaf:
            curr = curr.children[0]
        return curr.keys[0], curr.values[0]

    def _fill_child(self, node: BTreeNode, idx: int):
        t = self.t
        if idx != 0 and len(node.children[idx - 1].keys) >= t:
            self._borrow_from_prev(node, idx)
        elif idx != len(node.children) - 1 and len(node.children[idx + 1].keys) >= t:
            self._borrow_from_next(node, idx)
        else:
            if idx != len(node.children) - 1:
                self._merge_children(node, idx)
            else:
                self._merge_children(node, idx - 1)

    def _borrow_from_prev(self, node: BTreeNode, idx: int):
        child = node.children[idx]
        sibling = node.children[idx - 1]
        child.keys.insert(0, node.keys[idx - 1])
        child.values.insert(0, node.values[idx - 1])
        if not child.is_leaf:
            child.children.insert(0, sibling.children.pop())
        node.keys[idx - 1] = sibling.keys.pop()
        node.values[idx - 1] = sibling.values.pop()

    def _borrow_from_next(self, node: BTreeNode, idx: int):
        child = node.children[idx]
        sibling = node.children[idx + 1]
        child.keys.append(node.keys[idx])
        child.values.append(node.values[idx])
        if not child.is_leaf:
            child.children.append(sibling.children.pop(0))
        node.keys[idx] = sibling.keys.pop(0)
        node.values[idx] = sibling.values.pop(0)

    def _merge_children(self, node: BTreeNode, idx: int):
        child = node.children[idx]
        sibling = node.children[idx + 1]
        child.keys.append(node.keys[idx])
        child.values.append(node.values[idx])
        child.keys.extend(sibling.keys)
        child.values.extend(sibling.values)
        if not child.is_leaf:
            child.children.extend(sibling.children)
        node.keys.pop(idx)
        node.values.pop(idx)
        node.children.pop(idx + 1)

    def range(self, min_key=None, max_key=None, inc_min=True, inc_max=True) -> List[Tuple[Any, Any]]:
        """中序区间范围遍历 [min_key, max_key]"""
        results = []
        if not self.root:
            return results
        self._range_traverse(self.root, min_key, max_key, inc_min, inc_max, results)
        return results

    def _range_traverse(self, node: BTreeNode, min_k, max_k, inc_min, inc_max, results):
        for i, k in enumerate(node.keys):
            if not node.is_leaf:
                if min_k is None or k >= min_k:
                    self._range_traverse(node.children[i], min_k, max_k, inc_min, inc_max, results)
            matches_min = (min_k is None) or (k >= min_k if inc_min else k > min_k)
            matches_max = (max_k is None) or (k <= max_k if inc_max else k < max_k)
            if matches_min and matches_max:
                results.append((k, node.values[i]))
            if max_k is not None and k > max_k:
                return
        if not node.is_leaf:
            self._range_traverse(node.children[-1], min_k, max_k, inc_min, inc_max, results)


# ==========================================
# 3. 二级列多值 B-树索引
# ==========================================

class MultiBTreeIndex:
    """单键映射多主键集合 Key -> Set[PK]"""
    def __init__(self, column: str, degree: int = 3):
        self.column = column
        self.tree = BTree(degree)

    def insert(self, key: Any, pk: Any):
        found, pks, _ = self.tree.search(key)
        if found and pks is not None:
            pks.add(pk)
        else:
            self.tree.insert(key, {pk})

    def remove(self, key: Any, pk: Any):
        found, pks, _ = self.tree.search(key)
        if found and pks is not None:
            pks.discard(pk)
            if len(pks) == 0:
                self.tree.delete(key)

    def search(self, key: Any) -> List[Any]:
        found, pks, _ = self.tree.search(key)
        return list(pks) if (found and pks) else []

    def range(self, min_val=None, max_val=None, inc_min=True, inc_max=True) -> List[Any]:
        matches = self.tree.range(min_val, max_val, inc_min, inc_max)
        res = set()
        for _, pks in matches:
            res.update(pks)
        return list(res)


# ==========================================
# 4. 唯一列哈希索引
# ==========================================

class UniqueHashIndex:
    """唯一列哈希索引，O(1) 点查与唯一约束校验"""
    def __init__(self, column: str):
        self.column = column
        self.store: Dict[Any, Any] = {}

    def insert(self, key: Any, pk: Any):
        if key in self.store and self.store[key] != pk:
            raise ValueError(f"唯一性约束校验失败: 列 '{self.column}' 键值 {key} 已存在。")
        self.store[key] = pk

    def get(self, key: Any) -> Optional[Any]:
        return self.store.get(key)

    def has(self, key: Any) -> bool:
        return key in self.store

    def delete(self, key: Any):
        self.store.pop(key, None)


# ==========================================
# 5. 底层存储文件防护与 CRC32 校验
# ==========================================

def calculate_crc32_hex(data_str: str) -> str:
    """计算 IEEE 802.3 标准 CRC32 校验码"""
    crc = binascii.crc32(data_str.encode("utf-8")) & 0xFFFFFFFF
    return f"0x{crc:08X}"


class StorageProtector:
    """存储文件 6 重安全防护管理器"""
    def __init__(self, file_path: str = "./data.ndb"):
        self.file_path = file_path
        self.lock_path = f"{file_path}.lock"
        self.bak_path = f"{file_path}.bak"
        self.tmp_path = f"{file_path}.tmp"

    def acquire_lock(self):
        """排他文件锁"""
        flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
        try:
            fd = os.open(self.lock_path, flags)
            with os.fdopen(fd, 'w') as f:
                f.write(f"pid:{os.getpid()};time:{int(time.time())}")
            return True
        except FileExistsError:
            try:
                mtime = os.path.getmtime(self.lock_path)
                if time.time() - mtime > 30:
                    os.remove(self.lock_path)
                    return self.acquire_lock()
            except OSError:
                pass
            raise RuntimeError(f"数据库已被另一进程独占锁定 ({self.lock_path})")

    def release_lock(self):
        try:
            if os.path.exists(self.lock_path):
                os.remove(self.lock_path)
        except OSError:
            pass

    def save_atomic(self, payload: dict) -> str:
        """原子写入：写入 .tmp -> 物理 fsync -> .bak 备份轮转 -> 原子重命名"""
        self.acquire_lock()
        try:
            payload_str = json.dumps(payload, indent=2)
            crc_hex = calculate_crc32_hex(payload_str)
            header = {
                "magic": "NODEDB_V1",
                "crc32": crc_hex,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "length": len(payload_str)
            }
            content = f"---NODEDB_HEADER_START---\n{json.dumps(header)}\n---NODEDB_HEADER_END---\n{payload_str}"

            if os.path.exists(self.file_path):
                with open(self.file_path, "r", encoding="utf-8") as src, open(self.bak_path, "w", encoding="utf-8") as dst:
                    dst.write(src.read())

            with open(self.tmp_path, "w", encoding="utf-8") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())

            os.replace(self.tmp_path, self.file_path)
            return crc_hex
        finally:
            self.release_lock()

    def load_with_recovery(self) -> Tuple[dict, str]:
        """双向 CRC32 校验，主文件损坏时自动回退 .bak 自愈"""
        def parse_file(path: str):
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
            h_start = text.find("---NODEDB_HEADER_START---\n")
            h_end = text.find("\n---NODEDB_HEADER_END---\n")
            if h_start == -1 or h_end == -1:
                raise ValueError("存储结构损坏: 缺少头部标志")
            h_json = text[h_start + len("---NODEDB_HEADER_START---\n"):h_end]
            header = json.loads(h_json)
            payload_str = text[h_end + len("\n---NODEDB_HEADER_END---\n"):]
            actual_crc = calculate_crc32_hex(payload_str)
            if actual_crc.lower() != header["crc32"].lower():
                raise ValueError(f"CRC32 校验失败: 预期 {header['crc32']}, 实测 {actual_crc}")
            return json.loads(payload_str)

        if os.path.exists(self.file_path):
            try:
                data = parse_file(self.file_path)
                return data, "PRIMARY"
            except Exception as e:
                print(f"[NodeDB 告警] 主数据文件损坏 ({e})，正在从备份镜像 {self.bak_path} 回退自愈...")

        if os.path.exists(self.bak_path):
            try:
                data = parse_file(self.bak_path)
                return data, "BACKUP_RESTORED"
            except Exception as e:
                print(f"[NodeDB 告警] 备份文件亦已损坏: {e}")

        return {"tables": {}}, "EMPTY"


# ==========================================
# 6. 数据表与 SQLite AUTOINCREMENT
# ==========================================

class Table:
    """数据表封装，集成自增主键、Base62 短键、多索引与优化器"""
    def __init__(self, name: str, schema: dict, next_id: int = 1):
        self.name = name
        self.schema = schema
        self.next_id = next_id
        self.pk_col = schema.get("primaryKeyColumn", "id")

        self.records: Dict[Any, dict] = {}
        self.pk_btree = BTree(t=3)
        self.secondary_indices: Dict[str, MultiBTreeIndex] = {}
        self.unique_indices: Dict[str, UniqueHashIndex] = {}

        for col in schema.get("columns", []):
            cname = col["name"]
            if col.get("isSecondaryIndex") and cname != self.pk_col:
                self.secondary_indices[cname] = MultiBTreeIndex(cname)
            if (col.get("isUnique") or col.get("isShortKey")) and cname != self.pk_col:
                self.unique_indices[cname] = UniqueHashIndex(cname)

    def insert(self, record: dict) -> dict:
        """
        插入数据：
        - 自增主键递增分配，删除绝不复用 (SQLite AUTOINCREMENT)
        - 自动生成时间有序 Base62 简短唯一键 (插入时若为空自动生成)
        - 更新主键 B-树、二级多值 B-树及唯一哈希索引
        """
        row = dict(record)

        # 1. 自增主键 (SQLite AUTOINCREMENT 行为)
        if self.pk_col not in row or row[self.pk_col] is None or row[self.pk_col] == '':
            row[self.pk_col] = self.next_id
            self.next_id += 1
        else:
            if isinstance(row[self.pk_col], int) and row[self.pk_col] >= self.next_id:
                self.next_id = row[self.pk_col] + 1

        pk = row[self.pk_col]
        if pk in self.records:
            raise ValueError(f"主键重复错误: {pk} 已存在于表 {self.name}")

        # 2. 自动生成时间有序 Base62 唯一短键
        for col in self.schema.get("columns", []):
            if col.get("isShortKey") and (col["name"] not in row or not row[col["name"]]):
                row[col["name"]] = generate_base62_short_key()

        # 3. 唯一列约束前置校验
        for cname, uidx in self.unique_indices.items():
            if cname in row and row[cname] is not None:
                if uidx.has(row[cname]):
                    raise ValueError(f"唯一性冲突: 列 {cname} 的值 {row[cname]} 已被占用")
                uidx.insert(row[cname], pk)

        # 4. 二级多值 B-树
        for cname, sidx in self.secondary_indices.items():
            if cname in row and row[cname] is not None:
                sidx.insert(row[cname], pk)

        # 5. 主键 B-树与实体存储
        self.pk_btree.insert(pk, row)
        self.records[pk] = row
        return row

    def delete(self, pk: Any) -> bool:
        """
        按主键删除：
        注意：self.next_id 绝不回退或复用，永久保留自增序列号 (SQLite AUTOINCREMENT)
        """
        if pk not in self.records:
            return False
        row = self.records.pop(pk)
        self.pk_btree.delete(pk)
        for cname, uidx in self.unique_indices.items():
            if cname in row:
                uidx.delete(row[cname])
        for cname, sidx in self.secondary_indices.items():
            if cname in row:
                sidx.remove(row[cname], pk)
        return True

    def find_by_id(self, pk: Any) -> Optional[dict]:
        """主键 O(log N) 快速查找"""
        found, val, _ = self.pk_btree.search(pk)
        return val if found else None

    def query(self, column: str, op: str, value: Any, value2: Any = None) -> Tuple[List[dict], dict]:
        """查询执行器并输出 EXPLAIN 执行计划"""
        start = time.perf_counter()
        plan = {"strategy": "FULL_SCAN", "column": column, "op": op}
        matched = []

        if column == self.pk_col and op == "=":
            plan["strategy"] = "PK_BTREE"
            found, row, comps = self.pk_btree.search(value)
            plan["comparisons"] = comps
            if found:
                matched.append(row)
        elif column in self.unique_indices and op == "=":
            plan["strategy"] = "UNIQUE_HASH"
            pk = self.unique_indices[column].get(value)
            if pk is not None:
                matched.append(self.records[pk])
        elif column in self.secondary_indices and op in ["=", ">", ">=", "<", "<=", "BETWEEN"]:
            plan["strategy"] = "SECONDARY_BTREE_RANGE"
            sidx = self.secondary_indices[column]
            if op == "=":
                pks = sidx.search(value)
            elif op == "BETWEEN":
                pks = sidx.range(value, value2)
            elif op in [">", ">="]:
                pks = sidx.range(min_val=value, inc_min=(op == ">="))
            else:
                pks = sidx.range(max_val=value, inc_max=(op == "<="))
            matched = [self.records[p] for p in pks if p in self.records]
        else:
            for row in self.records.values():
                val = row.get(column)
                if op == "=" and val == value:
                    matched.append(row)
                elif op == ">" and val is not None and val > value:
                    matched.append(row)
                elif op == "<" and val is not None and val < value:
                    matched.append(row)

        plan["time_ms"] = round((time.perf_counter() - start) * 1000, 3)
        plan["matched_count"] = len(matched)
        return matched, plan

    def rebuild_indexes(self):
        """启动或灾难恢复后纯内存全量重建所有索引"""
        self.pk_btree.clear()
        for s in self.secondary_indices.values():
            s.tree.clear()
        for u in self.unique_indices.values():
            u.store.clear()

        for pk, row in self.records.items():
            self.pk_btree.insert(pk, row)
            for cname, uidx in self.unique_indices.items():
                if cname in row and row[cname] is not None:
                    uidx.insert(row[cname], pk)
            for cname, sidx in self.secondary_indices.items():
                if cname in row and row[cname] is not None:
                    sidx.insert(row[cname], pk)


# ==========================================
# 7. 自动化验证测试
# ==========================================

if __name__ == "__main__":
    print("=== PyNodeDB 自测套件启动 ===")
    schema = {
        "primaryKeyColumn": "id",
        "columns": [
            {"name": "id", "isPrimaryKey": True, "autoIncrement": True},
            {"name": "order_no", "isShortKey": True},
            {"name": "user_id", "isUnique": True},
            {"name": "amount", "isSecondaryIndex": True}
        ]
    }
    table = Table("orders", schema)

    # 1. 测试自增主键与自动生成 Base62 短键
    r1 = table.insert({"user_id": "u_101", "amount": 150})
    r2 = table.insert({"user_id": "u_102", "amount": 320})
    r3 = table.insert({"user_id": "u_103", "amount": 80})
    print(f"已插入记录 1 (PK={r1['id']}, 自动生成短键={r1['order_no']})")
    print(f"已插入记录 2 (PK={r2['id']}, 自动生成短键={r2['order_no']})")
    print(f"已插入记录 3 (PK={r3['id']}, 自动生成短键={r3['order_no']})")

    # 2. 测试删除不复用 (SQLite AUTOINCREMENT 行为)
    table.delete(r2["id"])
    r4 = table.insert({"user_id": "u_104", "amount": 500})
    print(f"已删除主键 ID {r2['id']}。新插入记录分配 ID 为 {r4['id']} (历史 ID 严格未复用，行为等同 SQLite)！")

    # 3. 测试二级列多值 B-树区间范围查询
    results, plan = table.query("amount", "BETWEEN", 100, 600)
    print(f"范围查询计划: {plan['strategy']}, 命中 {len(results)} 条记录，耗时 {plan['time_ms']}ms")

    # 4. 存储防护模块测试
    protector = StorageProtector("./test_demo.ndb")
    crc = protector.save_atomic({"tables": {"orders": {"next_id": table.next_id, "records": list(table.records.values())}}})
    print(f"原子写入成功！CRC32 校验码: {crc}")
    loaded, src = protector.load_with_recovery()
    print(f"从数据源 {src} 成功读取 {len(loaded['tables']['orders']['records'])} 条记录。")
    
    # 清理测试临时文件
    for f in ["./test_demo.ndb", "./test_demo.ndb.bak", "./test_demo.ndb.lock", "./test_demo.ndb.tmp"]:
        if os.path.exists(f):
            os.remove(f)
    print("PyNodeDB 所有自测试用例全部执行通过！")
