import React, { useState } from 'react';
import { Play, Sparkles, Database, Layers, ArrowRight, Table as TableIcon, GitBranch, Cpu, Clock, CheckCircle2, AlertCircle, Download, FileText, CornerDownRight } from 'lucide-react';
import { Language, translations } from '../i18n/translations';

interface SqlStudioProps {
  lang: Language;
  onRefreshAll?: () => void;
}

interface QueryResultState {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTimeMs: number;
  plan: Array<{
    operation: string;
    table: string;
    strategy: string;
    detail: string;
    estimatedCost: string;
  }>;
  affectedRows?: number;
  message?: string;
  error?: string;
}

export const SqlStudio: React.FC<SqlStudioProps> = ({ lang, onRefreshAll }) => {
  const t = translations[lang];

  // 默认预设 SQL 语句
  const PRESET_QUERIES = [
    {
      id: 'inner_join',
      label: lang === 'zh' ? '多表 INNER JOIN (索引嵌套循环 INLJ)' : 'Multi-Table INNER JOIN (INLJ)',
      desc: lang === 'zh' ? 'orders 与 customers 关联，命中主键 B-树 O(log N) 探查' : 'orders & customers joined via PK B-Tree O(log N)',
      sql: `SELECT orders.id, orders.order_no, customers.name, customers.vip_level, orders.amount, orders.status
FROM orders
INNER JOIN customers ON orders.customer_id = customers.id
WHERE orders.amount > 100
ORDER BY orders.amount DESC
LIMIT 5;`
    },
    {
      id: 'group_by_agg',
      label: lang === 'zh' ? '多表分组聚合 (GROUP BY & 统计)' : 'GROUP BY & Multi-Table Aggregation',
      desc: lang === 'zh' ? '统计各客户总订单数、消费总额与客单均价' : 'Compute total orders, spent & average per customer',
      sql: `SELECT customers.name, COUNT(*) AS total_orders, SUM(orders.amount) AS total_spent, AVG(orders.amount) AS avg_spent
FROM orders
INNER JOIN customers ON orders.customer_id = customers.id
GROUP BY customers.name
ORDER BY total_spent DESC;`
    },
    {
      id: 'left_join',
      label: lang === 'zh' ? 'LEFT OUTER JOIN (左外连接)' : 'LEFT OUTER JOIN (Full Outer Coverage)',
      desc: lang === 'zh' ? '列出所有客户及其可能存在的订单，未下单补 NULL' : 'List all customers with optional orders, null padded',
      sql: `SELECT customers.id, customers.name, customers.city, orders.order_no, orders.amount, orders.status
FROM customers
LEFT JOIN orders ON customers.id = orders.customer_id
ORDER BY customers.id ASC;`
    },
    {
      id: 'explain_plan',
      label: lang === 'zh' ? 'EXPLAIN 执行计划分析' : 'EXPLAIN Query Plan Tree',
      desc: lang === 'zh' ? '查看查询优化器多表联查、索引选择与预估代价' : 'Inspect index choices, join strategy, and cost tree',
      sql: `EXPLAIN SELECT orders.id, customers.name, orders.amount
FROM orders
INNER JOIN customers ON orders.customer_id = customers.id
WHERE orders.amount > 200;`
    },
    {
      id: 'btree_range',
      label: lang === 'zh' ? '二级多值 B-树区间扫描 (BETWEEN)' : 'Secondary B-Tree Range (BETWEEN)',
      desc: lang === 'zh' ? '命中 amount 二级 B-树索引，毫秒级区间检索' : 'Secondary B-Tree range scan on amount column',
      sql: `SELECT * FROM orders
WHERE amount BETWEEN 200 AND 800
ORDER BY amount ASC;`
    },
    {
      id: 'hash_point',
      label: lang === 'zh' ? '唯一列哈希索引点查 O(1)' : 'Unique Column Hash Seek O(1)',
      desc: lang === 'zh' ? '邮箱唯一索引 O(1) 精确直达主键' : 'Hash index O(1) point lookup by email',
      sql: `SELECT * FROM orders
WHERE customer_email = 'diana@quantum.ai';`
    },
    {
      id: 'insert_sql',
      label: lang === 'zh' ? 'INSERT 写入 (自增+Base62自动生成)' : 'INSERT (AUTOINCREMENT + Base62)',
      desc: lang === 'zh' ? '自动填充持久化 next_id 与时间有序短键' : 'Auto-populates persistent next_id & Base62 short key',
      sql: `INSERT INTO orders (customer_id, customer_email, amount, status)
VALUES (1, 'new_vip_user@future.org', 660, 'pending');`
    },
    {
      id: 'create_table_sql',
      label: lang === 'zh' ? 'CREATE TABLE 创建新表' : 'CREATE TABLE (DDL)',
      desc: lang === 'zh' ? '支持主键自增、Base62短键、唯一哈希、二级B-树索引' : 'Auto PK, Base62 short key, Unique Hash & B-Tree index',
      sql: `CREATE TABLE IF NOT EXISTS products (
  id INT PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(32) SHORTKEY UNIQUE,
  title TEXT,
  category TEXT INDEX,
  price NUMBER INDEX,
  in_stock BOOLEAN
);`
    }
  ];

  const [sqlInput, setSqlInput] = useState<string>(PRESET_QUERIES[0].sql);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResultState | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'grid' | 'plan' | 'json'>('grid');
  const [dbTables, setDbTables] = useState<Array<{ name: string; schema: any }>>([]);
  const [sqlPage, setSqlPage] = useState(1);
  const [sqlPageSize, setSqlPageSize] = useState(50);

  const loadDbTables = async () => {
    try {
      const res = await fetch('/api/db/status');
      if (res.ok) {
        const data = await res.json();
        if (data.tables) {
          setDbTables(data.tables);
        }
      }
    } catch {
      // ignore
    }
  };

  React.useEffect(() => {
    loadDbTables();
  }, []);

  // 执行 SQL
  const handleExecute = async (queryToRun?: string) => {
    const sql = (queryToRun || sqlInput).trim();
    if (!sql) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/db/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: 0,
          plan: [],
          error: data.error || 'SQL 执行失败'
        });
      } else {
        setResult(data);
        if (data.plan && data.plan.length > 0 && sql.toUpperCase().startsWith('EXPLAIN')) {
          setActiveResultTab('plan');
        } else {
          setActiveResultTab('grid');
        }

        // 若是修改类语句，触发全局数据刷新
        if (data.affectedRows) {
          loadDbTables();
          if (onRefreshAll) onRefreshAll();
        }
      }
    } catch (err: any) {
      setResult({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        plan: [],
        error: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  // 支持键盘快捷键 Ctrl+Enter 或 Cmd+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  // 导出 CSV
  const handleExportCsv = () => {
    if (!result || !result.rows || result.rows.length === 0) return;
    const headers = result.columns.join(',');
    const rows = result.rows.map(r =>
      result.columns.map(c => `"${String(r[c] !== undefined ? r[c] : '').replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nodedb_query_result_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 顶部标语与特性说明 */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded bg-indigo-500/10 text-indigo-400">
                <Database className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-semibold text-white">
                {lang === 'zh' ? '全语法 SQL 工作台与多表联查 (JOIN Studio)' : 'Full SQL Studio & Multi-Table JOIN Workbench'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {lang === 'zh'
                ? '内置完整词法/语法解析器与执行器。支持 CREATE TABLE / DROP TABLE 建表删表、多表 INNER/LEFT JOIN、GROUP BY 聚合、自建 B-树索引嵌套循环连接 (INLJ)、O(1) 哈希索引以及 EXPLAIN 执行计划可视化。'
                : 'Built-in SQL lexer, parser, and executor. Supports CREATE/DROP TABLE DDL, multi-table INNER/LEFT JOINs, GROUP BY aggregations, Index Nested Loop Joins (INLJ) via self-implemented B-Trees, O(1) Hash Indexes, and visual EXPLAIN trees.'}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-950/60 px-3.5 py-2 rounded-lg border border-slate-800">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <GitBranch className="w-3.5 h-3.5" />
              INLJ O(M·log N)
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
              <Cpu className="w-3.5 h-3.5" />
              Hash Join O(M+N)
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1.5 text-amber-400 font-medium">
              <Layers className="w-3.5 h-3.5" />
              {lang === 'zh' ? '多表关联支持' : 'Multi-Table Ready'}
            </span>
          </div>
        </div>
      </div>

      {/* 预设查询快捷卡片 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            {lang === 'zh' ? '标准 SQL 预设案例 (一键填入并运行)' : 'Standard SQL Presets (Click to Load)'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            {lang === 'zh' ? '快捷键: Ctrl + Enter / ⌘ + Enter' : 'Shortcut: Ctrl + Enter / ⌘ + Enter'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {PRESET_QUERIES.map(preset => (
            <button
              key={preset.id}
              onClick={() => {
                setSqlInput(preset.sql);
                handleExecute(preset.sql);
              }}
              className="text-left p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/60 transition group cursor-pointer"
            >
              <div className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 flex items-center justify-between">
                <span>{preset.label}</span>
                <CornerDownRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition transform group-hover:translate-x-0.5" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{preset.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* SQL 编辑器区域 */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="text-xs font-mono text-slate-400 ml-2">NodeDB SQL Editor (ANSI SQL-92 / Core-2016)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSqlInput('')}
              className="text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded hover:bg-slate-800 transition"
            >
              {lang === 'zh' ? '清空' : 'Clear'}
            </button>
            <button
              onClick={() => handleExecute()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white rounded-md text-xs font-medium shadow transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loading ? (lang === 'zh' ? '正在执行...' : 'Executing...') : (lang === 'zh' ? '运行 SQL' : 'Execute SQL')}
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={sqlInput}
            onChange={e => setSqlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={7}
            placeholder={lang === 'zh' ? '输入 SQL 查询语句，例如: SELECT * FROM orders INNER JOIN customers ON orders.customer_id = customers.id...' : 'Enter SQL query here...'}
            className="w-full bg-slate-950/90 text-slate-100 font-mono text-xs sm:text-sm p-4 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-y leading-relaxed"
            spellCheck={false}
          />
        </div>

        {/* 数据库现有表 Schema 便捷速查 */}
        <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800/80 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300 flex items-center gap-1">
            <TableIcon className="w-3 h-3 text-indigo-400" />
            {lang === 'zh' ? '当前数据库可用表:' : 'Available Tables:'}
          </span>
          {dbTables.length > 0 ? (
            dbTables.map((tbl, i) => (
              <React.Fragment key={tbl.name}>
                {i > 0 && <span className="text-slate-600">•</span>}
                <span className="font-mono text-slate-300">
                  <span className="text-indigo-300 font-semibold">{tbl.name}</span> (
                  {tbl.schema?.columns?.map((c: any, ci: number) => (
                    <span key={c.name}>
                      {ci > 0 && ', '}
                      <span className={c.isPrimaryKey ? 'text-amber-400 font-semibold' : c.isSecondaryIndex ? 'text-sky-300' : 'text-slate-400'}>
                        {c.name}
                      </span>
                    </span>
                  ))}
                  )
                </span>
              </React.Fragment>
            ))
          ) : (
            <span className="font-mono text-slate-400">
              orders (<span className="text-amber-400">id</span>, <span className="text-sky-400">customer_id</span>, order_no, customer_email, amount, status)
            </span>
          )}
        </div>
      </div>

      {/* 执行结果面板 */}
      {result && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-lg">
          {/* 结果栏头部 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 bg-slate-950/90 border-b border-slate-800 gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded">
                <button
                  onClick={() => setActiveResultTab('grid')}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    activeResultTab === 'grid'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <TableIcon className="w-3.5 h-3.5" />
                    {lang === 'zh' ? '数据视图' : 'Data View'}
                    {result.rows && <span className="text-[10px] opacity-80">({result.rowCount})</span>}
                  </span>
                </button>
                <button
                  onClick={() => setActiveResultTab('plan')}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    activeResultTab === 'plan'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" />
                    {lang === 'zh' ? '执行计划 (EXPLAIN)' : 'Execution Plan'}
                    {result.plan && result.plan.length > 0 && (
                      <span className="text-[10px] opacity-80">({result.plan.length})</span>
                    )}
                  </span>
                </button>
                <button
                  onClick={() => setActiveResultTab('json')}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    activeResultTab === 'json'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    JSON
                  </span>
                </button>
              </div>

              {result.executionTimeMs !== undefined && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono ml-2">
                  <Clock className="w-3 h-3" />
                  {result.executionTimeMs} ms
                </span>
              )}
            </div>

            {result.rows && result.rows.length > 0 && activeResultTab === 'grid' && (
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-800 transition"
              >
                <Download className="w-3.5 h-3.5" />
                {lang === 'zh' ? '导出 CSV' : 'Export CSV'}
              </button>
            )}
          </div>

          {/* 错误提示 */}
          {result.error && (
            <div className="p-4 bg-rose-950/40 border-l-4 border-rose-500 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <span className="font-semibold">{lang === 'zh' ? 'SQL 语法或执行错误:' : 'SQL Execution Error:'}</span>
                <p className="font-mono mt-1 text-rose-200">{result.error}</p>
              </div>
            </div>
          )}

          {/* 成功消息 (如 INSERT, UPDATE, DELETE) */}
          {result.message && (
            <div className="p-3 bg-emerald-950/40 border-l-4 border-emerald-500 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{result.message}</span>
            </div>
          )}

          {/* 数据网格 Tab */}
          {activeResultTab === 'grid' && !result.error && (
            <div>
              <div className="overflow-x-auto max-h-[460px]">
                {result.rows && result.rows.length > 0 ? (
                  <table className="w-full text-left text-xs divide-y divide-slate-800">
                    <thead className="bg-slate-950/80 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 text-slate-500 font-mono text-[11px] w-12 text-center">#</th>
                        {result.columns.map(col => (
                          <th key={col} className="py-2.5 px-3 text-slate-300 font-mono font-semibold whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {result.rows.slice((sqlPage - 1) * sqlPageSize, sqlPage * sqlPageSize).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3 text-slate-500 text-center text-[11px]">
                            {(sqlPage - 1) * sqlPageSize + idx + 1}
                          </td>
                          {result.columns.map(col => {
                            const val = row[col];
                            const isNull = val === null || val === undefined;
                            return (
                              <td key={col} className="py-2 px-3 whitespace-nowrap">
                                {isNull ? (
                                  <span className="text-slate-600 italic">NULL</span>
                                ) : typeof val === 'number' ? (
                                  <span className="text-amber-400">{val}</span>
                                ) : (
                                  <span className="text-slate-200">{String(val)}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-400">
                    {lang === 'zh' ? '查询未返回匹配的数据记录 (0 行)' : 'Query returned 0 rows'}
                  </div>
                )}
              </div>

              {/* SQL 查询结果分页栏 */}
              {result.rows && result.rows.length > sqlPageSize && (
                <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {lang === 'zh'
                      ? `显示第 ${(sqlPage - 1) * sqlPageSize + 1} - ${Math.min(sqlPage * sqlPageSize, result.rows.length)} 条，共 ${result.rows.length.toLocaleString()} 条`
                      : `Showing ${(sqlPage - 1) * sqlPageSize + 1} - ${Math.min(sqlPage * sqlPageSize, result.rows.length)} of ${result.rows.length.toLocaleString()}`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSqlPage(p => Math.max(1, p - 1))}
                      disabled={sqlPage <= 1}
                      className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                    >
                      ‹
                    </button>
                    <span className="px-2 font-mono text-slate-300">
                      {sqlPage} / {Math.ceil(result.rows.length / sqlPageSize)}
                    </span>
                    <button
                      onClick={() => setSqlPage(p => Math.min(Math.ceil(result.rows.length / sqlPageSize), p + 1))}
                      disabled={sqlPage >= Math.ceil(result.rows.length / sqlPageSize)}
                      className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 执行计划 Tab */}
          {activeResultTab === 'plan' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                <span>{lang === 'zh' ? '查询执行计划树 (Execution Plan Tree)' : 'Query Plan Steps'}</span>
                <span className="font-mono text-[11px] text-indigo-400">{result.plan?.length || 0} 阶段步骤</span>
              </div>

              {result.plan && result.plan.length > 0 ? (
                <div className="space-y-2.5">
                  {result.plan.map((step, idx) => {
                    const isBTree = step.strategy === 'PK_BTREE' || step.strategy === 'SECONDARY_BTREE';
                    const isHash = step.strategy === 'HASH_INDEX' || step.strategy === 'HASH_JOIN';
                    const isInlj = step.strategy === 'INLJ';

                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center font-mono text-[11px] text-slate-400 shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-200">{step.operation}</span>
                              <span className="text-slate-500 font-mono text-[11px]">[{step.table}]</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                                  isInlj
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : isBTree
                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                    : isHash
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {step.strategy}
                              </span>
                            </div>
                            <p className="text-slate-400 text-[11px] mt-1 font-sans">{step.detail}</p>
                          </div>
                        </div>

                        <div className="shrink-0 font-mono text-[11px] text-slate-400 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                          {lang === 'zh' ? '预估代价: ' : 'Cost: '}
                          <span className="text-indigo-400 font-semibold">{step.estimatedCost}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  {lang === 'zh' ? '当前语句未生成索引执行树。' : 'No execution tree generated for this query.'}
                </div>
              )}
            </div>
          )}

          {/* 原始 JSON Tab */}
          {activeResultTab === 'json' && (
            <div className="p-4 bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto max-h-[460px]">
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
