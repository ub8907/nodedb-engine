/**
 * Buffer Pool 内存缓冲池与盘索引管理面板
 * 展示 4KB 扇区对齐盘索引状态、LRU 缓存命中率、可配置内存大小滑块与 REINDEX 物理重建按钮
 */

import React, { useState, useEffect } from 'react';
import { Cpu, HardDrive, RefreshCw, Layers, Zap, Sliders, CheckCircle2, AlertCircle } from 'lucide-react';
import { Language, translations } from '../i18n/translations';

interface BufferPoolManagerPanelProps {
  lang: Language;
  tables: Array<{ name: string; rowCount: number; pkColumn: string }>;
  onRefreshAll: () => void;
}

export const BufferPoolManagerPanel: React.FC<BufferPoolManagerPanelProps> = ({ lang, tables, onRefreshAll }) => {
  const t = translations[lang];
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [targetMemoryMb, setTargetMemoryMb] = useState(32);
  const [reindexingTable, setReindexingTable] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/db/buffer-pool');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        if (data.stats && data.stats.memoryLimitMb) {
          setTargetMemoryMb(data.stats.memoryLimitMb);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleUpdateMemory = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/db/buffer-pool/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizeMb: Number(targetMemoryMb) })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message || 'Buffer Pool memory limit updated successfully');
        fetchStats();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReindexTable = async (tableName: string) => {
    setReindexingTable(tableName);
    setMessage(null);
    try {
      const res = await fetch(`/api/db/table/${tableName}/reindex`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        fetchStats();
        onRefreshAll();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setReindexingTable(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部介绍 */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded bg-indigo-500/10 text-indigo-400">
            <Cpu className="w-5 h-5" />
          </span>
          <h2 className="text-lg font-semibold text-white">
            {lang === 'zh' ? '盘索引引擎与 Buffer Pool 内存优化中心' : 'Disk Index Engine & Buffer Pool Memory Optimizer'}
          </h2>
        </div>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          {lang === 'zh'
            ? 'NodeDB 采用基于 4KB 扇区对齐的磁盘页 B-树索引 (Disk-Backed Paged B-Tree)。所有节点通过 LRU 缓冲池管理器常驻内存或换出至磁盘。您可在此动态调节内存占用预算、监视缓存命中率并执行物理 REINDEX 碎片整理。'
            : 'NodeDB utilizes 4KB sector-aligned Disk-Backed Paged B-Trees. All pages are managed via LRU buffer pool. Configure memory budget, monitor hit ratios, and execute physical REINDEX compactions.'}
        </p>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* 实时性能指标网格 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-[11px] text-slate-400">{lang === 'zh' ? '缓存命中率 (Hit Ratio)' : 'Hit Ratio'}</div>
            <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">{stats.hitRatioPercent}%</div>
            <div className="text-[10px] text-slate-500 mt-1">Hits: {stats.hits} / Misses: {stats.misses}</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-[11px] text-slate-400">{lang === 'zh' ? '内存常驻页数' : 'Cached Pages'}</div>
            <div className="text-2xl font-bold text-indigo-300 font-mono mt-1">{stats.cachedPagesCount} <span className="text-xs text-slate-400">/ {stats.maxPagesCount}</span></div>
            <div className="text-[10px] text-slate-500 mt-1">Memory: {stats.memoryUsedMb} MB</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-[11px] text-slate-400">{lang === 'zh' ? '磁盘读写次数' : 'Disk I/O'}</div>
            <div className="text-2xl font-bold text-amber-400 font-mono mt-1">{stats.diskReads} <span className="text-xs text-slate-400">R</span> / {stats.diskWrites} <span className="text-xs text-slate-400">W</span></div>
            <div className="text-[10px] text-slate-500 mt-1">Dirty Pages: {stats.dirtyPagesCount}</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-[11px] text-slate-400">{lang === 'zh' ? 'LRU 换出次数' : 'Evictions'}</div>
            <div className="text-2xl font-bold text-purple-400 font-mono mt-1">{stats.evictions}</div>
            <div className="text-[10px] text-slate-500 mt-1">Page Size: {stats.pageSizeBytes} B</div>
          </div>
        </div>
      )}

      {/* 内存预算配置卡片 */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span>{lang === 'zh' ? '动态内存优化与预算设置 (Buffer Pool Memory Budget)' : 'Buffer Pool Memory Budget Configuration'}</span>
        </div>
        <p className="text-xs text-slate-400">
          {lang === 'zh'
            ? '可自由调节数据库引擎可占用的最大内存大小。缩减内存将立即触发 LRU 页面回收与脏页刷盘。'
            : 'Adjust the maximum RAM budget for index pages. Decreasing memory triggers immediate LRU page eviction and disk flushing.'}
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2">
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-xs font-mono text-slate-300">
              <span>4 MB</span>
              <strong className="text-indigo-400 text-sm">{targetMemoryMb} MB</strong>
              <span>256 MB</span>
            </div>
            <input
              type="range"
              min={4}
              max={256}
              step={4}
              value={targetMemoryMb}
              onChange={e => setTargetMemoryMb(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          <button
            onClick={handleUpdateMemory}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-md text-xs font-semibold shadow transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? (lang === 'zh' ? '应用中...' : 'Applying...') : (lang === 'zh' ? '确认应用内存大小' : 'Apply Memory Limit')}
          </button>
        </div>
      </div>

      {/* 物理盘索引重整 (REINDEX / OPTIMIZE) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <HardDrive className="w-4 h-4 text-emerald-400" />
          <span>{lang === 'zh' ? '数据库 SQL 优化与盘索引物理重建 (REINDEX TABLE)' : 'Physical Disk Index Rebuild & Optimization'}</span>
        </div>
        <p className="text-xs text-slate-400">
          {lang === 'zh'
            ? '删除行或高频更新会产生磁盘页面碎片。对表执行 REINDEX 可重新打包平衡 B-树、消除空隙并重置树高。'
            : 'Deletions and updates cause disk page fragmentation. Executing REINDEX repacks balanced B-Trees and reclaims storage space.'}
        </p>

        <div className="space-y-2.5 pt-1">
          {tables.map(tbl => (
            <div
              key={tbl.name}
              className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs"
            >
              <div>
                <span className="font-mono font-semibold text-slate-200">{tbl.name}</span>
                <span className="text-slate-400 ml-2">({tbl.rowCount} rows, PK: <strong className="text-amber-400 font-mono">{tbl.pkColumn}</strong>)</span>
              </div>

              <button
                onClick={() => handleReindexTable(tbl.name)}
                disabled={reindexingTable === tbl.name}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded font-medium transition cursor-pointer disabled:opacity-50 shadow"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reindexingTable === tbl.name ? 'animate-spin' : ''}`} />
                <span>{reindexingTable === tbl.name ? (lang === 'zh' ? '正在重整...' : 'Reindexing...') : (lang === 'zh' ? '执行 REINDEX' : 'REINDEX')}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
