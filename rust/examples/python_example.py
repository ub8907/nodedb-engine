#!/usr/bin/env python3
"""
Python 通过 ctypes 调用 Rust MiniDB 动态库示例
无需安装额外依赖，标准库原生支持
"""

import ctypes
import json
import os
import sys

# 1. 查找动态库路径
lib_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../target/release"))
if sys.platform == "win32":
    lib_path = os.path.join(lib_dir, "minidb.dll")
elif sys.platform == "darwin":
    lib_path = os.path.join(lib_dir, "libminidb.dylib")
else:
    lib_path = os.path.join(lib_dir, "libminidb.so")

if not os.path.exists(lib_path):
    print(f"提示: 请先在 /rust 目录下执行 `cargo build --release` 生成动态库: {lib_path}")

lib = ctypes.CDLL(lib_path)

# 2. 定义 C 函数签名
class MiniDBHandle(ctypes.Structure):
    pass

lib.minidb_open.argtypes = [ctypes.c_char_p]
lib.minidb_open.restype = ctypes.POINTER(MiniDBHandle)

lib.minidb_insert_batch.argtypes = [
    ctypes.POINTER(MiniDBHandle),
    ctypes.c_char_p,
    ctypes.POINTER(ctypes.c_uint64)
]
lib.minidb_insert_batch.restype = ctypes.c_int32

lib.minidb_find_by_pk.argtypes = [
    ctypes.POINTER(MiniDBHandle),
    ctypes.c_uint64,
    ctypes.c_char_p,
    ctypes.c_size_t
]
lib.minidb_find_by_pk.restype = ctypes.c_int32

lib.minidb_query_paged.argtypes = [
    ctypes.POINTER(MiniDBHandle),
    ctypes.c_uint64,
    ctypes.c_uint64,
    ctypes.c_char_p,
    ctypes.c_size_t
]
lib.minidb_query_paged.restype = ctypes.c_int32

lib.minidb_get_stats.argtypes = [
    ctypes.POINTER(MiniDBHandle),
    ctypes.c_char_p,
    ctypes.c_size_t
]
lib.minidb_get_stats.restype = ctypes.c_int32

lib.minidb_close.argtypes = [ctypes.POINTER(MiniDBHandle)]
lib.minidb_close.restype = None

# 3. Python 封装类
class MiniDB:
    def __init__(self, db_path: str):
        self.handle = lib.minidb_open(db_path.encode('utf-8'))
        if not self.handle:
            raise RuntimeError(f"无法打开或创建数据库文件: {db_path}")

    def insert_batch(self, rows: list) -> int:
        json_bytes = json.dumps(rows).encode('utf-8')
        out_count = ctypes.c_uint64(0)
        ret = lib.minidb_insert_batch(self.handle, json_bytes, ctypes.byref(out_count))
        if ret != 0:
            raise RuntimeError(f"插入数据批次失败，错误码: {ret}")
        return out_count.value

    def find_by_pk(self, pk: int) -> dict:
        buf = ctypes.create_string_buffer(64 * 1024)
        ret = lib.minidb_find_by_pk(self.handle, ctypes.c_uint64(pk), buf, len(buf))
        if ret < 0:
            raise RuntimeError(f"查找主键 {pk} 失败，错误码: {ret}")
        if ret == 0:
            return None
        return json.loads(buf.value.decode('utf-8'))

    def query_paged(self, page: int = 1, page_size: int = 20) -> list:
        buf = ctypes.create_string_buffer(256 * 1024)
        ret = lib.minidb_query_paged(self.handle, ctypes.c_uint64(page), ctypes.c_uint64(page_size), buf, len(buf))
        if ret < 0:
            raise RuntimeError(f"分页查询失败，错误码: {ret}")
        return json.loads(buf.value.decode('utf-8'))

    def get_stats(self) -> dict:
        buf = ctypes.create_string_buffer(4096)
        ret = lib.minidb_get_stats(self.handle, buf, len(buf))
        if ret < 0:
            raise RuntimeError("获取统计指标失败")
        return json.loads(buf.value.decode('utf-8'))

    def close(self):
        if self.handle:
            lib.minidb_close(self.handle)
            self.handle = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

if __name__ == "__main__":
    db = MiniDB("./test_python.dat")
    print("数据库已打开！")
    
    # 插入 1,000 条测试数据
    items = [{"title": f"Device #{i}", "temp": 20.5 + (i % 15)} for i in range(1, 1001)]
    inserted = db.insert_batch(items)
    print(f"成功插入行数: {inserted}")
    
    # 获取统计信息
    print("元数据统计:", db.get_stats())
    
    # 点查主键 ID=42
    print("主键查询 ID=42 结果:", db.find_by_pk(42))
    
    # 分页查询
    print("第 1 页记录:", db.query_paged(page=1, page_size=3))
    
    db.close()
