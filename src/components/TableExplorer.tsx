import React, { useState } from 'react';
import { Plus, Trash2, Key, Hash, Layers, Shield, Search, ArrowUpDown, Clock, Sparkles, AlertTriangle, Check, X } from 'lucide-react';
import { TableSchema, ColumnSchema } from '../engine/table';
import { Language, translations } from '../i18n/translations';

interface TableExplorerProps {
  lang: Language;
  tableName: string;
  setTableName: (name: string) => void;
  tables: Array<{ name: string; rowCount: number; next_id: number; pkColumn: string; schema: TableSchema }>;
  tableData: {
    schema?: TableSchema;
    next_id: number;
    rows: any[];
    rowCount?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    queryTimeMs?: number;
    strategy?: string;
    pkVisualTree: any;
  } | null;
  onInsertRow: (row: any) => Promise<void>;
  onDeleteRow: (pk: any) => Promise<void>;
  onCreateTable?: (schema: TableSchema) => Promise<void>;
  onDropTable?: (name: string) => Promise<void>;
  onOpenLargeImporter?: () => void;
  onRefresh: () => void;
  onPageChange?: (page: number, pageSize: number, sortBy?: string, sortOrder?: 'ASC' | 'DESC') => void;
}

export const TableExplorer: React.FC<TableExplorerProps> = ({
  lang,
  tableName,
  setTableName,
  tables,
  tableData,
  onInsertRow,
  onDeleteRow,
  onCreateTable,
  onDropTable,
  onOpenLargeImporter,
  onRefresh,
  onPageChange
}) => {
  const t = translations[lang];
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [insertError, setInsertError] = useState<string | null>(null);
  const [inserting, setInserting] = useState(false);
  const [pkSearchInput, setPkSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [searchNotFound, setSearchNotFound] = useState(false);

  // 创建数据表模态窗状态
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [newTableName, setNewTableName] = useState('products');
  const [newTableColumns, setNewTableColumns] = useState<ColumnSchema[]>([
    { name: 'id', type: 'number', isPrimaryKey: true, autoIncrement: true },
    { name: 'sku', type: 'string', isShortKey: true, isUnique: true },
    { name: 'title', type: 'string' },
    { name: 'price', type: 'number', isSecondaryIndex: true },
    { name: 'category', type: 'string', isSecondaryIndex: true },
    { name: 'in_stock', type: 'boolean' }
  ]);
  const [createTableError, setCreateTableError] = useState<string | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);

  // 删除数据表确认模态窗状态
  const [showDropConfirm, setShowDropConfirm] = useState(false);
  const [droppingTable, setDroppingTable] = useState(false);

  // 修改指定表结构与索引模态窗状态
  const [showEditSchemaModal, setShowEditSchemaModal] = useState(false);
  const [editColumns, setEditColumns] = useState<ColumnSchema[]>([]);
  const [editSchemaError, setEditSchemaError] = useState<string | null>(null);
  const [editingSchema, setEditingSchema] = useState(false);

  const handleUpdateSchema = async () => {
    if (!tableName) return;
    if (editColumns.length === 0) {
      setEditSchemaError('数据表至少需要定义一个字段。');
      return;
    }
    const pk = editColumns.find(c => c.isPrimaryKey);
    const pkColumn = pk ? pk.name : editColumns[0].name;

    setEditingSchema(true);
    setEditSchemaError(null);
    try {
      const res = await fetch(`/api/db/table/${tableName}/schema`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: {
            name: tableName,
            primaryKeyColumn: pkColumn,
            columns: editColumns
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update schema');

      setShowEditSchemaModal(false);
      onRefresh();
    } catch (err: any) {
      setEditSchemaError(err.message || '修改表结构失败');
    } finally {
      setEditingSchema(false);
    }
  };

  // 快捷模版加载
  const applyPresetTemplate = (templateName: 'products' | 'users' | 'iot') => {
    if (templateName === 'products') {
      setNewTableName('products');
      setNewTableColumns([
        { name: 'id', type: 'number', isPrimaryKey: true, autoIncrement: true },
        { name: 'sku', type: 'string', isShortKey: true, isUnique: true },
        { name: 'title', type: 'string' },
        { name: 'price', type: 'number', isSecondaryIndex: true },
        { name: 'category', type: 'string', isSecondaryIndex: true },
        { name: 'in_stock', type: 'boolean' }
      ]);
    } else if (templateName === 'users') {
      setNewTableName('users');
      setNewTableColumns([
        { name: 'id', type: 'number', isPrimaryKey: true, autoIncrement: true },
        { name: 'user_tag', type: 'string', isShortKey: true, isUnique: true },
        { name: 'username', type: 'string', isUnique: true },
        { name: 'email', type: 'string', isUnique: true },
        { name: 'role', type: 'string', isSecondaryIndex: true },
        { name: 'credit', type: 'number', isSecondaryIndex: true }
      ]);
    } else if (templateName === 'iot') {
      setNewTableName('iot_telemetry');
      setNewTableColumns([
        { name: 'seq', type: 'number', isPrimaryKey: true, autoIncrement: true },
        { name: 'sensor_code', type: 'string', isShortKey: true, isUnique: true },
        { name: 'temperature', type: 'number', isSecondaryIndex: true },
        { name: 'humidity', type: 'number', isSecondaryIndex: true },
        { name: 'zone', type: 'string', isSecondaryIndex: true }
      ]);
    }
  };

  const currentTable = tables.find(t => t.name === tableName);
  const schema = currentTable?.schema || tableData?.schema;
  const rows = tableData?.rows || [];
  const nextId = tableData?.next_id || currentTable?.next_id || 1;
  const totalRows = tableData?.rowCount ?? currentTable?.rowCount ?? rows.length;

  // 分页与排序本地控制状态
  const [currentPage, setCurrentPage] = useState<number>(tableData?.page || 1);
  const [pageSize, setPageSize] = useState<number>(tableData?.pageSize || 50);
  const [sortBy, setSortBy] = useState<string>(tableData?.sortBy || schema?.primaryKeyColumn || '');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>(tableData?.sortOrder || 'ASC');

  React.useEffect(() => {
    if (tableData) {
      if (tableData.page) setCurrentPage(tableData.page);
      if (tableData.pageSize) setPageSize(tableData.pageSize);
      if (tableData.sortBy) setSortBy(tableData.sortBy);
      if (tableData.sortOrder) setSortOrder(tableData.sortOrder);
    }
  }, [tableData]);

  const handleSortClick = (colName: string) => {
    let nextOrder: 'ASC' | 'DESC' = 'ASC';
    if (sortBy === colName) {
      nextOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
    }
    setSortBy(colName);
    setSortOrder(nextOrder);
    setCurrentPage(1);
    if (onPageChange) {
      onPageChange(1, pageSize, colName, nextOrder);
    }
  };

  const handlePageJump = (newPage: number) => {
    const totalPages = tableData?.totalPages || Math.ceil(totalRows / pageSize) || 1;
    const clamped = Math.max(1, Math.min(totalPages, newPage));
    setCurrentPage(clamped);
    if (onPageChange) {
      onPageChange(clamped, pageSize, sortBy, sortOrder);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    if (onPageChange) {
      onPageChange(1, newSize, sortBy, sortOrder);
    }
  };

  const handleOpenInsert = () => {
    setInsertError(null);
    const defaults: Record<string, any> = {};
    if (schema) {
      for (const col of schema.columns) {
        if (col.autoIncrement) {
          defaults[col.name] = ''; // Left blank to showcase SQLite AUTOINCREMENT next_id
        } else if (col.isShortKey) {
          defaults[col.name] = ''; // Left blank to showcase automatic generation on insert
        } else if (col.type === 'number') {
          defaults[col.name] = Math.floor(Math.random() * 800) + 50;
        } else if (col.name === 'customer_email') {
          defaults[col.name] = `user_${Math.floor(Math.random() * 9000) + 1000}@demo.com`;
        } else if (col.name === 'status') {
          defaults[col.name] = ['completed', 'pending', 'shipped'][Math.floor(Math.random() * 3)];
        } else if (col.name === 'node_zone') {
          defaults[col.name] = ['US-EAST', 'EU-CENTRAL', 'AP-NORTHEAST'][Math.floor(Math.random() * 3)];
        } else {
          defaults[col.name] = 'Sample Value';
        }
      }
    }
    setFormValues(defaults);
    setShowInsertModal(true);
  };

  const handleSubmitInsert = async (e: React.FormEvent) => {
    e.preventDefault();
    setInserting(true);
    setInsertError(null);
    try {
      const payload: Record<string, any> = {};
      for (const [key, val] of Object.entries(formValues)) {
        if (val !== '' && val !== undefined) {
          const colDef = schema?.columns.find(c => c.name === key);
          if (colDef?.type === 'number') {
            payload[key] = Number(val);
          } else {
            payload[key] = val;
          }
        }
      }
      await onInsertRow(payload);
      setShowInsertModal(false);
    } catch (err: any) {
      setInsertError(err.message || 'Failed to insert row');
    } finally {
      setInserting(false);
    }
  };

  const handlePkSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkSearchInput.trim()) {
      setSearchResult(null);
      setSearchNotFound(false);
      return;
    }
    const pkCol = schema?.primaryKeyColumn || 'id';
    const target = Number(pkSearchInput) || pkSearchInput;
    const match = rows.find(r => r[pkCol] == target);
    if (match) {
      setSearchResult(match);
      setSearchNotFound(false);
    } else {
      setSearchResult(null);
      setSearchNotFound(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Table Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-indigo-950/60 border border-indigo-800/40 text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <label htmlFor="table-select" className="text-xs text-slate-400 font-medium">
                {t.activeTable}:
              </label>
              <select
                id="table-select"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-100 text-sm font-semibold rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              >
                {tables.map(tItem => (
                  <option key={tItem.name} value={tItem.name}>
                    {tItem.name} ({tItem.rowCount} {t.recordsCount})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
              <span>{t.primaryKey}: <strong className="text-slate-200 font-mono">{schema?.primaryKeyColumn}</strong> (B-Tree)</span>
              <span>·</span>
              <span className="font-mono text-indigo-300">
                {t.persistentNextId}: <strong className="text-white font-bold">{nextId}</strong>
              </span>
              <span>·</span>
              <span>{t.totalRows}: <strong className="text-slate-200 font-mono">{rows.length}</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onCreateTable && (
            <>
              <button
                onClick={() => {
                  setCreateTableError(null);
                  setShowCreateTableModal(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.createTableBtn}</span>
              </button>

              <button
                onClick={async () => {
                  if (confirm(lang === 'zh' ? '确定要一键恢复默认测试表数据 (customers, orders, metrics_log) 吗？这会重建演示表与初始数据。' : 'Restore default test tables? This will reset demo tables and data.')) {
                    try {
                      const res = await fetch('/api/db/restore-defaults', { method: 'POST' });
                      if (res.ok) {
                        onRefresh();
                      } else {
                        const data = await res.json();
                        alert(data.error || '恢复失败');
                      }
                    } catch (err: any) {
                      alert(err.message || '恢复失败');
                    }
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
                title={lang === 'zh' ? '一键恢复原始默认测试表数据' : 'Restore default test tables'}
              >
                <span>🔄 {lang === 'zh' ? '恢复默认表' : 'Restore Defaults'}</span>
              </button>
            </>
          )}

          {schema && (
            <button
              onClick={() => {
                setEditColumns(JSON.parse(JSON.stringify(schema.columns)));
                setEditSchemaError(null);
                setShowEditSchemaModal(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-md transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
              title={lang === 'zh' ? '修改指定表结构、添加删除字段与索引' : 'Edit table schema & indexes'}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '修改表结构' : 'Edit Table'}</span>
            </button>
          )}

          {onOpenLargeImporter && (
            <button
              onClick={onOpenLargeImporter}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-md transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
              title={lang === 'zh' ? '大文件后台流式导入 (几百M支持)' : 'Large File Background Stream Import'}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '大文件导入' : 'Stream Import'}</span>
            </button>
          )}

          <button
            onClick={handleOpenInsert}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.insertRecordBtn}</span>
          </button>

          {tables.length > 1 && onDropTable && (
            <button
              onClick={() => setShowDropConfirm(true)}
              className="px-2.5 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-800/40 rounded-md transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap cursor-pointer"
              title={lang === 'zh' ? '删除当前数据表' : 'Drop current table'}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.dropTableBtn}</span>
            </button>
          )}
        </div>
      </div>

      {/* Feature Architecture Highlight Notice */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold mb-1">
            <Key className="w-3.5 h-3.5" />
            <span>{t.autoIncrementCardTitle}</span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            {t.autoIncrementCardDesc.replace('{nextId}', String(nextId))}
          </p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span>{t.shortKeyCardTitle}</span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            {t.shortKeyCardDesc}
          </p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-2 text-sky-400 font-semibold mb-1">
            <Shield className="w-3.5 h-3.5" />
            <span>{t.multiIndexCardTitle}</span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            {t.multiIndexCardDesc}
          </p>
        </div>
      </div>

      {/* Schema Columns Specification Table */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40">
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            {t.schemaTitle}: {tableName}
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            {schema?.columns.length} columns defined
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-2 font-medium">{t.colName}</th>
                <th className="px-4 py-2 font-medium">{t.colType}</th>
                <th className="px-4 py-2 font-medium">{t.colIndex}</th>
                <th className="px-4 py-2 font-medium">{t.colConstraint}</th>
                <th className="px-4 py-2 font-medium">{t.colComplexity}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {schema?.columns.map(col => {
                let indexType = lang === 'zh' ? '无索引 (全表扫描)' : 'None (Sequential scan)';
                let complexity = 'O(N)';
                let constraint = lang === 'zh' ? '标准字段' : 'Standard';

                if (col.isPrimaryKey) {
                  indexType = lang === 'zh' ? '自建主键 B-树 (Order t=3)' : 'Primary B-Tree (Order t=3)';
                  complexity = 'O(log N)';
                  constraint = col.autoIncrement
                    ? (lang === 'zh' ? 'SQLite AUTOINCREMENT (next_id 持久化)' : 'AUTOINCREMENT (persistent next_id)')
                    : (lang === 'zh' ? '主键唯一' : 'Primary Key');
                } else if (col.isSecondaryIndex) {
                  indexType = lang === 'zh' ? '二级多值 B-树索引' : 'Secondary Multi-value B-Tree';
                  complexity = 'O(log N + K range)';
                  constraint = lang === 'zh' ? '允许重复键与区间范围查询' : 'Allows duplicate keys & range queries';
                } else if (col.isUnique) {
                  indexType = lang === 'zh' ? '唯一列哈希索引' : 'Unique Hash Index';
                  complexity = 'O(1)';
                  constraint = lang === 'zh' ? '唯一性强校验拦截' : 'Unique Constraint';
                }

                if (col.isShortKey) {
                  constraint = lang === 'zh'
                    ? '插入时自动生成 13 位 Base62 (9 位时间戳 + 4 位熵，冲突自动重试)'
                    : 'Auto-generated 13-char Base62 on insert (9-char ms ts + 4-char entropy, retry on collision)';
                }

                return (
                  <tr key={col.name} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-200">
                      {col.name}
                      {col.isPrimaryKey && <span className="ml-1.5 text-indigo-400 text-[10px]">★ PK</span>}
                      {col.isShortKey && <span className="ml-1.5 text-emerald-400 text-[10px] font-mono">⚡ AUTO-SHORTKEY</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono">{col.type}</td>
                    <td className="px-4 py-2.5 text-slate-300">
                      <span className={col.isPrimaryKey ? 'text-indigo-400 font-medium' : col.isSecondaryIndex ? 'text-emerald-400 font-medium' : col.isUnique ? 'text-sky-400 font-medium' : 'text-slate-500'}>
                        {indexType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{constraint}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-400">{complexity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Point Lookup Test via PK B-Tree */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
        <form onSubmit={handlePkSearch} className="flex items-center gap-2 w-full sm:w-auto">
          <label htmlFor="pk-search-input" className="text-xs text-slate-400 whitespace-nowrap font-medium">
            {t.pkDirectSearch}:
          </label>
          <input
            id="pk-search-input"
            type="text"
            placeholder={`${schema?.primaryKeyColumn}...`}
            value={pkSearchInput}
            onChange={(e) => setPkSearchInput(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-xs text-white rounded px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-36 font-mono"
          />
          <button
            type="submit"
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium flex items-center gap-1"
          >
            <Search className="w-3 h-3" />
            <span>{t.searchBtn}</span>
          </button>
        </form>

        {searchResult && (
          <div className="text-xs text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-800/40 px-3 py-1 rounded">
            PK Match: {JSON.stringify(searchResult).slice(0, 80)}...
          </div>
        )}
        {searchNotFound && (
          <div className="text-xs text-rose-400 font-mono bg-rose-950/40 border border-rose-800/40 px-3 py-1 rounded">
            {lang === 'zh' ? 'B-树索引中未查找到该主键。' : 'PK not found in B-Tree index.'}
          </div>
        )}
      </div>

      {/* Live Data Grid */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40 shadow-sm">
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-200">{t.tableRecordsTitle}</h2>
            <span className="text-xs font-mono text-slate-500">
              ({totalRows.toLocaleString()} {t.recordsCount})
            </span>
            {tableData?.strategy && (
              <span className="hidden sm:inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded bg-indigo-950/70 text-indigo-300 border border-indigo-800/60 font-mono text-[10px]">
                ⚡ {tableData.strategy} ({tableData.queryTimeMs}ms)
              </span>
            )}
          </div>
          <button
            onClick={onRefresh}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            {t.refreshBtn}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            <p>{t.noRecords}</p>
            <button
              onClick={handleOpenInsert}
              className="mt-3 px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium underline"
            >
              {t.insertFirstRow}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  {schema?.columns.map(col => (
                    <th
                      key={col.name}
                      onClick={() => handleSortClick(col.name)}
                      className="px-4 py-2.5 font-medium whitespace-nowrap cursor-pointer hover:bg-slate-800/80 transition-colors select-none group"
                      title={lang === 'zh' ? `点击切换 ${col.name} 升序/降序` : `Click to sort by ${col.name}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{col.name}</span>
                        {col.isPrimaryKey && <span className="text-indigo-400 font-mono">★</span>}
                        {col.isShortKey && <span className="text-emerald-400 font-mono">⚡</span>}
                        <span className="text-slate-500 group-hover:text-slate-300">
                          {sortBy === col.name ? (
                            sortOrder === 'ASC' ? (
                              <span className="text-indigo-400 font-bold">▲</span>
                            ) : (
                              <span className="text-indigo-400 font-bold">▼</span>
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                          )}
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 font-medium text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {rows.map((row, idx) => {
                  const pkVal = row[schema?.primaryKeyColumn || 'id'];
                  return (
                    <tr key={pkVal || idx} className="hover:bg-slate-800/30 transition-colors">
                      {schema?.columns.map(col => {
                        const val = row[col.name];
                        const isPk = col.isPrimaryKey;
                        const isShort = col.isShortKey;
                        return (
                          <td
                            key={col.name}
                            className={`px-4 py-2.5 whitespace-nowrap ${
                              isPk
                                ? 'font-bold text-indigo-300 tabular-nums'
                                : isShort
                                ? 'text-emerald-400 font-semibold'
                                : 'text-slate-300'
                            }`}
                          >
                            {val !== undefined && val !== null ? String(val) : <span className="text-slate-600">NULL</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => onDeleteRow(pkVal)}
                          className="px-2 py-1 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors inline-flex items-center gap-1"
                          title={t.deleteNotice}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{t.deleteBtn}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 游标分页控制栏 */}
        {totalRows > 0 && (
          <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span>
                {lang === 'zh'
                  ? `显示第 ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, totalRows)} 条，共 ${totalRows.toLocaleString()} 条记录`
                  : `Showing ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, totalRows)} of ${totalRows.toLocaleString()} records`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500">{lang === 'zh' ? '每页条数:' : 'Per page:'}</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>

              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => handlePageJump(1)}
                  disabled={currentPage <= 1}
                  className="px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="First Page"
                >
                  «
                </button>
                <button
                  onClick={() => handlePageJump(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="Previous Page"
                >
                  ‹
                </button>
                <span className="px-2 font-mono text-slate-300">
                  {currentPage} / {Math.max(1, tableData?.totalPages || Math.ceil(totalRows / pageSize) || 1)}
                </span>
                <button
                  onClick={() => handlePageJump(currentPage + 1)}
                  disabled={currentPage >= (tableData?.totalPages || Math.ceil(totalRows / pageSize) || 1)}
                  className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="Next Page"
                >
                  ›
                </button>
                <button
                  onClick={() => handlePageJump(tableData?.totalPages || Math.ceil(totalRows / pageSize) || 1)}
                  disabled={currentPage >= (tableData?.totalPages || Math.ceil(totalRows / pageSize) || 1)}
                  className="px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="Last Page"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Insert Modal */}
      {showInsertModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                {t.modalInsertTitle} "{tableName}"
              </h2>
              <button
                onClick={() => setShowInsertModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            {insertError && (
              <div className="mb-4 p-2.5 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs">
                {insertError}
              </div>
            )}

            <form onSubmit={handleSubmitInsert} className="space-y-3.5">
              {schema?.columns.map(col => {
                const isAuto = col.autoIncrement;
                const isShort = col.isShortKey;

                return (
                  <div key={col.name}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-mono font-medium text-slate-300">
                        {col.name} {col.isPrimaryKey && <span className="text-indigo-400">(PK)</span>}
                      </label>
                      {isAuto && (
                        <span className="text-[11px] text-indigo-400 font-mono">
                          {lang === 'zh' ? `自增分配: next_id=${nextId}` : `auto: next_id=${nextId}`}
                        </span>
                      )}
                      {isShort && (
                        <span className="text-[11px] text-emerald-400 font-mono">
                          ⚡ {lang === 'zh' ? '插入时自动生成 Base62 短键' : 'auto-generate Base62 on insert'}
                        </span>
                      )}
                    </div>
                    <input
                      type={col.type === 'number' ? 'number' : 'text'}
                      placeholder={
                        isAuto
                          ? `${t.autoAssignedNotice} (${nextId})`
                          : isShort
                          ? t.autoShortKeyNotice
                          : `Enter ${col.name}...`
                      }
                      value={formValues[col.name] ?? ''}
                      onChange={(e) =>
                        setFormValues(prev => ({ ...prev, [col.name]: e.target.value }))
                      }
                      className="w-full bg-slate-950 border border-slate-700 text-xs text-slate-100 rounded px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono"
                    />
                  </div>
                );
              })}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInsertModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded"
                >
                  {t.modalCancel}
                </button>
                <button
                  type="submit"
                  disabled={inserting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors disabled:opacity-50"
                >
                  {inserting ? 'Inserting...' : t.modalSubmit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 创建新数据表模态窗 (Visual Schema Builder) */}
      {showCreateTableModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded bg-emerald-500/10 text-emerald-400">
                  <Layers className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t.createTableModalTitle}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {lang === 'zh'
                      ? '可视化定义字段与约束，系统将自动挂载自建 B-树索引、唯一哈希索引并实时持久化。'
                      : 'Define columns and constraints. The engine auto-initializes self-built B-Trees & hash indexes.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateTableModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm p-1 rounded hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {createTableError && (
              <div className="my-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{createTableError}</span>
              </div>
            )}

            {/* 快速模板选用 */}
            <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800/80">
              <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t.presetTemplate}:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyPresetTemplate('products')}
                  className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-900/40 transition cursor-pointer"
                >
                  🛒 {lang === 'zh' ? '电商商品表 (products)' : 'Products Table'}
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetTemplate('users')}
                  className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-900/40 transition cursor-pointer"
                >
                  👤 {lang === 'zh' ? '用户账户表 (users)' : 'Users Table'}
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetTemplate('iot')}
                  className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-900/40 transition cursor-pointer"
                >
                  📡 {lang === 'zh' ? '遥测监控表 (iot_telemetry)' : 'IoT Telemetry'}
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t.tableNameLabel}:
                </label>
                <input
                  type="text"
                  value={newTableName}
                  onChange={e => setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. inventory"
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded px-3 py-2 font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.columnsDefTitle}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewTableColumns(prev => [
                        ...prev,
                        { name: `col_${prev.length + 1}`, type: 'string', isPrimaryKey: false, autoIncrement: false, isShortKey: false, isUnique: false, isSecondaryIndex: false }
                      ]);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/40 rounded transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{t.addColumnBtn}</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {newTableColumns.map((col, idx) => {
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-950 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                          <span className="text-slate-500 font-mono text-[11px] w-4">{idx + 1}.</span>
                          <input
                            type="text"
                            value={col.name}
                            onChange={e => {
                              const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                              setNewTableColumns(prev => prev.map((c, i) => i === idx ? { ...c, name: val } : c));
                            }}
                            placeholder="column_name"
                            className="w-36 bg-slate-900 border border-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded font-mono focus:outline-none focus:border-indigo-500"
                          />
                          <select
                            value={col.type}
                            onChange={e => {
                              const newType = e.target.value as any;
                              setNewTableColumns(prev => prev.map((c, i) => i === idx ? { ...c, type: newType } : c));
                            }}
                            className="bg-slate-900 border border-slate-700 text-slate-300 text-xs px-2 py-1 rounded font-mono focus:outline-none"
                          >
                            <option value="string">string (文本)</option>
                            <option value="number">number (数值)</option>
                            <option value="boolean">boolean (布尔)</option>
                            <option value="date">date (时间)</option>
                          </select>
                        </div>

                        {/* 索引与约束特性开关 */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* 主键 PK */}
                          <button
                            type="button"
                            onClick={() => {
                              setNewTableColumns(prev =>
                                prev.map((c, i) =>
                                  i === idx
                                    ? { ...c, isPrimaryKey: true, isSecondaryIndex: false }
                                    : { ...c, isPrimaryKey: false, autoIncrement: false }
                                )
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.isPrimaryKey
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            PK (主键)
                          </button>

                          {/* 自增 AUTOINCREMENT */}
                          <button
                            type="button"
                            onClick={() => {
                              if (!col.isPrimaryKey) {
                                // 设为主键且类型为 number
                                setNewTableColumns(prev =>
                                  prev.map((c, i) =>
                                    i === idx
                                      ? { ...c, isPrimaryKey: true, autoIncrement: true, type: 'number' }
                                      : { ...c, isPrimaryKey: false, autoIncrement: false }
                                  )
                                );
                              } else {
                                setNewTableColumns(prev =>
                                  prev.map((c, i) => (i === idx ? { ...c, autoIncrement: !c.autoIncrement } : c))
                                );
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.autoIncrement
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Auto
                          </button>

                          {/* Base62 短键 */}
                          <button
                            type="button"
                            onClick={() => {
                              setNewTableColumns(prev =>
                                prev.map((c, i) =>
                                  i === idx
                                    ? { ...c, isShortKey: !c.isShortKey, isUnique: !c.isShortKey ? true : c.isUnique }
                                    : c
                                )
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.isShortKey
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Base62
                          </button>

                          {/* 唯一哈希 Unique */}
                          <button
                            type="button"
                            onClick={() => {
                              setNewTableColumns(prev =>
                                prev.map((c, i) => (i === idx ? { ...c, isUnique: !c.isUnique } : c))
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.isUnique
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Unique
                          </button>

                          {/* 二级多值 B-树 Index */}
                          <button
                            type="button"
                            onClick={() => {
                              setNewTableColumns(prev =>
                                prev.map((c, i) => (i === idx ? { ...c, isSecondaryIndex: !c.isSecondaryIndex } : c))
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.isSecondaryIndex
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Index
                          </button>

                          {/* 删除列 */}
                          {newTableColumns.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewTableColumns(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer ml-1"
                              title="删除此字段"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-5 mt-5 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreateTableModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
              >
                {t.modalCancel}
              </button>
              <button
                type="button"
                disabled={creatingTable}
                onClick={async () => {
                  if (!newTableName.trim()) {
                    setCreateTableError('数据表名称不能为空。');
                    return;
                  }
                  if (tables.some(tbl => tbl.name === newTableName.trim())) {
                    setCreateTableError(`数据表 "${newTableName}" 已存在。`);
                    return;
                  }
                  if (newTableColumns.length === 0) {
                    setCreateTableError('数据表至少需要定义一个字段。');
                    return;
                  }
                  const pk = newTableColumns.find(c => c.isPrimaryKey);
                  const pkColumn = pk ? pk.name : newTableColumns[0].name;

                  setCreatingTable(true);
                  setCreateTableError(null);
                  try {
                    if (onCreateTable) {
                      await onCreateTable({
                        name: newTableName.trim(),
                        primaryKeyColumn: pkColumn,
                        columns: newTableColumns
                      });
                      setShowCreateTableModal(false);
                    }
                  } catch (err: any) {
                    setCreateTableError(err.message || '创建数据表失败');
                  } finally {
                    setCreatingTable(false);
                  }
                }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{creatingTable ? 'Creating...' : t.confirmCreateTable}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改指定表结构与索引弹窗 */}
      {showEditSchemaModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {lang === 'zh' ? `修改数据表结构与索引: "${tableName}"` : `Edit Table Schema: "${tableName}"`}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {lang === 'zh'
                      ? '可视化添加/删除字段、配置主键、唯一哈希索引与二级 B-树索引，保存时自动重整并持久化。'
                      : 'Add/drop columns and configure indexes dynamically.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEditSchemaModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm p-1 rounded hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {editSchemaError && (
              <div className="my-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{editSchemaError}</span>
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.columnsDefTitle}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditColumns(prev => [
                        ...prev,
                        { name: `col_${prev.length + 1}`, type: 'string', isPrimaryKey: false, autoIncrement: false, isShortKey: false, isUnique: false, isSecondaryIndex: false }
                      ]);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/40 rounded transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{t.addColumnBtn}</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {editColumns.map((col, idx) => {
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-950 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                          <span className="text-slate-500 font-mono text-[11px] w-4">{idx + 1}.</span>
                          <input
                            type="text"
                            value={col.name}
                            onChange={e => {
                              const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                              setEditColumns(prev => prev.map((c, i) => i === idx ? { ...c, name: val } : c));
                            }}
                            placeholder="column_name"
                            className="w-36 bg-slate-900 border border-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded font-mono focus:outline-none focus:border-indigo-500"
                          />
                          <select
                            value={col.type}
                            onChange={e => {
                              const newType = e.target.value as any;
                              setEditColumns(prev => prev.map((c, i) => i === idx ? { ...c, type: newType } : c));
                            }}
                            className="bg-slate-900 border border-slate-700 text-slate-300 text-xs px-2 py-1 rounded font-mono focus:outline-none"
                          >
                            <option value="string">string (文本)</option>
                            <option value="number">number (数值)</option>
                            <option value="boolean">boolean (布尔)</option>
                            <option value="date">date (时间)</option>
                          </select>
                        </div>

                        {/* 特性开关 */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditColumns(prev =>
                                prev.map((c, i) =>
                                  i === idx
                                    ? { ...c, isPrimaryKey: true, isSecondaryIndex: false }
                                    : { ...c, isPrimaryKey: false, autoIncrement: false }
                                )
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.isPrimaryKey
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            PK
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!col.isPrimaryKey) {
                                setEditColumns(prev =>
                                  prev.map((c, i) =>
                                    i === idx
                                      ? { ...c, isPrimaryKey: true, autoIncrement: true, type: 'number' }
                                      : { ...c, isPrimaryKey: false, autoIncrement: false }
                                  )
                                );
                              } else {
                                setEditColumns(prev =>
                                  prev.map((c, i) => (i === idx ? { ...c, autoIncrement: !c.autoIncrement } : c))
                                );
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.autoIncrement
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Auto
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditColumns(prev =>
                                prev.map((c, i) =>
                                  i === idx
                                    ? { ...c, isShortKey: !c.isShortKey, isUnique: !c.isShortKey ? true : c.isUnique }
                                    : c
                                )
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.isShortKey
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Base62
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditColumns(prev =>
                                prev.map((c, i) => (i === idx ? { ...c, isUnique: !c.isUnique } : c))
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.isUnique
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Unique
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditColumns(prev =>
                                prev.map((c, i) => (i === idx ? { ...c, isSecondaryIndex: !c.isSecondaryIndex } : c))
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                              col.isSecondaryIndex
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Index
                          </button>

                          {editColumns.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditColumns(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer ml-1"
                              title="删除字段"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-5 mt-5 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowEditSchemaModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
              >
                {t.modalCancel}
              </button>
              <button
                type="button"
                disabled={editingSchema}
                onClick={handleUpdateSchema}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-md transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{editingSchema ? 'Saving...' : lang === 'zh' ? '保存结构修改' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除当前数据表确认弹窗 */}
      {showDropConfirm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <span className="p-2 rounded-lg bg-rose-500/10 text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {lang === 'zh' ? `确认删除数据表 "${tableName}"？` : `Confirm Drop Table "${tableName}"?`}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {lang === 'zh'
                    ? `此操作将彻底删除数据表及其包含的 ${rows.length} 条数据，并销毁该表的主键 B-树及哈希索引。修改将触发原子刷盘与 CRC32 校验码轮转。`
                    : `This will permanently delete the table and its ${rows.length} rows, and destroy associated B-Trees. An atomic write with CRC32 will be persisted.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowDropConfirm(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
              >
                {t.modalCancel}
              </button>
              <button
                type="button"
                disabled={droppingTable}
                onClick={async () => {
                  if (onDropTable) {
                    setDroppingTable(true);
                    try {
                      await onDropTable(tableName);
                      setShowDropConfirm(false);
                    } catch (err: any) {
                      alert(err.message);
                    } finally {
                      setDroppingTable(false);
                    }
                  }
                }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-md transition-colors disabled:opacity-50 cursor-pointer shadow"
              >
                {droppingTable ? 'Dropping...' : lang === 'zh' ? '确认删除' : 'Drop Table'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
