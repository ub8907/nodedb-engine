import React, { useState } from 'react';
import { GitBranch, Search, Plus, Trash2, Info, Layers } from 'lucide-react';
import { BTreeVisualNode } from '../engine/btree';
import { TableSchema } from '../engine/table';
import { Language, translations } from '../i18n/translations';

interface BTreeVisualizerProps {
  lang: Language;
  tableName: string;
  setTableName: (name: string) => void;
  tables: Array<{ name: string; schema: TableSchema }>;
  tableData: any;
  onInsertRow: (row: any) => Promise<void>;
  onDeleteRow: (pk: any) => Promise<void>;
}

export const BTreeVisualizer: React.FC<BTreeVisualizerProps> = ({
  lang,
  tableName,
  setTableName,
  tables,
  tableData,
  onInsertRow,
  onDeleteRow
}) => {
  const t = translations[lang];
  const [selectedTreeType, setSelectedTreeType] = useState<string>('primary');
  const [highlightKey, setHighlightKey] = useState<string>('');
  const [newKeyInput, setNewKeyInput] = useState<string>('');
  const [deleteKeyInput, setDeleteKeyInput] = useState<string>('');

  const currentTable = tables.find(tItem => tItem.name === tableName);
  const schema = currentTable?.schema || tableData?.schema;
  const secondaryCols = schema?.columns.filter((c: any) => c.isSecondaryIndex && !c.isPrimaryKey) || [];

  let visualTree: BTreeVisualNode | null = null;
  if (selectedTreeType === 'primary') {
    visualTree = tableData?.pkVisualTree || null;
  } else if (tableData?.secondaryIndices && tableData.secondaryIndices[selectedTreeType]) {
    visualTree = tableData.secondaryIndices[selectedTreeType].tree;
  }

  const countStats = (node: BTreeVisualNode | null): { nodes: number; maxDepth: number } => {
    if (!node) return { nodes: 0, maxDepth: 0 };
    let nodes = 1;
    let maxDepth = node.depth;
    for (const child of node.children) {
      const sub = countStats(child);
      nodes += sub.nodes;
      if (sub.maxDepth > maxDepth) maxDepth = sub.maxDepth;
    }
    return { nodes, maxDepth };
  };

  const { nodes: totalNodes, maxDepth: treeHeight } = countStats(visualTree);

  const handleQuickInsert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyInput.trim()) return;
    const val = Number(newKeyInput) || newKeyInput;
    const pkCol = schema?.primaryKeyColumn || 'id';
    await onInsertRow({
      [pkCol]: val,
      amount: typeof val === 'number' ? val * 10 : 250,
      customer_email: `user_${val}_${Date.now().toString().slice(-4)}@demo.com`
    });
    setNewKeyInput('');
  };

  const handleQuickDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteKeyInput.trim()) return;
    const val = Number(deleteKeyInput) || deleteKeyInput;
    await onDeleteRow(val);
    setDeleteKeyInput('');
  };

  const renderNode = (node: BTreeVisualNode) => {
    const isRoot = node.depth === 0;
    const hasHighlight = highlightKey !== '' && node.keys.some(k => String(k.key) === highlightKey);

    return (
      <div key={node.id} className="flex flex-col items-center mx-2 my-3">
        <div
          className={`px-3 py-2 rounded-md border text-center transition-all ${
            hasHighlight
              ? 'bg-amber-950/80 border-amber-400 ring-2 ring-amber-400/50 scale-105 shadow-lg'
              : node.isLeaf
              ? 'bg-slate-900 border-slate-700 hover:border-slate-500'
              : 'bg-indigo-950/60 border-indigo-700/80 hover:border-indigo-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 font-mono mb-1 border-b border-slate-800 pb-0.5">
            <span>{isRoot ? t.rootNode : node.isLeaf ? t.leafNode : t.internalNode}</span>
            <span className="text-slate-500">depth {node.depth}</span>
          </div>

          <div className="flex items-center gap-1.5 font-mono">
            {node.keys.map((item, idx) => {
              const isTarget = highlightKey !== '' && String(item.key) === highlightKey;
              return (
                <div
                  key={idx}
                  className={`px-2 py-1 rounded text-xs font-semibold tabular-nums ${
                    isTarget
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : 'bg-slate-950 text-indigo-300 border border-slate-800'
                  }`}
                  title={item.value ? `Value: ${JSON.stringify(item.value)}` : undefined}
                >
                  {String(item.key)}
                </div>
              );
            })}
          </div>
        </div>

        {!node.isLeaf && node.children.length > 0 && (
          <div className="flex flex-col items-center mt-2">
            <div className="w-0.5 h-3 bg-slate-700"></div>
            <div className="flex items-start justify-center relative pt-2 border-t border-slate-700">
              {node.children.map((childNode) => renderNode(childNode))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Visualizer Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="btree-table-select" className="text-xs font-medium text-slate-400">
              {t.activeTable}:
            </label>
            <select
              id="btree-table-select"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs font-semibold text-slate-200 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              {tables.map(tItem => (
                <option key={tItem.name} value={tItem.name}>{tItem.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="btree-index-select" className="text-xs font-medium text-slate-400">
              {t.indexTarget}:
            </label>
            <select
              id="btree-index-select"
              value={selectedTreeType}
              onChange={(e) => setSelectedTreeType(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs font-semibold text-slate-200 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              <option value="primary">PK B-Tree ({schema?.primaryKeyColumn})</option>
              {secondaryCols.map((c: any) => (
                <option key={c.name} value={c.name}>
                  Secondary B-Tree ({c.name})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="btree-highlight-input" className="text-xs font-medium text-slate-400">
              {t.highlightKey}:
            </label>
            <input
              id="btree-highlight-input"
              type="text"
              placeholder="e.g. 3"
              value={highlightKey}
              onChange={(e) => setHighlightKey(e.target.value)}
              className="w-20 bg-slate-950 border border-slate-700 text-xs text-white rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>
        </div>

        {/* Tree Telemetry Stats */}
        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <div>{t.treeDegree}: <strong className="text-white">t = 3</strong></div>
          <div>{t.treeHeight}: <strong className="text-emerald-400">{treeHeight + 1}</strong></div>
          <div>{t.totalNodes}: <strong className="text-indigo-400">{totalNodes}</strong></div>
        </div>
      </div>

      {/* Live Mutation Tester */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-lg p-3">
        <form onSubmit={handleQuickInsert} className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">{t.testSplitTitle}:</span>
          <input
            type="number"
            placeholder="New Key"
            value={newKeyInput}
            onChange={(e) => setNewKeyInput(e.target.value)}
            className="w-24 bg-slate-950 border border-slate-700 text-xs text-white rounded px-2 py-1 font-mono"
          />
          <button
            type="submit"
            className="px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium flex items-center gap-1 shadow-sm"
          >
            <Plus className="w-3 h-3" />
            <span>Insert</span>
          </button>
        </form>

        <form onSubmit={handleQuickDelete} className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">{t.testMergeTitle}:</span>
          <input
            type="number"
            placeholder="Key to Delete"
            value={deleteKeyInput}
            onChange={(e) => setDeleteKeyInput(e.target.value)}
            className="w-28 bg-slate-950 border border-slate-700 text-xs text-white rounded px-2 py-1 font-mono"
          />
          <button
            type="submit"
            className="px-2.5 py-1 text-xs bg-rose-600 hover:bg-rose-500 text-white rounded font-medium flex items-center gap-1 shadow-sm"
          >
            <Trash2 className="w-3 h-3" />
            <span>Delete</span>
          </button>
        </form>

        <div className="text-xs text-slate-400 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-indigo-400" />
          <span>{t.splitNotice}</span>
        </div>
      </div>

      {/* Interactive Tree View Canvas */}
      <div className="border border-slate-800 rounded-lg bg-slate-950 overflow-x-auto min-h-[420px] p-6 flex flex-col items-center justify-start shadow-inner">
        <div className="text-xs text-slate-500 font-mono mb-4">
          Hierarchical B-Tree Structure (Node Order t=3: min 2 keys, max 5 keys per node)
        </div>

        {visualTree ? (
          <div className="w-full flex justify-center overflow-x-auto py-4">
            {renderNode(visualTree)}
          </div>
        ) : (
          <div className="text-slate-500 text-xs my-auto">
            Tree is currently empty or indexing in progress.
          </div>
        )}
      </div>
    </div>
  );
};
