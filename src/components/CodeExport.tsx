import React, { useState } from 'react';
import { Copy, Check, Download, Terminal, FileCode, CheckCircle2 } from 'lucide-react';
import { Language, translations } from '../i18n/translations';

interface CodeExportProps {
  lang: Language;
}

export const CodeExport: React.FC<CodeExportProps> = ({ lang }) => {
  const t = translations[lang];
  const [activeLang, setActiveLang] = useState<'python' | 'node'>('python');
  const [pythonCode, setPythonCode] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  React.useEffect(() => {
    const fetchPyCode = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/db/python-code');
        const data = await res.json();
        setPythonCode(data.code || '# Failed to load python code');
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPyCode();
  }, []);

  const nodeExampleSnippet = `/**
 * NodeDB - 纯 TypeScript / Node.js 高性能自建引擎
 * 集成：自建平衡 B-树、二级多值范围索引、唯一列哈希索引、
 * 时间有序 Base62 唯一短键自动生成、SQLite AUTOINCREMENT 自增行为、CRC32 原子写入防灾
 */

import { Database } from './src/engine/database';
import { TableSchema } from './src/engine/table';

// 1. 初始化持久化数据库实例
const db = new Database('./data/my_app.ndb');
db.init();

// 2. 声明数据表 Schema 约束与多索引结构
const schema: TableSchema = {
  name: 'orders',
  primaryKeyColumn: 'id',
  columns: [
    { name: 'id', type: 'number', isPrimaryKey: true, autoIncrement: true }, // SQLite AUTOINCREMENT 自增主键 (删除永不复用)
    { name: 'order_no', type: 'string', isShortKey: true, isUnique: true },    // 时间有序 Base62 短键 (插入时若为空自动生成)
    { name: 'customer_email', type: 'string', isUnique: true },               // 唯一列哈希索引 (O(1) 点查与唯一约束)
    { name: 'amount', type: 'number', isSecondaryIndex: true },               // 二级多值 B-树索引 (支持 BETWEEN 区间扫描)
    { name: 'status', type: 'string', isSecondaryIndex: true }
  ]
};

const orders = db.createTable(schema);

// 3. 插入记录：未指定 id 时自动分配持久化 next_id；未指定 order_no 时自动生成时间有序 Base62 短键
const row = orders.insert({
  customer_email: 'client@company.com',
  amount: 450,
  status: 'completed'
});
console.log('Inserted Row:', row);
// 打印结果: { id: 1, order_no: '00VWI3KL901b2', customer_email: 'client@company.com', amount: 450, status: 'completed' }

// 4. 执行条件查询并生成优化器 EXPLAIN 计划
const { rows, plan } = orders.query([
  { column: 'amount', operator: 'BETWEEN', value: 100, value2: 500 }
]);
console.log('Query Strategy:', plan.strategy); // 'SECONDARY_BTREE_RANGE'
console.log('Execution Time:', plan.executionTimeMs, 'ms');

// 5. 原子保存：写入 .tmp，fsync 硬件物理刷盘，轮转归档 .bak，原子重命名替换
db.save();
`;

  const currentCode = activeLang === 'python' ? pythonCode : nodeExampleSnippet;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = activeLang === 'python' ? 'pynodedb.py' : 'nodedb_example.ts';
    const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCode className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white">{t.sdkExportTitle}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {t.sdkExportSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800">
              <button
                onClick={() => setActiveLang('python')}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  activeLang === 'python' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Python (pynodedb.py)
              </button>
              <button
                onClick={() => setActiveLang('node')}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  activeLang === 'node' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Node.js / TypeScript SDK
              </button>
            </div>

            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.copiedNotice : t.copyBtn}</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.downloadBtn}</span>
            </button>
          </div>
        </div>

        {/* Feature Checklist Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>自建平衡 B-树 (Order t)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>SQLite AUTOINCREMENT (next_id)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>自动 Base62 短键 (插入时生成)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>原子写入 + CRC32 + fsync</span>
          </div>
        </div>
      </div>

      {/* Code Viewer */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950 shadow-sm">
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">
            {activeLang === 'python' ? 'src/engine/pynodedb.py (纯 Python 标准库实现，自带自动化测试套件)' : 'src/engine/example.ts (TypeScript / Node.js 完整调用范例)'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            {currentCode.split('\n').length} lines
          </span>
        </div>

        <div className="p-4 overflow-x-auto max-h-[580px] font-mono text-xs">
          {loading ? (
            <div className="text-slate-500 py-12 text-center">Loading code export...</div>
          ) : (
            <pre className="text-slate-300 leading-relaxed">
              <code>{currentCode}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
