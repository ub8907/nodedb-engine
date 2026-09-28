import React, { useState } from 'react';
import { Play, Sparkles, Cpu, Clock, CheckCircle, Database, HelpCircle, Layers } from 'lucide-react';
import { TableSchema, QueryFilter, ExplainPlan } from '../engine/table';
import { Language, translations } from '../i18n/translations';

interface QueryRunnerProps {
  lang: Language;
  tableName: string;
  setTableName: (name: string) => void;
  tables: Array<{ name: string; schema: TableSchema }>;
  onExecuteQuery: (filters: QueryFilter[]) => Promise<{ rows: any[]; plan: ExplainPlan }>;
}

export const QueryRunner: React.FC<QueryRunnerProps> = ({
  lang,
  tableName,
  setTableName,
  tables,
  onExecuteQuery
}) => {
  const t = translations[lang];
  const currentTable = tables.find(tItem => tItem.name === tableName) || tables[0];
  const columns = currentTable?.schema.columns || [];

  const [selectedColumn, setSelectedColumn] = useState(columns[0]?.name || 'id');
  const [operator, setOperator] = useState<QueryFilter['operator']>('=');
  const [filterValue, setFilterValue] = useState<string>('1');
  const [filterValue2, setFilterValue2] = useState<string>('500');
  const [running, setRunning] = useState(false);
  const [resultRows, setResultRows] = useState<any[] | null>(null);
  const [explainPlan, setExplainPlan] = useState<ExplainPlan | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  React.useEffect(() => {
    if (columns.length > 0 && !columns.find(c => c.name === selectedColumn)) {
      setSelectedColumn(columns[0].name);
    }
  }, [tableName, columns]);

  const handleRun = async (filters: QueryFilter[]) => {
    setRunning(true);
    setQueryError(null);
    try {
      const res = await onExecuteQuery(filters);
      setResultRows(res.rows);
      setExplainPlan(res.plan);
    } catch (err: any) {
      setQueryError(err.message || 'Query execution error');
      setResultRows(null);
      setExplainPlan(null);
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const colDef = columns.find(c => c.name === selectedColumn);
    let val: any = filterValue;
    let val2: any = filterValue2;

    if (colDef?.type === 'number') {
      val = Number(val);
      if (operator === 'BETWEEN') val2 = Number(val2);
    }

    const filter: QueryFilter = {
      column: selectedColumn,
      operator,
      value: val,
      value2: operator === 'BETWEEN' ? val2 : undefined
    };

    handleRun([filter]);
  };

  const loadPreset = (preset: 'pk' | 'hash' | 'range' | 'full') => {
    if (preset === 'pk') {
      setTableName('orders');
      setSelectedColumn('id');
      setOperator('=');
      setFilterValue('3');
      handleRun([{ column: 'id', operator: '=', value: 3 }]);
    } else if (preset === 'hash') {
      setTableName('orders');
      setSelectedColumn('customer_email');
      setOperator('=');
      setFilterValue('alice@domain.io');
      handleRun([{ column: 'customer_email', operator: '=', value: 'alice@domain.io' }]);
    } else if (preset === 'range') {
      setTableName('orders');
      setSelectedColumn('amount');
      setOperator('BETWEEN');
      setFilterValue('100');
      setFilterValue2('600');
      handleRun([{ column: 'amount', operator: 'BETWEEN', value: 100, value2: 600 }]);
    } else if (preset === 'full') {
      setTableName('orders');
      setSelectedColumn('status');
      setOperator('=');
      setFilterValue('completed');
      handleRun([{ column: 'status', operator: '=', value: 'completed' }]);
    }
  };

  const getStrategyBadge = (strat: ExplainPlan['strategy']) => {
    switch (strat) {
      case 'PK_BTREE':
        return {
          label: lang === 'zh' ? '主键平衡 B-树索引 (O(log N))' : 'Primary Key B-Tree Index (O(log N))',
          color: 'text-indigo-400 bg-indigo-950/60 border-indigo-800'
        };
      case 'UNIQUE_HASH':
        return {
          label: lang === 'zh' ? '唯一列哈希索引 (O(1))' : 'Unique Column Hash Index (O(1))',
          color: 'text-sky-400 bg-sky-950/60 border-sky-800'
        };
      case 'SECONDARY_BTREE_RANGE':
        return {
          label: lang === 'zh' ? '二级列多值 B-树范围扫描 (O(log N + K))' : 'Secondary Multi-value B-Tree Range (O(log N + K))',
          color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800'
        };
      case 'SECONDARY_BTREE_EXACT':
        return {
          label: lang === 'zh' ? '二级列多值 B-树等值查找 (O(log N + K))' : 'Secondary Multi-value B-Tree (O(log N + K))',
          color: 'text-teal-400 bg-teal-950/60 border-teal-800'
        };
      default:
        return {
          label: lang === 'zh' ? '全表扫描回退 (O(N))' : 'Full Table Scan (O(N))',
          color: 'text-amber-400 bg-amber-950/60 border-amber-800'
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Preset Query Shortcuts */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            {t.presetTitle}
          </span>
          <span className="text-xs text-slate-500">{t.presetSubtitle}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <button
            onClick={() => loadPreset('pk')}
            className="p-2.5 rounded border border-slate-800 bg-slate-950 hover:border-indigo-600/60 text-left transition-colors group"
          >
            <div className="text-xs font-semibold text-indigo-400 group-hover:text-indigo-300">
              {t.presetPk}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">id = 3</div>
            <div className="text-[10px] text-slate-500 mt-1">O(log N) tree descent</div>
          </button>

          <button
            onClick={() => loadPreset('hash')}
            className="p-2.5 rounded border border-slate-800 bg-slate-950 hover:border-sky-600/60 text-left transition-colors group"
          >
            <div className="text-xs font-semibold text-sky-400 group-hover:text-sky-300">
              {t.presetHash}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">customer_email = ...</div>
            <div className="text-[10px] text-slate-500 mt-1">O(1) point hash lookup</div>
          </button>

          <button
            onClick={() => loadPreset('range')}
            className="p-2.5 rounded border border-slate-800 bg-slate-950 hover:border-emerald-600/60 text-left transition-colors group"
          >
            <div className="text-xs font-semibold text-emerald-400 group-hover:text-emerald-300">
              {t.presetRange}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">amount BETWEEN 100 AND 600</div>
            <div className="text-[10px] text-slate-500 mt-1">Multi-value B-Tree traversal</div>
          </button>

          <button
            onClick={() => loadPreset('full')}
            className="p-2.5 rounded border border-slate-800 bg-slate-950 hover:border-amber-600/60 text-left transition-colors group"
          >
            <div className="text-xs font-semibold text-amber-400 group-hover:text-amber-300">
              {t.presetFull}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">status = 'completed'</div>
            <div className="text-[10px] text-slate-500 mt-1">O(N) sequential scan fallback</div>
          </button>
        </div>
      </div>

      {/* Query Builder Form */}
      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="query-table-select" className="text-xs font-medium text-slate-400">
              {t.activeTable}:
            </label>
            <select
              id="query-table-select"
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
            <label htmlFor="query-column-select" className="text-xs font-medium text-slate-400">
              {t.whereCol}:
            </label>
            <select
              id="query-column-select"
              value={selectedColumn}
              onChange={(e) => setSelectedColumn(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
            >
              {columns.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} {c.isPrimaryKey ? '(PK B-Tree)' : c.isSecondaryIndex ? '(2nd B-Tree)' : c.isUnique ? '(Hash)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="query-operator-select" className="text-xs font-medium text-slate-400">
              {t.operator}:
            </label>
            <select
              id="query-operator-select"
              value={operator}
              onChange={(e) => setOperator(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="=">=</option>
              <option value="!=">!=</option>
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
              <option value="BETWEEN">BETWEEN</option>
              <option value="LIKE">LIKE (Contains)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <label htmlFor="query-val-input" className="text-xs font-medium text-slate-400">
              {t.filterVal}:
            </label>
            <input
              id="query-val-input"
              type="text"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              placeholder="Value"
              className="flex-1 bg-slate-950 border border-slate-700 text-xs text-slate-100 rounded px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 font-mono"
            />
            {operator === 'BETWEEN' && (
              <>
                <span className="text-xs text-slate-400 font-medium">{t.andVal}</span>
                <input
                  type="text"
                  value={filterValue2}
                  onChange={(e) => setFilterValue2(e.target.value)}
                  placeholder="Max Value"
                  className="w-28 bg-slate-950 border border-slate-700 text-xs text-slate-100 rounded px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={running}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-sm"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{running ? 'Executing...' : t.runQueryBtn}</span>
          </button>
        </div>

        {/* SQL Preview */}
        <div className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-2 rounded border border-slate-800">
          <span className="text-indigo-400 font-bold">SELECT</span> * <span className="text-indigo-400 font-bold">FROM</span> {tableName}{' '}
          <span className="text-indigo-400 font-bold">WHERE</span> {selectedColumn} {operator}{' '}
          {operator === 'BETWEEN' ? `${filterValue} AND ${filterValue2}` : `'${filterValue}'`};
        </div>
      </form>

      {queryError && (
        <div className="p-3 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-mono">
          {queryError}
        </div>
      )}

      {/* EXPLAIN Execution Plan Display */}
      {explainPlan && (
        <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900 shadow-sm">
          <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                {t.explainTitle}
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-slate-400">{t.execTime}:</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                {explainPlan.executionTimeMs} ms
              </span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const badge = getStrategyBadge(explainPlan.strategy);
                return (
                  <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded border ${badge.color}`}>
                    {t.strategyLabel}: {badge.label}
                  </span>
                );
              })()}

              {explainPlan.indexName && (
                <span className="text-xs font-mono px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300">
                  {t.targetIndex}: {explainPlan.indexName}
                </span>
              )}

              <span className="text-xs font-mono px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300">
                {t.complexityLabel}: {explainPlan.estimatedCost}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded border border-slate-800/60 text-xs">
              <div>
                <span className="text-slate-500 block">{t.rowsExamined}</span>
                <span className="font-mono text-white font-bold text-sm tabular-nums">
                  {explainPlan.rowsExamined}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">{t.rowsMatched}</span>
                <span className="font-mono text-emerald-400 font-bold text-sm tabular-nums">
                  {explainPlan.rowsMatched}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">{t.nodeComparisons}</span>
                <span className="font-mono text-sky-400 font-bold text-sm tabular-nums">
                  {explainPlan.nodeComparisons}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">{t.filterRatio}</span>
                <span className="font-mono text-slate-300 font-bold text-sm tabular-nums">
                  {explainPlan.rowsExamined > 0
                    ? `${((explainPlan.rowsMatched / explainPlan.rowsExamined) * 100).toFixed(1)}%`
                    : '100%'}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-300 bg-slate-950 p-3 rounded border border-slate-800 font-mono leading-relaxed">
              <strong className="text-indigo-300">{t.optimizerTelemetry}: </strong>
              {explainPlan.explanation}
            </div>
          </div>
        </div>
      )}

      {/* Query Result Rows */}
      {resultRows && (
        <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40">
          <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {t.queryResultTitle} ({resultRows.length} rows)
            </h2>
          </div>

          {resultRows.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              {t.noRowsMatched}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left font-mono">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    {columns.map(col => (
                      <th key={col.name} className="px-4 py-2 font-medium">
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {resultRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      {columns.map(col => (
                        <td key={col.name} className="px-4 py-2 text-slate-300 whitespace-nowrap">
                          {row[col.name] !== undefined ? String(row[col.name]) : 'NULL'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
