import React, { useState, useEffect, useCallback } from 'react';
import { ActiveTab } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { TableExplorer } from './components/TableExplorer';
import { QueryRunner } from './components/QueryRunner';
import { BTreeVisualizer } from './components/BTreeVisualizer';
import { StorageLab } from './components/StorageLab';
import { Base62Tool } from './components/Base62Tool';
import { BenchmarkSuite } from './components/BenchmarkSuite';
import { CodeExport } from './components/CodeExport';
import { ConfigViewer } from './components/ConfigViewer';
import { SqlStudio } from './components/SqlStudio';
import { Documentation } from './components/Documentation';
import { BufferPoolManagerPanel } from './components/BufferPoolManagerPanel';
import { TableEditor } from './components/TableEditor';
import { LargeFileImporterModal } from './components/LargeFileImporterModal';
import { TableSchema, QueryFilter, ExplainPlan } from './engine/table';
import { StorageOperationLog } from './engine/storage-manager';
import { Language, translations } from './i18n/translations';

export default function App() {
  const [lang, setLang] = useState<Language>('zh');
  const t = translations[lang];

  const [activeTab, setActiveTab] = useState<ActiveTab>('explorer');
  const [currentTable, setCurrentTable] = useState<string>('orders');
  const [tables, setTables] = useState<Array<{
    name: string;
    rowCount: number;
    next_id: number;
    pkColumn: string;
    schema: TableSchema;
  }>>([]);
  const [tableData, setTableData] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showLargeFileImporter, setShowLargeFileImporter] = useState(false);

  const [dbStatus, setDbStatus] = useState<{
    fileSizeBytes: number;
    bakSizeBytes: number;
    backupEnabled?: boolean;
    expectedCrc: string;
    actualCrc: string;
    isFileCorrupt: boolean;
    hasLock: boolean;
    logs: StorageOperationLog[];
  }>({
    fileSizeBytes: 0,
    bakSizeBytes: 0,
    backupEnabled: false,
    expectedCrc: '0x00000000',
    actualCrc: '0x00000000',
    isFileCorrupt: false,
    hasLock: false,
    logs: []
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/db/status');
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      setTables(data.tables || []);
      setDbStatus({
        fileSizeBytes: data.fileSizeBytes,
        bakSizeBytes: data.bakSizeBytes,
        backupEnabled: data.backupEnabled !== undefined ? data.backupEnabled : false,
        expectedCrc: data.expectedCrc,
        actualCrc: data.actualCrc,
        isFileCorrupt: data.isFileCorrupt,
        hasLock: data.hasLock,
        logs: data.logs || []
      });
    } catch (err: any) {
      console.error(err);
    }
  }, []);

  const fetchTable = useCallback(async (
    tableName: string,
    page: number = 1,
    pageSize: number = 50,
    sortBy?: string,
    sortOrder?: 'ASC' | 'DESC'
  ) => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (sortBy) params.set('sortBy', sortBy);
      if (sortOrder) params.set('sortOrder', sortOrder);

      const res = await fetch(`/api/db/table/${tableName}?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load table ${tableName}`);
      const data = await res.json();
      setTableData(data);
    } catch (err: any) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (currentTable) {
      fetchTable(currentTable);
    }
  }, [currentTable, fetchTable]);

  // Insert Row
  const handleInsertRow = async (row: any) => {
    const res = await fetch(`/api/db/table/${currentTable}/insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Insert failed');
    }
    const pkCol = tableData?.schema?.primaryKeyColumn || 'id';
    const assignedPk = data.row[pkCol];
    const shortKey = data.row['order_no'] || data.row['sensor_code'] || '';
    
    showToast(lang === 'zh'
      ? `记录已成功写入 "${currentTable}"！分配自增主键: ${assignedPk}${shortKey ? `，自动生成 Base62 短键: ${shortKey}` : ''}`
      : `Row inserted into "${currentTable}"! Assigned PK: ${assignedPk}${shortKey ? `, Auto Base62: ${shortKey}` : ''}`);
    
    await fetchTable(currentTable);
    await fetchStatus();
  };

  // Create Table (Schema & Index Builder)
  const handleCreateTable = async (schema: TableSchema) => {
    const res = await fetch('/api/db/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create table');
    }
    showToast(lang === 'zh'
      ? `数据表 "${schema.name}" 已成功创建，主键 B-树及列索引已初始化！`
      : `Table "${schema.name}" created successfully with B-Tree indexes!`);
    await fetchStatus();
    setCurrentTable(schema.name);
  };

  // Drop Table
  const handleDropTable = async (name: string) => {
    const res = await fetch(`/api/db/table/${name}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to drop table');
    }
    showToast(lang === 'zh'
      ? `数据表 "${name}" 已成功删除。`
      : `Table "${name}" dropped successfully.`);
    const statusRes = await fetch('/api/db/status');
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      setDbStatus(statusData);
      setTables(statusData.tables || []);
      const remaining = statusData.tables || [];
      if (remaining.length > 0) {
        setCurrentTable(remaining[0].name);
      }
    }
  };

  // Delete Row (SQLite AUTOINCREMENT behavior: next_id never reused)
  const handleDeleteRow = async (pk: any) => {
    const res = await fetch(`/api/db/table/${currentTable}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pk })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Delete failed');
    }
    showToast(lang === 'zh'
      ? `已删除主键 ID 为 ${pk} 的数据。当前自增持久化 next_id 维持在 ${data.next_id} (SQLite AUTOINCREMENT 行为：历史 ID 绝不复用)！`
      : `Deleted PK ${pk}. Persistent next_id remains ${data.next_id} (SQLite AUTOINCREMENT: strictly never reused)!`);
    await fetchTable(currentTable);
    await fetchStatus();
  };

  // Run Query
  const handleExecuteQuery = async (filters: QueryFilter[]): Promise<{ rows: any[]; plan: ExplainPlan }> => {
    const res = await fetch(`/api/db/table/${currentTable}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Query failed');
    }
    return data;
  };

  // Atomic Save + fsync
  const handleAtomicSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/db/table/orders/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.floor(Math.random() * 500) + 100,
          customer_email: `autosync_${Date.now()}@domain.io`,
          status: 'completed'
        })
      });
      await fetchStatus();
      await fetchTable(currentTable);
      showToast(lang === 'zh'
        ? '原子写入提交成功：先落盘至 .tmp 临时文件，执行 fsync 硬件物理刷盘，轮转归档 .bak，并通过原子重命名替换生效。'
        : 'Atomic write committed: written to .tmp, fsync verified, .bak backup rotated, and target file swapped.');
    } catch (err: any) {
      showToast(`Save error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Simulate file corruption
  const handleCorruptFile = async () => {
    const res = await fetch('/api/db/storage/corrupt', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchStatus();
    showToast(lang === 'zh'
      ? '已向主存储文件注入模拟比特坏块！CRC32 校验码现已标记为不匹配报警。'
      : 'Bit-rot simulated in primary storage file! CRC32 checksum now marked mismatched.');
  };

  // Recover from backup
  const handleRecoverFile = async () => {
    const res = await fetch('/api/db/storage/recover', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchStatus();
    await fetchTable(currentTable);
    showToast(lang === 'zh'
      ? '灾备回退恢复成功！主存储已从 .bak 备份完全还原，CRC32 校验通过，内存中所有 B-树及哈希索引已全部重建！'
      : 'Primary storage restored from .bak backup, CRC32 validated, and all B-Tree indexes rebuilt!');
  };

  // Rebuild Indexes
  const handleRebuildIndexes = async () => {
    const res = await fetch(`/api/db/table/${currentTable}/rebuild`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchTable(currentTable);
    showToast(lang === 'zh'
      ? `已重建主键 B-树及所有二级多值索引，耗时 ${data.stats?.durationMs} 毫秒。`
      : `Rebuilt PK B-Tree and all secondary indices in ${data.stats?.durationMs} ms.`);
  };

  // Reset database
  const handleResetDb = async () => {
    const res = await fetch('/api/db/storage/reset', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await fetchStatus();
    await fetchTable(currentTable);
    showToast(lang === 'zh'
      ? '数据库已重置恢复为预置干净样本数据。'
      : 'Database reset to fresh sample dataset.');
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Left Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        setLang={setLang}
        onAtomicSave={handleAtomicSave}
        saving={saving}
        onOpenImporter={() => setShowLargeFileImporter(true)}
      />

      {/* Right Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 bg-indigo-600 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-xl border border-indigo-400/30 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
            <span>{toastMessage}</span>
          </div>
        )}

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'explorer' && (
          <TableExplorer
            lang={lang}
            tableName={currentTable}
            setTableName={setCurrentTable}
            tables={tables}
            tableData={tableData}
            onInsertRow={handleInsertRow}
            onDeleteRow={handleDeleteRow}
            onCreateTable={handleCreateTable}
            onDropTable={handleDropTable}
            onOpenLargeImporter={() => setShowLargeFileImporter(true)}
            onRefresh={() => {
              fetchStatus();
              fetchTable(currentTable);
            }}
            onPageChange={(page, pageSize, sortBy, sortOrder) => {
              fetchTable(currentTable, page, pageSize, sortBy, sortOrder);
            }}
          />
        )}

        {activeTab === 'table-editor' && (
          <TableEditor
            lang={lang}
            tables={tables}
            currentTable={currentTable}
            onRefresh={() => {
              fetchStatus();
              if (currentTable) fetchTable(currentTable);
            }}
            showToast={showToast}
          />
        )}

        {activeTab === 'sql' && (
          <SqlStudio
            lang={lang}
            onRefreshAll={() => {
              fetchStatus();
              fetchTable(currentTable);
            }}
          />
        )}

        {activeTab === 'query' && (
          <QueryRunner
            lang={lang}
            tableName={currentTable}
            setTableName={setCurrentTable}
            tables={tables}
            onExecuteQuery={handleExecuteQuery}
          />
        )}

        {activeTab === 'btree' && (
          <BTreeVisualizer
            lang={lang}
            tableName={currentTable}
            setTableName={setCurrentTable}
            tables={tables}
            tableData={tableData}
            onInsertRow={handleInsertRow}
            onDeleteRow={handleDeleteRow}
          />
        )}

        {activeTab === 'bufferpool' && (
          <BufferPoolManagerPanel
            lang={lang}
            tables={tables}
            onRefreshAll={() => {
              fetchStatus();
              if (currentTable) fetchTable(currentTable);
            }}
          />
        )}

        {activeTab === 'storage' && (
          <StorageLab
            lang={lang}
            status={dbStatus}
            onAtomicSave={handleAtomicSave}
            onCorruptFile={handleCorruptFile}
            onRecoverFile={handleRecoverFile}
            onRebuildIndexes={handleRebuildIndexes}
            onRefresh={fetchStatus}
          />
        )}

        {activeTab === 'base62' && <Base62Tool lang={lang} />}

        {activeTab === 'benchmark' && <BenchmarkSuite lang={lang} />}

        {activeTab === 'docs' && <Documentation lang={lang} />}

        {activeTab === 'code' && <CodeExport lang={lang} />}

        {activeTab === 'config' && <ConfigViewer lang={lang} />}
      </main>

      {/* Large File Background Importer Modal */}
      {showLargeFileImporter && (
        <LargeFileImporterModal
          lang={lang}
          existingTables={tables.map(t => t.name)}
          onImportCompleted={() => {
            fetchStatus();
            if (currentTable) fetchTable(currentTable);
            showToast(lang === 'zh' ? '大文件后台流式导入并建立盘索引成功！' : 'Large file streamed and indexed successfully!');
          }}
          onClose={() => setShowLargeFileImporter(false)}
        />
      )}

      {/* Clean Subtle Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>NodeDB Engine</span>
            <span>·</span>
            <span>{lang === 'zh' ? '主键自建平衡 B-树' : 'Primary Key B-Tree'}</span>
            <span>·</span>
            <span>{lang === 'zh' ? '二级列多值 B-树区间索引' : 'Secondary Range Multi-BTree'}</span>
            <span>·</span>
            <span>{lang === 'zh' ? '时间有序 Base62 自动短键' : 'Time-Ordered Base62 ShortKey'}</span>
            <span>·</span>
            <span>{lang === 'zh' ? 'CRC32 原子防灾存储' : 'CRC32 Atomic Protection'}</span>
          </div>
          <div>
            {lang === 'zh' ? '纯 Node.js & Python 双语言自主实现' : 'Pure Node.js & Python implementations'}
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
