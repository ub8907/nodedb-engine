//! C-ABI 跨语言外部函数接口 (Foreign Function Interface)
//! 
//! 为 Node.js / Python / Go / C / C++ 提供高性能零拷贝外部导出符号。

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::sync::Mutex;
use crate::storage::StorageEngine;

pub struct MiniDBHandle {
    pub inner: Mutex<StorageEngine>,
}

/// 打开或创建单文件数据库句柄
/// 
/// 返回指向 MiniDBHandle 的不透明指针。失败返回 NULL。
#[no_mangle]
pub unsafe extern "C" fn minidb_open(path: *const c_char) -> *mut MiniDBHandle {
    if path.is_null() {
        return std::ptr::null_mut();
    }

    let c_str = match CStr::from_ptr(path).to_str() {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };

    match StorageEngine::open_or_create(c_str) {
        Ok(engine) => {
            let handle = Box::new(MiniDBHandle {
                inner: Mutex::new(engine),
            });
            Box::into_raw(handle)
        }
        Err(_) => std::ptr::null_mut(),
    }
}

/// 批量写入数据记录（JSON 格式数组字符串，例如 '[{"title":"A"}, {"title":"B"}]'）
/// 
/// 返回值：0 表示成功，< 0 表示错误码
#[no_mangle]
pub unsafe extern "C" fn minidb_insert_batch(
    handle: *mut MiniDBHandle,
    json_records: *const c_char,
    out_inserted_count: *mut u64,
) -> c_int {
    if handle.is_null() || json_records.is_null() {
        return -1;
    }

    let c_str = match CStr::from_ptr(json_records).to_str() {
        Ok(s) => s,
        Err(_) => return -2,
    };

    let records: Vec<serde_json::Value> = match serde_json::from_str(c_str) {
        Ok(r) => r,
        Err(_) => return -3,
    };

    let handle_ref = &*handle;
    let mut engine = match handle_ref.inner.lock() {
        Ok(guard) => guard,
        Err(_) => return -4,
    };

    match engine.insert_batch(records) {
        Ok(count) => {
            if !out_inserted_count.is_null() {
                *out_inserted_count = count;
            }
            0
        }
        Err(_) => -5,
    }
}

/// 按主键点查单条记录 (On-Disk Binary Search)
/// 
/// 找到写入 out_buf (以 \0 结尾的 JSON 字符串)，返回该 JSON 字节数；未找到返回 0；出错返回 < 0。
#[no_mangle]
pub unsafe extern "C" fn minidb_find_by_pk(
    handle: *mut MiniDBHandle,
    pk: u64,
    out_buf: *mut c_char,
    max_len: usize,
) -> c_int {
    if handle.is_null() || out_buf.is_null() || max_len == 0 {
        return -1;
    }

    let handle_ref = &*handle;
    let mut engine = match handle_ref.inner.lock() {
        Ok(guard) => guard,
        Err(_) => return -2,
    };

    match engine.find_by_pk(pk) {
        Ok(Some(row)) => {
            let json_str = match serde_json::to_string(&row) {
                Ok(s) => s,
                Err(_) => return -3,
            };
            let bytes = json_str.as_bytes();
            if bytes.len() >= max_len {
                return -4; // 缓冲区不足
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), out_buf as *mut u8, bytes.len());
            *out_buf.add(bytes.len()) = 0; // null-terminator
            bytes.len() as c_int
        }
        Ok(None) => 0, // 未找到
        Err(_) => -5,
    }
}

/// 分页查询记录 (Page 从 1 开始)
/// 
/// 将返回的 JSON 数组字符串填入 out_buf。
#[no_mangle]
pub unsafe extern "C" fn minidb_query_paged(
    handle: *mut MiniDBHandle,
    page: u64,
    page_size: u64,
    out_buf: *mut c_char,
    max_len: usize,
) -> c_int {
    if handle.is_null() || out_buf.is_null() || max_len == 0 {
        return -1;
    }

    let handle_ref = &*handle;
    let mut engine = match handle_ref.inner.lock() {
        Ok(guard) => guard,
        Err(_) => return -2,
    };

    match engine.query_paged(page, page_size) {
        Ok(rows) => {
            let json_str = match serde_json::to_string(&rows) {
                Ok(s) => s,
                Err(_) => return -3,
            };
            let bytes = json_str.as_bytes();
            if bytes.len() >= max_len {
                return -4; // 缓冲区容量不足
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), out_buf as *mut u8, bytes.len());
            *out_buf.add(bytes.len()) = 0;
            bytes.len() as c_int
        }
        Err(_) => -5,
    }
}

/// 获取数据库统计规格 (Header Metadata)
#[no_mangle]
pub unsafe extern "C" fn minidb_get_stats(
    handle: *mut MiniDBHandle,
    out_buf: *mut c_char,
    max_len: usize,
) -> c_int {
    if handle.is_null() || out_buf.is_null() || max_len == 0 {
        return -1;
    }

    let handle_ref = &*handle;
    let engine = match handle_ref.inner.lock() {
        Ok(guard) => guard,
        Err(_) => return -2,
    };

    let header = engine.header();
    let stats = serde_json::json!({
        "version": header.version,
        "total_rows": header.total_rows,
        "next_id": header.next_id,
        "index_count": header.index_count,
        "data_area_end": header.data_area_end,
    });

    let json_str = stats.to_string();
    let bytes = json_str.as_bytes();
    if bytes.len() >= max_len {
        return -4;
    }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), out_buf as *mut u8, bytes.len());
    *out_buf.add(bytes.len()) = 0;
    bytes.len() as c_int
}

/// 纯磁盘一键重建全部稀疏索引
#[no_mangle]
pub unsafe extern "C" fn minidb_rebuild_indexes(
    handle: *mut MiniDBHandle,
    out_reindexed_chunks: *mut u64,
    out_total_rows: *mut u64,
) -> c_int {
    if handle.is_null() {
        return -1;
    }

    let handle_ref = &*handle;
    let mut engine = match handle_ref.inner.lock() {
        Ok(guard) => guard,
        Err(_) => return -2,
    };

    match engine.rebuild_all_indexes() {
        Ok((chunks, rows)) => {
            if !out_reindexed_chunks.is_null() {
                *out_reindexed_chunks = chunks;
            }
            if !out_total_rows.is_null() {
                *out_total_rows = rows;
            }
            0
        }
        Err(_) => -3,
    }
}

/// 释放关闭数据库句柄
#[no_mangle]
pub unsafe extern "C" fn minidb_close(handle: *mut MiniDBHandle) {
    if !handle.is_null() {
        let _ = Box::from_raw(handle);
    }
}
