import React, { useState } from 'react';
import { Shield, AlertTriangle, RefreshCw, HardDrive, Lock, FileCode, CheckCircle2, XCircle, Zap, Cpu } from 'lucide-react';
import { StorageOperationLog } from '../engine/storage-manager';
import { Language, translations } from '../i18n/translations';

interface StorageLabProps {
  lang: Language;
  status: {
    fileSizeBytes: number;
    bakSizeBytes: number;
    expectedCrc: string;
    actualCrc: string;
    isFileCorrupt: boolean;
    hasLock: boolean;
    logs: StorageOperationLog[];
  };
  onAtomicSave: () => Promise<void>;
  onCorruptFile: () => Promise<void>;
  onRecoverFile: () => Promise<void>;
  onRebuildIndexes: () => Promise<void>;
  onRefresh: () => void;
}

export const StorageLab: React.FC<StorageLabProps> = ({
  lang,
  status,
  onAtomicSave,
  onCorruptFile,
  onRecoverFile,
  onRebuildIndexes,
  onRefresh
}) => {
  const t = translations[lang];
  const [activeFileTab, setActiveFileTab] = useState<'primary' | 'backup'>('primary');
  const [rawFiles, setRawFiles] = useState<{ primary: string; backup: string } | null>(null);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchRawFiles = async () => {
    setLoadingRaw(true);
    try {
      const res = await fetch('/api/db/raw-files');
      const data = await res.json();
      setRawFiles(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingRaw(false);
    }
  };

  React.useEffect(() => {
    fetchRawFiles();
  }, [status.expectedCrc, status.actualCrc, status.isFileCorrupt]);

  const handleCorrupt = async () => {
    setProcessing(true);
    setActionMessage(null);
    try {
      await onCorruptFile();
      setActionMessage(lang === 'zh'
        ? '已注入模拟磁盘比特位损坏！主文件 CRC32 校验不匹配，点击“执行完整性校验并回退 .bak 恢复”触发自愈。'
        : 'Disk bit-rot simulated! Primary file CRC32 mismatch. Click recover to trigger automatic fallback.');
      fetchRawFiles();
    } finally {
      setProcessing(false);
    }
  };

  const handleRecover = async () => {
    setProcessing(true);
    setActionMessage(null);
    try {
      await onRecoverFile();
      setActionMessage(lang === 'zh'
        ? '灾备回退恢复成功！已从 .bak 备份完全还原数据，CRC32 校验一致，全量在内存中重建 B-树与哈希索引。'
        : 'Recovery successful! Primary restored from .bak backup, CRC32 verified, and all in-memory B-Trees rebuilt.');
      fetchRawFiles();
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    setProcessing(true);
    setActionMessage(null);
    try {
      await onAtomicSave();
      setActionMessage(lang === 'zh'
        ? '原子写入提交成功：先落盘至 .tmp 临时文件，执行 fsync 硬件物理刷盘，轮转归档 .bak，并通过原子重命名生效。'
        : 'Atomic save finished: wrote to .tmp, executed fsync, rotated .bak, and swapped atomically.');
      fetchRawFiles();
    } finally {
      setProcessing(false);
    }
  };

  const handleCompactStorage = async () => {
    setProcessing(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/db/storage/compact', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Compact failed');
      setActionMessage(lang === 'zh'
        ? '全局存储紧凑化与空间回收完成！数据库已全面升级为 NODEDB_V3_BINARY 纯二进制紧凑格式（零Base64/去键名冗余），清理了临时上传文件并对磁盘 B-树索引执行了 96 阶物理紧凑重整。'
        : 'Storage compaction completed! All tables upgraded to NODEDB_V3_BINARY compact format.');
      onRefresh();
      fetchRawFiles();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRebuild = async () => {
    setProcessing(true);
    setActionMessage(null);
    try {
      await onRebuildIndexes();
      setActionMessage(lang === 'zh'
        ? '内存全量索引重建完成：已根据校验通过的有效数据重新填充主键 B-树、二级多值 B-树及唯一哈希表。'
        : 'Indexes rebuilt from verified records across all tables.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Protection Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white">{t.storageTitle}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {t.storageSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCompactStorage}
              disabled={processing}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              title={lang === 'zh' ? '升级存储为硬件压缩格式并重整所有磁盘索引释放空间' : 'Compact storage and defragment disk indexes'}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '紧凑存储与空间回收 (COMPACT)' : 'Compact Storage'}</span>
            </button>
            <button
              onClick={handleSave}
              disabled={processing}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{t.forceSaveBtn}</span>
            </button>
          </div>
        </div>

        {/* 6 Protection Mechanism Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-5">
          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">{t.layer1}</div>
            <div className="text-xs font-mono text-emerald-400 font-bold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>.tmp swap</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">POSIX rename</div>
          </div>

          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">{t.layer2}</div>
            <div className={`text-xs font-mono font-bold mt-1 flex items-center gap-1 ${status.isFileCorrupt ? 'text-rose-400' : 'text-emerald-400'}`}>
              {status.isFileCorrupt ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>{status.isFileCorrupt ? (lang === 'zh' ? '校验损坏!' : 'Corrupt!') : (lang === 'zh' ? '完整一致' : 'Verified')}</span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
              {status.expectedCrc}
            </div>
          </div>

          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">{t.layer3}</div>
            <div className="text-xs font-mono text-sky-400 font-bold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>.bak ready</span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{status.bakSizeBytes} bytes</div>
          </div>

          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">{t.layer4}</div>
            <div className="text-xs font-mono text-indigo-400 font-bold mt-1 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              <span>{status.hasLock ? 'Locked' : 'Unlocked'}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">nodedb.dat.lock</div>
          </div>

          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">{t.layer5}</div>
            <div className="text-xs font-mono text-emerald-400 font-bold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Hardware sync</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Flush dirty pages</div>
          </div>

          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">{t.layer6}</div>
            <div className="text-xs font-mono text-purple-400 font-bold mt-1 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" />
              <span>On Startup</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Zero pointer drift</div>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-lg bg-indigo-950/50 border border-indigo-800/60 text-indigo-200 text-xs font-mono flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Interactive Crash & Recovery Lab Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
          {lang === 'zh' ? '灾难模拟与自愈恢复实测' : 'Crash Simulation & Self-Healing Testing'}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleCorrupt}
            disabled={processing}
            className="px-3.5 py-2 text-xs font-medium text-rose-300 bg-rose-950/70 hover:bg-rose-900/80 border border-rose-800/80 rounded transition-colors flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>{t.simBitRotBtn}</span>
          </button>

          <button
            onClick={handleRecover}
            disabled={processing}
            className="px-3.5 py-2 text-xs font-medium text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-800/80 rounded transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.autoRecoverBtn}</span>
          </button>

          <button
            onClick={handleRebuild}
            disabled={processing}
            className="px-3.5 py-2 text-xs font-medium text-purple-300 bg-purple-950/70 hover:bg-purple-900/80 border border-purple-800/80 rounded transition-colors flex items-center gap-1.5"
          >
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>{t.rebuildIdxBtn}</span>
          </button>
        </div>
      </div>

      {/* Raw File Inspector */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900 shadow-sm">
        <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              {t.diskInspectorTitle}
            </h2>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setActiveFileTab('primary')}
              className={`px-2.5 py-1 text-xs rounded font-mono ${
                activeFileTab === 'primary' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              nodedb.dat ({status.fileSizeBytes} B)
            </button>
            <button
              onClick={() => setActiveFileTab('backup')}
              className={`px-2.5 py-1 text-xs rounded font-mono ${
                activeFileTab === 'backup' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              nodedb.dat.bak ({status.bakSizeBytes} B)
            </button>
          </div>
        </div>

        <div className="p-4 bg-slate-950 font-mono text-xs overflow-x-auto max-h-72">
          {loadingRaw ? (
            <div className="text-slate-500 py-6 text-center">Reading storage blocks from filesystem...</div>
          ) : rawFiles ? (
            <pre className="text-slate-300 leading-relaxed">
              {activeFileTab === 'primary' ? rawFiles.primary : rawFiles.backup || '(No backup file created yet)'}
            </pre>
          ) : (
            <div className="text-slate-500 py-6 text-center">Unable to load raw file.</div>
          )}
        </div>
      </div>

      {/* Live Storage Audit Log Stream */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900 shadow-sm">
        <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            {t.auditLogsTitle} ({status.logs.length} events)
          </h2>
          <button
            onClick={onRefresh}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            {t.refreshBtn}
          </button>
        </div>

        <div className="p-3 divide-y divide-slate-800/60 max-h-60 overflow-y-auto font-mono text-xs">
          {status.logs.map((log) => {
            let color = 'text-slate-400';
            if (log.type === 'WRITE') color = 'text-indigo-400';
            if (log.type === 'BACKUP') color = 'text-sky-400';
            if (log.type === 'CRC_VERIFIED') color = 'text-emerald-400';
            if (log.type === 'CRC_CORRUPTED') color = 'text-rose-400 font-bold';
            if (log.type === 'RECOVER') color = 'text-amber-400 font-bold';

            return (
              <div key={log.id} className="py-2 flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-800 bg-slate-950 ${color}`}>
                    {log.type}
                  </span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
                <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                  {log.timestamp.slice(11, 19)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
