import React, { useState, useEffect } from 'react';
import { Database, HardDrive, Languages, Cpu, Activity, Layers, FolderPlus, Terminal, BookOpen, Settings, BarChart2, Shield, Hash, Code } from 'lucide-react';
import { Language, translations } from '../i18n/translations';
import { ActiveTab } from './Header';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  onAtomicSave: () => void;
  saving: boolean;
  onOpenImporter: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  lang,
  setLang,
  onAtomicSave,
  saving,
  onOpenImporter
}) => {
  const t = translations[lang];
  const [liveMem, setLiveMem] = useState({
    rss: 0,
    heapUsed: 0,
    heapTotal: 0,
    fileSizeMb: '0.00',
    connected: false
  });

  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/stream/memory');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLiveMem({
            rss: data.rss || 0,
            heapUsed: data.heapUsed || 0,
            heapTotal: data.heapTotal || 0,
            fileSizeMb: data.fileSizeMb || '0.00',
            connected: true
          });
        } catch {}
      };
      eventSource.onerror = () => {
        setLiveMem(prev => ({ ...prev, connected: false }));
      };
    } catch {
      setLiveMem(prev => ({ ...prev, connected: false }));
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  const navItems: Array<{ id: ActiveTab; label: string; icon: any }> = [
    { id: 'explorer', label: t.navExplorer, icon: Database },
    { id: 'table-editor', label: lang === 'zh' ? '表与索引设计' : 'Table Studio', icon: Layers },
    { id: 'sql', label: t.navSql, icon: Terminal },
    { id: 'query', label: t.navQuery, icon: Activity },
    { id: 'btree', label: t.navBTree, icon: Hash },
    { id: 'bufferpool', label: t.navBufferPool, icon: Cpu },
    { id: 'storage', label: t.navStorage, icon: HardDrive },
    { id: 'base62', label: t.navBase62, icon: Shield },
    { id: 'benchmark', label: t.navBenchmark, icon: BarChart2 },
    { id: 'docs', label: t.navDocs, icon: BookOpen },
    { id: 'code', label: t.navCode, icon: Code },
    { id: 'config', label: t.navConfig, icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-screen sticky top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-mono font-bold text-xs shadow-sm">
            NDB
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">{t.brandTitle}</h1>
            <p className="text-[10px] text-slate-400 font-mono">Zero-OOM Embedded DB</p>
          </div>
        </div>
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="p-1.5 text-xs font-semibold rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors flex items-center gap-1 cursor-pointer"
          title="Switch Language"
        >
          <Languages className="w-3.5 h-3.5 text-indigo-400" />
          <span>{lang === 'zh' ? 'EN' : '中文'}</span>
        </button>
      </div>

      {/* WSS / SSE Real-time Memory Usage Widget */}
      <div className="p-3 mx-3 my-3 bg-slate-900/90 border border-slate-800 rounded-lg shadow-inner">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
            <Cpu className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>{lang === 'zh' ? 'WSS 实时内存监控' : 'Live WSS Memory'}</span>
          </div>
          <span className={`w-2 h-2 rounded-full ${liveMem.connected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-rose-500'}`} title={liveMem.connected ? 'Connected' : 'Disconnected'} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/60">
            <div className="text-slate-500 text-[10px]">HEAP USED</div>
            <div className="text-indigo-400 font-bold">{liveMem.heapUsed} MB</div>
          </div>
          <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/60">
            <div className="text-slate-500 text-[10px]">RSS MEM</div>
            <div className="text-emerald-400 font-bold">{liveMem.rss} MB</div>
          </div>
        </div>
        <div className="mt-2 text-[10px] text-slate-400 font-mono flex items-center justify-between">
          <span>{lang === 'zh' ? '磁盘文件大小' : 'DB File Size'}:</span>
          <span className="text-slate-200 font-bold">{liveMem.fileSizeMb} MB</span>
        </div>
      </div>

      {/* Action Buttons: Import & Atomic Save */}
      <div className="px-3 pb-3 grid grid-cols-2 gap-2">
        <button
          onClick={onOpenImporter}
          className="px-2.5 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 rounded transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          title={lang === 'zh' ? '大文件后台流式导入' : 'Stream Import File'}
        >
          <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
          <span>{lang === 'zh' ? '导入大文件' : 'Import'}</span>
        </button>

        <button
          onClick={onAtomicSave}
          disabled={saving}
          className="px-2.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>{saving ? 'Sync...' : t.atomicSaveBtn}</span>
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-800">
        <div className="text-[10px] font-mono text-slate-400 px-3 py-1 uppercase tracking-wider">{lang === 'zh' ? '导航菜单' : 'Navigation'}</div>
        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-2.5 text-left cursor-pointer ${
                isActive
                  ? 'bg-slate-800/90 text-indigo-400 font-semibold shadow-sm border-l-2 border-indigo-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <IconComponent className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer info */}
      <div className="p-3 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono text-center">
        NodeDB V4 · Zero-OOM Engine
      </div>
    </aside>
  );
};
