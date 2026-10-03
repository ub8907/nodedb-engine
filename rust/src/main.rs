use std::env;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Instant;
use minidb::storage::StorageEngine;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        print_usage();
        return Ok(());
    }

    let db_path = &args[1];
    let action = &args[2];

    match action.as_str() {
        // 模式 1: 通用标准流守护进程 (Universal Stdio Daemon)
        // 任何语言 (Node.js/Python/Go/Java) 通过标准子进程管道 (stdin/stdout) 通信
        // 零构建步骤、零 C-FFI 编译器依赖、零第三方扩展包！
        "stdio" | "daemon" => {
            run_stdio_daemon(db_path)?;
        }

        // 模式 2: 轻量本地 Micro-HTTP 服务模式 (Local HTTP Server)
        // 任何语言直接发起本地 HTTP GET/POST，无须任何客户端库
        "serve" | "server" => {
            let port = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(6789);
            run_http_server(db_path, port)?;
        }

        // 模式 3: 命令行统计信息
        "stats" => {
            let db = StorageEngine::open_or_create(db_path)?;
            let h = db.header();
            let json_stats = serde_json::json!({
                "version": h.version,
                "total_rows": h.total_rows,
                "next_id": h.next_id,
                "index_count": h.index_count,
                "data_area_end": h.data_area_end,
                "index_offset": h.index_offset
            });
            println!("{}", serde_json::to_string_pretty(&json_stats)?);
        }

        // 模式 4: 生成测试数据
        "insert" => {
            let count: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1000);
            let mut db = StorageEngine::open_or_create(db_path)?;
            println!("正在写入 {} 条记录 (500 行自动分块压缩并即时落盘)...", count);

            let start = Instant::now();
            let mut batch = Vec::with_capacity(500);
            let mut total_inserted = 0u64;

            for i in 1..=count {
                batch.push(serde_json::json!({
                    "title": format!("Product #{}", i),
                    "price": ((i * 13 % 999) as f64) + 0.99,
                    "in_stock": i % 2 == 0,
                    "created_at": "2026-09-30T00:00:00Z"
                }));

                if batch.len() >= 500 {
                    total_inserted += db.insert_batch(batch.split_off(0))?;
                }
            }

            if !batch.is_empty() {
                total_inserted += db.insert_batch(batch)?;
            }

            let duration = start.elapsed();
            println!("✓ 写入完成！总数: {}，耗时: {:.2?}，吞吐: {:.0} rows/s", 
                total_inserted, duration, total_inserted as f64 / duration.as_secs_f64());
        }

        // 模式 5: 插入 JSON 数组字符串
        "insert-json" => {
            let json_str = args.get(3).ok_or("缺少 JSON 参数")?;
            let rows: Vec<serde_json::Value> = serde_json::from_str(json_str)?;
            let mut db = StorageEngine::open_or_create(db_path)?;
            let inserted = db.insert_batch(rows)?;
            println!("{{\"success\":true,\"inserted\":{}}}", inserted);
        }

        // 模式 6: 磁盘原地二分点查主键
        "find" => {
            let pk: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1);
            let mut db = StorageEngine::open_or_create(db_path)?;
            let start = Instant::now();
            match db.find_by_pk(pk)? {
                Some(record) => {
                    println!("{}", serde_json::to_string(&record)?);
                }
                None => {
                    eprintln!("未找到主键 ID={}", pk);
                    std::process::exit(1);
                }
            }
        }

        // 模式 7: 分页查询
        "page" => {
            let page: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1);
            let page_size: u64 = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(10);
            let mut db = StorageEngine::open_or_create(db_path)?;
            let rows = db.query_paged(page, page_size)?;
            println!("{}", serde_json::to_string(&rows)?);
        }

        // 模式 8: 一键重建全部磁盘索引
        "reindex" => {
            let mut db = StorageEngine::open_or_create(db_path)?;
            let start = Instant::now();
            let (chunks, rows) = db.rebuild_all_indexes()?;
            println!("{{\"success\":true,\"reindexed_chunks\":{},\"total_rows\":{},\"duration_ms\":{}}}", 
                chunks, rows, start.elapsed().as_millis());
        }

        other => {
            eprintln!("未知命令: {}", other);
            print_usage();
        }
    }

    Ok(())
}

fn print_usage() {
    println!("MiniDB: 跨语言通用、零构建步骤、纯磁盘索引数据库引擎");
    println!("通用跨语言服务模式:");
    println!("  minidb <db_path> stdio           # 启动 stdin/stdout JSON-RPC 守护进程 (Node/Python 极速连接)");
    println!("  minidb <db_path> serve [port]    # 启动轻量本地 HTTP 数据库服务 (默认端口 6789)");
    println!("单次命令调用模式:");
    println!("  minidb <db_path> stats           # 输出数据库元数据与统计");
    println!("  minidb <db_path> insert <count>  # 压测生成指定行数的数据");
    println!("  minidb <db_path> insert-json '<json_array>' # 批量插入 JSON 数组");
    println!("  minidb <db_path> find <pk>       # 磁盘二分查找指定主键");
    println!("  minidb <db_path> page <page> <size> # 分页游标直查");
}

/// 跨语言 Stdio 通用守护进程 (Node.js child_process / Python Popen 开箱即用)
fn run_stdio_daemon(db_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut db = StorageEngine::open_or_create(db_path)?;
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    // 握手确认
    writeln!(stdout, "{{\"ready\":true,\"version\":1}}")?;
    stdout.flush()?;

    for line_res in stdin.lock().lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => break,
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let req: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                writeln!(stdout, "{{\"error\":\"Invalid JSON request: {}\"}}", e)?;
                stdout.flush()?;
                continue;
            }
        };

        let req_id = req.get("id").cloned().unwrap_or(serde_json::Value::Null);
        let action = req.get("action").and_then(|v| v.as_str()).unwrap_or("");

        let resp_json = match action {
            "find" => {
                let pk = req.get("pk").and_then(|v| v.as_u64()).unwrap_or(0);
                match db.find_by_pk(pk) {
                    Ok(Some(row)) => serde_json::json!({ "id": req_id, "result": row }),
                    Ok(None) => serde_json::json!({ "id": req_id, "result": null }),
                    Err(e) => serde_json::json!({ "id": req_id, "error": e.to_string() }),
                }
            }
            "insert" => {
                if let Some(rows_val) = req.get("rows").and_then(|v| v.as_array()) {
                    let rows = rows_val.clone();
                    match db.insert_batch(rows) {
                        Ok(inserted) => serde_json::json!({ "id": req_id, "inserted": inserted }),
                        Err(e) => serde_json::json!({ "id": req_id, "error": e.to_string() }),
                    }
                } else {
                    serde_json::json!({ "id": req_id, "error": "Missing rows array" })
                }
            }
            "page" => {
                let page = req.get("page").and_then(|v| v.as_u64()).unwrap_or(1);
                let page_size = req.get("pageSize").and_then(|v| v.as_u64()).unwrap_or(20);
                match db.query_paged(page, page_size) {
                    Ok(rows) => serde_json::json!({ "id": req_id, "result": rows }),
                    Err(e) => serde_json::json!({ "id": req_id, "error": e.to_string() }),
                }
            }
            "stats" => {
                let h = db.header();
                serde_json::json!({
                    "id": req_id,
                    "stats": {
                        "total_rows": h.total_rows,
                        "next_id": h.next_id,
                        "index_count": h.index_count,
                        "data_area_end": h.data_area_end
                    }
                })
            }
            "ping" => {
                serde_json::json!({ "id": req_id, "pong": true })
            }
            "reindex" | "rebuild_all_indexes" => {
                match db.rebuild_all_indexes() {
                    Ok((chunks, rows)) => serde_json::json!({
                        "id": req_id,
                        "success": true,
                        "reindexed_chunks": chunks,
                        "total_rows": rows
                    }),
                    Err(e) => serde_json::json!({ "id": req_id, "error": e.to_string() }),
                }
            }
            other => {
                serde_json::json!({ "id": req_id, "error": format!("Unknown action: {}", other) })
            }
        };

        writeln!(stdout, "{}", resp_json)?;
        stdout.flush()?;
    }

    Ok(())
}

/// 轻量单线程/非阻塞标准库 HTTP 服务 (无需依赖第三方大型 Web 框架)
fn run_http_server(db_path: &str, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let mut db = StorageEngine::open_or_create(db_path)?;
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))?;
    println!("✓ MiniDB HTTP Server 已启动: http://127.0.0.1:{}", port);
    println!("  支持跨语言通过标准 HTTP/REST 零构建直连！");

    for stream in listener.incoming() {
        let stream = match stream {
            Ok(s) => s,
            Err(_) => continue,
        };
        handle_http_client(stream, &mut db);
    }

    Ok(())
}

fn handle_http_client(mut stream: TcpStream, db: &mut StorageEngine) {
    let mut reader = BufReader::new(&stream);
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() || line.is_empty() {
        return;
    }

    let parts: Vec<&str> = line.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }

    let method = parts[0];
    let path = parts[1];

    // 读取 Header 获取 Content-Length
    let mut content_length = 0usize;
    loop {
        line.clear();
        if reader.read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }
        if line.to_lowercase().starts_with("content-length:") {
            if let Some(val) = line.split(':').nth(1) {
                content_length = val.trim().parse().unwrap_or(0);
            }
        }
    }

    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        let _ = reader.read_exact(&mut body);
    }

    // 路由分发
    let (status, content_type, response_body) = if method == "GET" && path == "/stats" {
        let h = db.header();
        let json_val = serde_json::json!({
            "version": h.version,
            "total_rows": h.total_rows,
            "next_id": h.next_id,
            "index_count": h.index_count,
            "data_area_end": h.data_area_end
        });
        ("200 OK", "application/json", json_val.to_string())
    } else if method == "GET" && path.starts_with("/find/") {
        let pk_str = &path["/find/".len()..];
        let pk: u64 = pk_str.parse().unwrap_or(0);
        match db.find_by_pk(pk) {
            Ok(Some(row)) => ("200 OK", "application/json", row.to_string()),
            Ok(None) => ("404 Not Found", "application/json", "{\"error\":\"Not Found\"}".to_string()),
            Err(e) => ("500 Internal Error", "application/json", format!("{{\"error\":\"{}\"}}", e)),
        }
    } else if method == "GET" && path.starts_with("/paged") {
        // 解析 ?page=1&size=20
        let page = 1u64;
        let page_size = 20u64;
        match db.query_paged(page, page_size) {
            Ok(rows) => ("200 OK", "application/json", serde_json::to_string(&rows).unwrap_or_default()),
            Err(e) => ("500 Internal Error", "application/json", format!("{{\"error\":\"{}\"}}", e)),
        }
    } else if method == "POST" && path == "/insert" {
        match serde_json::from_slice::<Vec<serde_json::Value>>(&body) {
            Ok(rows) => match db.insert_batch(rows) {
                Ok(inserted) => ("200 OK", "application/json", format!("{{\"success\":true,\"inserted\":{}}}", inserted)),
                Err(e) => ("500 Internal Error", "application/json", format!("{{\"error\":\"{}\"}}", e)),
            },
            Err(e) => ("400 Bad Request", "application/json", format!("{{\"error\":\"Invalid JSON: {}\"}}", e)),
        }
    } else {
        ("404 Not Found", "text/plain", "Not Found".to_string())
    };

    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
        status,
        content_type,
        response_body.len(),
        response_body
    );

    let _ = stream.write_all(response.as_bytes());
}
