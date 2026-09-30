use std::env;
use std::time::Instant;
use minidb_rs::storage::StorageEngine;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        println!("MiniDB-RS: 纯磁盘索引与超低内存嵌入式数据库引擎");
        println!("用法:");
        println!("  minidb-cli <db_path> stats");
        println!("  minidb-cli <db_path> insert <count>");
        println!("  minidb-cli <db_path> find <pk>");
        println!("  minidb-cli <db_path> page <page> <page_size>");
        return Ok(());
    }

    let db_path = &args[1];
    let action = &args[2];

    let mut db = StorageEngine::open_or_create(db_path)?;

    match action.as_str() {
        "stats" => {
            let h = db.header();
            println!("=== 数据库元数据规格 ===");
            println!("文件版本 (Version):       {}", h.version);
            println!("总记录行数 (Total Rows):  {}", h.total_rows);
            println!("下一自增 ID (Next ID):    {}", h.next_id);
            println!("物理分块总数 (Chunks):    {}", h.index_count);
            println!("数据区末尾偏移 (Data End): {} bytes", h.data_area_end);
            println!("磁盘索引偏移 (Index Pos):  {} bytes", h.index_offset);
        }
        "insert" => {
            let count: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1000);
            println!("正在流式写入 {} 条记录 (500 行自动切块压缩并即时落盘)...", count);

            let start = Instant::now();
            let mut batch = Vec::with_capacity(500);
            let mut total_inserted = 0u64;

            for i in 1..=count {
                batch.push(serde_json::json!({
                    "title": format!("Product Item #{}", i),
                    "price": (i * 7 % 999) as f64 + 0.99,
                    "in_stock": i % 2 == 0,
                    "created_at": "2026-09-29T00:00:00Z"
                }));

                if batch.len() >= 500 {
                    total_inserted += db.insert_batch(batch.split_off(0))?;
                }
            }

            if !batch.is_empty() {
                total_inserted += db.insert_batch(batch)?;
            }

            let duration = start.elapsed();
            println!("✓ 写入完成！总插入行数: {}，耗时: {:.2?}，平均吞吐: {:.0} rows/s", 
                total_inserted, duration, total_inserted as f64 / duration.as_secs_f64());
        }
        "find" => {
            let pk: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1);
            let start = Instant::now();
            match db.find_by_pk(pk)? {
                Some(record) => {
                    println!("✓ 找到记录 (耗时 {:.2?}):", start.elapsed());
                    println!("{}", serde_json::to_string_pretty(&record)?);
                }
                None => {
                    println!("✗ 未找到主键 ID={} 的记录 (耗时 {:.2?})", pk, start.elapsed());
                }
            }
        }
        "page" => {
            let page: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1);
            let page_size: u64 = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(10);

            let start = Instant::now();
            let rows = db.query_paged(page, page_size)?;
            println!("✓ 分页查询结果 (第 {} 页, 每页 {} 条, 耗时 {:.2?}):", page, page_size, start.elapsed());
            for (idx, r) in rows.iter().enumerate() {
                println!("[{}] {}", idx + 1, r);
            }
        }
        other => {
            eprintln!("未知命令: {}", other);
        }
    }

    Ok(())
}
