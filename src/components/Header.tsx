import React from 'react';
import { Database, HardDrive, Languages, Settings } from 'lucide-react';
import { Language, translations } from '../i18n/translations';

export type ActiveTab = 'explorer' | 'table-editor' | 'sql' | 'query' | 'btree' | 'storage' | 'base62' | 'benchmark' | 'docs' | 'code' | 'config' | 'bufferpool';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  onAtomicSave: () => void;
  onResetDb: () => void;
  saving: boolean;
  crcStatus: {
    expected: string;
    actual: string;
    isCorrupt: boolean;
  };
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  lang,
  setLang,
  onAtomicSave,
  onResetDb,
  saving,
  crcStatus
}) => {
  const t = translations[lang];

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'explorer', label: t.navExplorer },
    { id: 'table-editor', label: lang === 'zh' ? '表与索引设计' : 'Table Studio' },
    { id: 'sql', label: t.navSql },
    { id: 'query', label: t.navQuery },
    { id: 'btree', label: t.navBTree },
    { id: 'bufferpool', label: t.navBufferPool },
    { id: 'storage', label: t.navStorage },
    { id: 'base62', label: t.navBase62 },
    { id: 'benchmark', label: t.navBenchmark },
    { id: 'docs', label: t.navDocs },
    { id: 'code', label: t.navCode },
    { id: 'config', label: t.navConfig },
  ];

  const toggleLang = () => {
    setLang(lang === 'zh' ? 'en' : 'zh');
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <span className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white text-xs font-mono font-bold shadow-sm">
                NDB
              </span>
              {t.brandTitle}
            </span>
            <span className="text-xs text-slate-500 font-mono hidden xl:inline">
              · {t.brandSubtitle}
            </span>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-800 text-indigo-400 font-semibold shadow-inner'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Actions + Language Switcher */}
          <div className="flex items-center gap-2">
            {/* Language Toggle Button */}
            <button
              onClick={toggleLang}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              title={lang === 'zh' ? '切换至英文 (Switch to English)' : '切换至中文 (Switch to Chinese)'}
            >
              <Languages className="w-3.5 h-3.5 text-indigo-400" />
              <span>{lang === 'zh' ? 'EN' : '中文'}</span>
            </button>

            {/* CRC32 Checksum Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-500">CRC32:</span>
              <span className={crcStatus.isCorrupt ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                {crcStatus.expected.slice(0, 8)}
              </span>
            </div>

            {/* Atomic Save Action Button */}
            <button
              onClick={onAtomicSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-md transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap disabled:opacity-50"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{saving ? 'Syncing...' : t.atomicSaveBtn}</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex lg:hidden overflow-x-auto py-2 gap-1 border-t border-slate-800/60 scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-2.5 py-1 text-xs rounded font-medium whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800 text-indigo-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
