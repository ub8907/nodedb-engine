import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle2, FileJson, RefreshCw, Layers, Shield, HardDrive, Key } from 'lucide-react';
import { Language, translations } from '../i18n/translations';
import { NodeDBConfig, DEFAULT_CONFIG } from '../engine/config';

interface ConfigViewerProps {
  lang: Language;
}

export const ConfigViewer: React.FC<ConfigViewerProps> = ({ lang }) => {
  const t = translations[lang];
  const [config, setConfig] = useState<NodeDBConfig>(DEFAULT_CONFIG);
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(DEFAULT_CONFIG, null, 2));
  const [savedNotice, setSavedNotice] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/db/config');
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          setJsonText(JSON.stringify(data, null, 2));
        }
      } catch (err) {
        // Fallback to DEFAULT_CONFIG
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setErrorNotice(null);
    try {
      const parsed = JSON.parse(jsonText);
      const res = await fetch('/api/db/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonText
      });
      if (!res.ok) throw new Error('Failed to update config on server');
      setConfig(parsed);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err: any) {
      setErrorNotice(err.message || 'JSON 语法错误');
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setJsonText(JSON.stringify(DEFAULT_CONFIG, null, 2));
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white">{t.configTitle}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {t.configSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors"
            >
              {lang === 'zh' ? '恢复默认配置' : 'Reset to Default'}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t.configSaveBtn}</span>
            </button>
          </div>
        </div>

        {/* Highlighted Parameter Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800 text-xs">
          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span>{lang === 'zh' ? '存储防护参数' : 'Storage Protection'}</span>
            </div>
            <div className="font-mono text-emerald-400 font-bold mt-1">CRC32 + fsync + Atomic</div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">{config.storage?.dataPath || './data/nodedb.dat'}</div>
          </div>

          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>{lang === 'zh' ? '自建 B-树最小度数' : 'B-Tree Minimum Degree'}</span>
            </div>
            <div className="font-mono text-sky-400 font-bold mt-1">t = {config.index?.defaultBTreeDegree || 3}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {lang === 'zh' ? '每节点 2~5 键主动分裂' : '2~5 keys per node'}
            </div>
          </div>

          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-purple-400" />
              <span>{lang === 'zh' ? '当前执行引擎' : 'Active Engine'}</span>
            </div>
            <div className="font-mono text-purple-400 font-bold mt-1 uppercase">
              {config.engine?.activeEngine === 'rust' ? '🚀 Rust MiniDB' : '⚡ Node.js V4'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {config.engine?.activeEngine === 'rust' ? (lang === 'zh' ? '零全量内存加载' : 'Zero-RAM Index') : (lang === 'zh' ? '内置流式分块' : 'V4 Chunk Stream')}
            </div>
          </div>

          <div className="p-3 rounded bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>{lang === 'zh' ? '自动 Base62 短键' : 'Auto Base62 ShortKey'}</span>
            </div>
            <div className="font-mono text-amber-400 font-bold mt-1">
              {((config.base62ShortKey?.timePartLength || 9) + (config.base62ShortKey?.entropyPartLength || 4))} {lang === 'zh' ? '位紧凑编码' : 'chars'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {lang === 'zh' ? '前 9 位时间 + 4 位熵' : '9-char time + 4-char entropy'}
            </div>
          </div>
        </div>
      </div>

      {/* Engine Selection & Rust Integration Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span>{lang === 'zh' ? '前端数据库执行引擎配置 (Engine Switcher)' : 'Database Engine Configuration'}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {lang === 'zh'
                ? '可在 Node.js 原生流式分块内核与 Rust 纯磁盘索引原生引擎间无缝切换，实现极致低内存与跨语言通用。'
                : 'Configure between Node.js stream engine and Rust zero-RAM on-disk sparse index engine.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/db/reindex-all', { method: 'POST' });
                  const data = await res.json();
                  alert(lang === 'zh' ? `一键重建全部索引完成！耗时 ${data.durationMs}ms` : `Reindexed all in ${data.durationMs}ms`);
                } catch (e: any) {
                  alert(e.message);
                }
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '一键重建全部索引' : 'Rebuild All Indexes'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div
            onClick={() => {
              const updated = { ...config, engine: { ...config.engine, activeEngine: 'node' as const } };
              setConfig(updated);
              setJsonText(JSON.stringify(updated, null, 2));
            }}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              config.engine?.activeEngine === 'node'
                ? 'bg-slate-950 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-white font-sans text-sm flex items-center gap-1.5">
                <span>⚡ Node.js V4 块级流引擎</span>
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${config.engine?.activeEngine === 'node' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {config.engine?.activeEngine === 'node' ? 'ACTIVE' : 'SELECT'}
              </span>
            </div>
            <p className="text-slate-400 text-[11px] font-sans leading-relaxed">
              {lang === 'zh'
                ? '纯 TypeScript 自研 NDB4 架构，自建平衡 B-树与 CRC32 防灾原子落盘，启动内存开销 < 50KB。'
                : 'Pure TypeScript NDB4 block architecture with self-balancing B-Tree and CRC32 protection.'}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 flex justify-between">
              <span>文件: {config.storage?.dataPath || './data/nodedb.dat'}</span>
              <span>格式: NDB4_BINARY</span>
            </div>
          </div>

          <div
            onClick={() => {
              const updated = { ...config, engine: { ...config.engine, activeEngine: 'rust' as const } };
              setConfig(updated);
              setJsonText(JSON.stringify(updated, null, 2));
            }}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              config.engine?.activeEngine === 'rust'
                ? 'bg-slate-950 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-white font-sans text-sm flex items-center gap-1.5">
                <span>🚀 Rust MiniDB 原生引擎</span>
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${config.engine?.activeEngine === 'rust' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {config.engine?.activeEngine === 'rust' ? 'ACTIVE' : 'SELECT'}
              </span>
            </div>
            <p className="text-slate-400 text-[11px] font-sans leading-relaxed">
              {lang === 'zh'
                ? 'Rust 纯磁盘索引与微批次 Deflate 压缩块。启动时零索引加载，磁盘原地二分点查，常驻内存 < 10KB。'
                : 'Rust native engine with 32-byte on-disk sparse index and binary search. Zero-RAM startup.'}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 flex justify-between">
              <span>产物: {config.engine?.rustBinaryPath || './rust/target/release/minidb-cli'}</span>
              <span>存储: {config.engine?.rustDataPath || './data/minidb.dat'}</span>
            </div>
          </div>
        </div>
      </div>

      {savedNotice && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{t.configSavedNotice}</span>
        </div>
      )}

      {errorNotice && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-mono">
          {errorNotice}
        </div>
      )}

      {/* JSON Config Editor */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950 shadow-sm">
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-white font-mono">nodedb.config.json</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {lang === 'zh' ? '可直接在此编辑并点击保存生效' : 'Editable JSON configuration'}
          </span>
        </div>

        <div className="p-4 font-mono text-xs">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={18}
            className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono leading-relaxed"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};
