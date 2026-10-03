#!/usr/bin/env python3
"""
Python 跨语言通用客户端 (Universal Python Client - Zero Build / Zero Dependencies)

核心优势：
1. 0 个 pip 依赖包，0 个 C 编译器，无需 wheel / gcc！
2. 基于 Python 标准库 subprocess，通过 stdio 管道与单个可执行文件通信。
3. 全流程超低内存，磁盘索引二分点查。
"""

import json
import subprocess
import sys

class MiniDBClient:
    def __init__(self, db_path: str, bin_path: str = "minidb-cli"):
        self.db_path = db_path
        self.bin_path = bin_path
        self.seq_id = 1
        self.process = subprocess.Popen(
            [self.bin_path, self.db_path, "stdio"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        # 读取初始握手行
        _ready_line = self.process.stdout.readline()

    def send(self, action: str, **kwargs) -> dict:
        req_id = self.seq_id
        self.seq_id += 1
        payload = {"id": req_id, "action": action, **kwargs}
        
        self.process.stdin.write(json.dumps(payload) + "\n")
        self.process.stdin.flush()

        resp_line = self.process.stdout.readline()
        if not resp_line:
            raise RuntimeError("MiniDB 进程未响应或已断开")
        
        data = json.loads(resp_line.strip())
        if "error" in data:
            raise RuntimeError(data["error"])
        return data.get("result", data)

    def insert_batch(self, rows: list) -> int:
        res = self.send("insert", rows=rows)
        return res.get("inserted", 0)

    def find_by_pk(self, pk: int) -> dict:
        return self.send("find", pk=pk)

    def query_paged(self, page: int = 1, page_size: int = 20) -> list:
        return self.send("page", page=page, pageSize=page_size)

    def get_stats(self) -> dict:
        res = self.send("stats")
        return res.get("stats", {})

    def close(self):
        if self.process:
            self.process.stdin.close()
            self.process.terminate()
            self.process.wait()
            self.process = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

if __name__ == "__main__":
    print("MiniDB Python Universal Client (0 Dependencies)")
    # 使用示例:
    # with MiniDBClient("./data/demo.dat", "./target/release/minidb-cli") as db:
    #     db.insert_batch([{"title": "Book 1", "price": 29.9}])
    #     print(db.find_by_pk(1))
