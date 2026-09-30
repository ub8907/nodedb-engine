//! 纯磁盘稀疏索引模块 (On-Disk Sparse Index Engine)
//! 
//! 设计原则：
//! 1. 索引直接固化落盘在磁盘文件中，每个分块索引条目定长 32 字节。
//! 2. 数据库启动、加载或查询时，绝对不在 RAM 内存中反序列化构建 B-树或哈希表。
//! 3. 查询单条主键通过磁盘原地二分查找 (On-Disk Binary Search)，内存消耗恒定 32 字节。

use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};

pub const INDEX_ENTRY_SIZE: usize = 32;

/// 磁盘固化索引条目 (32 字节定长二进制布局，物理扇区无对齐损耗)
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiskIndexEntry {
    pub min_pk: u64,          // 8 字节：该块最小主键
    pub max_pk: u64,          // 8 字节：该块最大主键
    pub file_offset: u64,     // 8 字节：数据块在数据库文件中的绝对起始字节偏移
    pub compressed_len: u32,  // 4 字节：该块压缩后长度
    pub row_count: u16,       // 2 字节：该块包含的数据行数
    pub flags: u16,           // 2 字节：状态标志（1=有效, 0=已删除/无效）
}

impl DiskIndexEntry {
    pub fn to_bytes(&self) -> [u8; INDEX_ENTRY_SIZE] {
        let mut buf = [0u8; INDEX_ENTRY_SIZE];
        buf[0..8].copy_from_slice(&self.min_pk.to_be_bytes());
        buf[8..16].copy_from_slice(&self.max_pk.to_be_bytes());
        buf[16..24].copy_from_slice(&self.file_offset.to_be_bytes());
        buf[24..28].copy_from_slice(&self.compressed_len.to_be_bytes());
        buf[28..30].copy_from_slice(&self.row_count.to_be_bytes());
        buf[30..32].copy_from_slice(&self.flags.to_be_bytes());
        buf
    }

    pub fn from_bytes(buf: &[u8; INDEX_ENTRY_SIZE]) -> Self {
        Self {
            min_pk: u64::from_be_bytes(buf[0..8].try_into().unwrap()),
            max_pk: u64::from_be_bytes(buf[8..16].try_into().unwrap()),
            file_offset: u64::from_be_bytes(buf[16..24].try_into().unwrap()),
            compressed_len: u32::from_be_bytes(buf[24..28].try_into().unwrap()),
            row_count: u16::from_be_bytes(buf[28..30].try_into().unwrap()),
            flags: u16::from_be_bytes(buf[30..32].try_into().unwrap()),
        }
    }
}

pub struct DiskIndexManager;

impl DiskIndexManager {
    /// 在磁盘指定位置写入单条索引条目
    pub fn write_entry_at(file: &mut File, index_offset: u64, entry_idx: u64, entry: &DiskIndexEntry) -> std::io::Result<()> {
        let pos = index_offset + entry_idx * (INDEX_ENTRY_SIZE as u64);
        file.seek(SeekFrom::Start(pos))?;
        file.write_all(&entry.to_bytes())?;
        Ok(())
    }

    /// 从磁盘指定索引槽位读取单条条目（仅消耗 32 字节栈内存）
    pub fn read_entry_at(file: &mut File, index_offset: u64, entry_idx: u64) -> std::io::Result<DiskIndexEntry> {
        let pos = index_offset + entry_idx * (INDEX_ENTRY_SIZE as u64);
        file.seek(SeekFrom::Start(pos))?;
        let mut buf = [0u8; INDEX_ENTRY_SIZE];
        file.read_exact(&mut buf)?;
        Ok(DiskIndexEntry::from_bytes(&buf))
    }

    /// 磁盘原地二分查找 (On-Disk Binary Search)
    /// 无论数据库是 100MB 还是 100GB，启动与检索时无需加载任何索引到内存中
    /// 时间复杂度 O(log N)，内存占用恒定 32 字节！
    pub fn binary_search_pk(
        file: &mut File,
        index_offset: u64,
        entry_count: u64,
        target_pk: u64,
    ) -> std::io::Result<Option<DiskIndexEntry>> {
        if entry_count == 0 {
            return Ok(None);
        }

        let mut low: i64 = 0;
        let mut high: i64 = (entry_count - 1) as i64;

        while low <= high {
            let mid = low + (high - low) / 2;
            let entry = Self::read_entry_at(file, index_offset, mid as u64)?;

            if target_pk >= entry.min_pk && target_pk <= entry.max_pk {
                return Ok(Some(entry));
            } else if target_pk < entry.min_pk {
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }

        Ok(None)
    }

    /// 按物理分块分页扫描索引
    pub fn scan_entries_range(
        file: &mut File,
        index_offset: u64,
        start_idx: u64,
        count: u64,
    ) -> std::io::Result<Vec<DiskIndexEntry>> {
        let mut results = Vec::with_capacity(count as usize);
        for i in 0..count {
            let entry = Self::read_entry_at(file, index_offset, start_idx + i)?;
            results.push(entry);
        }
        Ok(results)
    }
}
