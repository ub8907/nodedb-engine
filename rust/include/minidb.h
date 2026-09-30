/**
 * MiniDB C-ABI 头文件
 * 兼容 C99 / C++ / Node.js (koffi, ffi-napi) / Python (ctypes) / Go (cgo)
 */

#ifndef MINIDB_H
#define MINIDB_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// 不透明数据库句柄指针
typedef struct MiniDBHandle MiniDBHandle;

/**
 * 打开或创建单文件数据库
 * @param path 数据库文件路径 (UTF-8 字符串)
 * @return MiniDBHandle 指针，失败返回 NULL
 */
MiniDBHandle* minidb_open(const char* path);

/**
 * 批量插入记录
 * @param handle 数据库句柄
 * @param json_records JSON 数组字符串，例如 '[{"title":"A"}, {"title":"B"}]'
 * @param out_inserted_count 用于接收实际插入条数的指针 (可选)
 * @return 0 表示成功，< 0 表示错误码
 */
int32_t minidb_insert_batch(
    MiniDBHandle* handle,
    const char* json_records,
    uint64_t* out_inserted_count
);

/**
 * 按主键查找记录 (基于磁盘原地二分查找，零内存索引)
 * @param handle 数据库句柄
 * @param pk 主键 ID
 * @param out_buf 接收输出 JSON 字符串的字符缓冲区
 * @param max_len 缓冲区最大容量
 * @return > 0 为写入字节数，0 表示未找到，< 0 表示错误码
 */
int32_t minidb_find_by_pk(
    MiniDBHandle* handle,
    uint64_t pk,
    char* out_buf,
    size_t max_len
);

/**
 * 分页游标查询
 * @param handle 数据库句柄
 * @param page 页码 (从 1 开始)
 * @param page_size 每页条数 (1 ~ 500)
 * @param out_buf 接收输出 JSON 数组字符串的字符缓冲区
 * @param max_len 缓冲区最大容量
 * @return > 0 为写入字节数，< 0 表示错误码
 */
int32_t minidb_query_paged(
    MiniDBHandle* handle,
    uint64_t page,
    uint64_t page_size,
    char* out_buf,
    size_t max_len
);

/**
 * 获取数据库元数据与统计指标
 * @param handle 数据库句柄
 * @param out_buf 接收输出 JSON 字符串的字符缓冲区
 * @param max_len 缓冲区最大容量
 * @return > 0 为写入字节数，< 0 表示错误码
 */
int32_t minidb_get_stats(
    MiniDBHandle* handle,
    char* out_buf,
    size_t max_len
);

/**
 * 关闭并释放数据库句柄
 * @param handle 数据库句柄
 */
void minidb_close(MiniDBHandle* handle);

#ifdef __cplusplus
}
#endif

#endif // MINIDB_H
