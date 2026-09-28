import React, { useState } from 'react';
import { Database, Plus, Trash2, Key, Sparkles, Layers, Shield, RefreshCw, CheckCircle2 } from 'lucide-react';
import { TableSchema, ColumnSchema } from '../engine/table';
import { Language } from '../i18n/translations';

interface TableEditorProps {
  lang: Language;
  tables: Array<{
    name: string;
    rowCount: number;
    next_id: number;
    pkColumn: string;
    schema: TableSchema;
  }>;
  currentTable: string;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

export const TableEditor: React.FC<TableEditorProps> = ({
  lang,
  tables,
  currentTable,
  onRefresh,
  showToast
}) => {
  const selectedTableObj = tables.find(t => t.name === currentTable);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<'string' | 'number' | 'boolean' | 'date'>('string');
  const [isSecondaryIndex, setIsSecondaryIndex] = useState(false);
  const [isUnique, setIsUnique] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const handleReindex = async () => {
    if (!currentTable) return;
    setReindexing(true);
    try {
      const res = await fetch(`/api/db/table/${currentTable}/reindex`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reindex failed');
      showToast(lang === 'zh'
        ? `表 "${currentTable}" 磁盘索引已成功完成重整与紧凑整理！耗时 ${data.result.durationMs}ms`
        : `Table "${currentTable}" disk indexes reindexed successfully in ${data.result.durationMs}ms`);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setReindexing(false);
    }
  };

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim() || !selectedTableObj) return;

    const updatedSchema: TableSchema = {
      ...selectedTableObj.schema,
      columns: [
        ...selectedTableObj.schema.columns,
        {
          name: newColName.trim(),
          type: newColType,
          isSecondaryIndex,
          isUnique
        }
      ]
    };

    try {
      const res = await fetch(`/api/db/tables/${currentTable}/schema`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: updatedSchema })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update schema');

      showToast(lang === 'zh' ? `表 "${currentTable}" 结构已成功更新，新列已添加！` : `Schema updated successfully!`);
      setNewColName('');
      setIsSecondaryIndex(false);
      setIsUnique(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Database className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {lang === 'zh' ? '表结构与索引快速修改管理器 (Table & Index Studio)' : 'Table & Index Studio'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {lang === 'zh'
                ? '查看当前表结构定义、动态添加列与索引、执行磁盘索引页紧凑整理。'
                : 'Inspect table schema, add columns & indexes, and manage disk-backed B-Tree storage.'}
            </p>
          </div>
        </div>

        <button
          onClick={handleReindex}
          disabled={reindexing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${reindexing ? 'animate-spin' : ''}`} />
          <span>{lang === 'zh' ? '执行磁盘索引紧凑重整 (REINDEX)' : 'Reindex Table'}</span>
        </button>
      </div>

      {selectedTableObj ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧：当前表结构列表 */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>{selectedTableObj.name} - {lang === 'zh' ? '字段与索引定义' : 'Schema & Indexes'}</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-medium">
                    <th className="py-2.5 px-3">Column Name</th>
                    <th className="py-2.5 px-3">Data Type</th>
                    <th className="py-2.5 px-3">Constraints & Indexes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                  {selectedTableObj.schema.columns.map((col: ColumnSchema) => (
                    <tr key={col.name} className="hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-bold text-white flex items-center gap-2">
                        {col.isPrimaryKey ? <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : null}
                        <span>{col.name}</span>
                      </td>
                      <td className="py-3 px-3 text-indigo-300">{col.type}</td>
                      <td className="py-3 px-3 flex flex-wrap gap-1.5 font-sans">
                        {col.isPrimaryKey && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">PRIMARY KEY</span>
                        )}
                        {col.autoIncrement && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">AUTOINCREMENT</span>
                        )}
                        {col.isShortKey && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 font-bold">SHORTKEY (Base62)</span>
                        )}
                        {col.isUnique && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">UNIQUE HASH</span>
                        )}
                        {col.isSecondaryIndex && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">B-TREE INDEX</span>
                        )}
                        {!col.isPrimaryKey && !col.isUnique && !col.isSecondaryIndex && !col.isShortKey && (
                          <span className="text-[10px] text-slate-500">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-semibold text-slate-300">💡 存储架构说明 (Low Memory Disk Engine)：</div>
              <p>
                主键及二级索引均持久化存储在磁盘 4KB 扇区对齐的 .idx 文件中，采用 V8 二进制页序列化压缩 90%+ 空间；查询通过 Buffer Pool LRU 缓存按需加载，无需将全量数据加载入内存。
              </p>
            </div>
          </div>

          {/* 右侧：添加新列与索引 */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>{lang === 'zh' ? '添加新字段与索引' : 'Add Column & Index'}</span>
            </h2>

            <form onSubmit={handleAddColumn} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  {lang === 'zh' ? '字段名称 (Column Name)' : 'Column Name'}
                </label>
                <input
                  type="text"
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  placeholder="e.g. status, score, tags"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  {lang === 'zh' ? '数据类型 (Data Type)' : 'Data Type'}
                </label>
                <select
                  value={newColType}
                  onChange={e => setNewColType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                >
                  <option value="string">string (TEXT)</option>
                  <option value="number">number (INT / DOUBLE)</option>
                  <option value="boolean">boolean (BOOL)</option>
                  <option value="date">date (DATE / TIMESTAMP)</option>
                </select>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="text-slate-300 font-semibold mb-1">
                  {lang === 'zh' ? '索引与约束配置' : 'Index & Constraints'}
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={isSecondaryIndex}
                    onChange={e => setIsSecondaryIndex(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span>
                    {lang === 'zh' ? '创建二级多值 B-树索引 (支持区间与范围查询)' : 'Create Secondary B-Tree Index'}
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={isUnique}
                    onChange={e => setIsUnique(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span>
                    {lang === 'zh' ? '创建唯一哈希索引 (O(1) 点查与防重约束)' : 'Create Unique Hash Index'}
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow transition cursor-pointer mt-4"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{lang === 'zh' ? '确认添加字段与索引' : 'Apply Schema Update'}</span>
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          {lang === 'zh' ? '请先选择一个有效的数据表。' : 'Please select a table.'}
        </div>
      )}
    </div>
  );
};
