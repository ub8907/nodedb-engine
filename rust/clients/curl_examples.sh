#!/usr/bin/env bash
# MiniDB HTTP 模式通用请求示例 (任何支持 HTTP 的工具/语言均可 0 依赖直连)
#
# 首先启动服务端:
# ./target/release/minidb-cli ./my_database.dat serve 6789

BASE_URL="http://127.0.0.1:6789"

echo "=== 1. 查看数据库元数据 ==="
curl -s "${BASE_URL}/stats" | jq .

echo -e "\n=== 2. 批量写入记录 ==="
curl -s -X POST "${BASE_URL}/insert" \
  -H "Content-Type: application/json" \
  -d '[
    {"title": "Product Alpha", "price": 99.5, "stock": 100},
    {"title": "Product Beta", "price": 199.0, "stock": 50}
  ]' | jq .

echo -e "\n=== 3. 磁盘原地二分点查指定主键 ID=1 ==="
curl -s "${BASE_URL}/find/1" | jq .

echo -e "\n=== 4. 分页游标直查 ==="
curl -s "${BASE_URL}/paged?page=1&size=10" | jq .
