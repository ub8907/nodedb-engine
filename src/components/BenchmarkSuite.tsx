import React, { useState } from 'react';
import { Play, Zap, BarChart3, Clock, Cpu, Award } from 'lucide-react';
import { Table, TableSchema } from '../engine/table';
import { Language, translations } from '../i18n/translations';

interface BenchmarkResult {
  name: string;
  strategy: string;
  complexity: string;
  ops: number;
  durationMs: number;
  opsPerSec: number;
  avgLatencyUs: number;
  speedup: number;
}

interface BenchmarkSuiteProps {
  lang: Language;
}

export const BenchmarkSuite: React.FC<BenchmarkSuiteProps> = ({ lang }) => {
  const t = translations[lang];
  const [iterations, setIterations] = useState<number>(5000);
  const [running, setRunning] = useState<boolean>(false);
  const [results, setResults] = useState<BenchmarkResult[] | null>(null);

  const runBenchmark = () => {
    setRunning(true);
    setResults(null);

    setTimeout(() => {
      const schema: TableSchema = {
        name: 'bench_table',
        primaryKeyColumn: 'id',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true, autoIncrement: true },
          { name: 'email', type: 'string', isUnique: true },
          { name: 'amount', type: 'number', isSecondaryIndex: true },
          { name: 'category', type: 'string' }
        ]
      };

      const table = new Table(schema, 1, 3);
      for (let i = 1; i <= 1000; i++) {
        table.insert({
          id: i,
          email: `user_${i}@benchmark.internal`,
          amount: (i * 7) % 500,
          category: `cat_${i % 5}`
        });
      }

      // Bench 1: Unique Hash Index Lookup O(1)
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        const targetEmail = `user_${(i % 1000) + 1}@benchmark.internal`;
        table.query([{ column: 'email', operator: '=', value: targetEmail }]);
      }
      const hashDuration = performance.now() - t0;

      // Bench 2: Primary Key B-Tree Lookup O(log N)
      const t1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        const targetId = (i % 1000) + 1;
        table.query([{ column: 'id', operator: '=', value: targetId }]);
      }
      const btreeDuration = performance.now() - t1;

      // Bench 3: Secondary Multi-value B-Tree Range Query O(log N + K)
      const t2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        const minA = (i * 3) % 200;
        table.query([{ column: 'amount', operator: 'BETWEEN', value: minA, value2: minA + 50 }]);
      }
      const secBtreeDuration = performance.now() - t2;

      // Bench 4: Full Table Scan O(N)
      const scanIterations = Math.min(iterations, 1000);
      const t3 = performance.now();
      for (let i = 0; i < scanIterations; i++) {
        table.query([{ column: 'category', operator: '=', value: 'cat_3' }]);
      }
      const scanDurationNormalized = (performance.now() - t3) * (iterations / scanIterations);
      const baselineLatency = scanDurationNormalized / iterations;

      const benchmarkResults: BenchmarkResult[] = [
        {
          name: lang === 'zh' ? '唯一列哈希索引点查' : 'Unique Column Hash Index',
          strategy: 'O(1) Map Hash Lookup',
          complexity: 'O(1)',
          ops: iterations,
          durationMs: Number(hashDuration.toFixed(2)),
          opsPerSec: Math.round((iterations / hashDuration) * 1000),
          avgLatencyUs: Number(((hashDuration / iterations) * 1000).toFixed(2)),
          speedup: Number((baselineLatency / (hashDuration / iterations)).toFixed(1))
        },
        {
          name: lang === 'zh' ? '主键自建平衡 B-树索引' : 'Primary Key B-Tree Index',
          strategy: 'O(log N) Self-Built B-Tree',
          complexity: 'O(log N)',
          ops: iterations,
          durationMs: Number(btreeDuration.toFixed(2)),
          opsPerSec: Math.round((iterations / btreeDuration) * 1000),
          avgLatencyUs: Number(((btreeDuration / iterations) * 1000).toFixed(2)),
          speedup: Number((baselineLatency / (btreeDuration / iterations)).toFixed(1))
        },
        {
          name: lang === 'zh' ? '二级列多值 B-树范围扫描' : 'Secondary Column Multi B-Tree',
          strategy: 'O(log N + K) Range Scan',
          complexity: 'O(log N + K)',
          ops: iterations,
          durationMs: Number(secBtreeDuration.toFixed(2)),
          opsPerSec: Math.round((iterations / secBtreeDuration) * 1000),
          avgLatencyUs: Number(((secBtreeDuration / iterations) * 1000).toFixed(2)),
          speedup: Number((baselineLatency / (secBtreeDuration / iterations)).toFixed(1))
        },
        {
          name: lang === 'zh' ? '全表顺序遍历扫描 (无索引回退)' : 'Full Table Sequential Scan',
          strategy: 'O(N) Unindexed Scan Fallback',
          complexity: 'O(N)',
          ops: iterations,
          durationMs: Number(scanDurationNormalized.toFixed(2)),
          opsPerSec: Math.round((iterations / scanDurationNormalized) * 1000),
          avgLatencyUs: Number(((scanDurationNormalized / iterations) * 1000).toFixed(2)),
          speedup: 1.0
        }
      ];

      setResults(benchmarkResults);
      setRunning(false);
    }, 50);
  };

  return (
    <div className="space-y-6">
      {/* Configuration & Trigger */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-white">{t.benchmarkTitle}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {t.benchmarkSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="benchmark-ops-select" className="text-xs text-slate-400 font-medium">
                {t.opsCount}:
              </label>
              <select
                id="benchmark-ops-select"
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 text-xs font-mono text-white rounded px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
              >
                <option value={1000}>1,000 queries</option>
                <option value={5000}>5,000 queries</option>
                <option value={10000}>10,000 queries</option>
              </select>
            </div>

            <button
              onClick={runBenchmark}
              disabled={running}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{running ? 'Executing...' : t.runBenchmarkBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Results Cards & Charts */}
      {results && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {results.map((res, idx) => {
              const isFastest = idx === 0;
              return (
                <div
                  key={res.name}
                  className={`p-4 rounded-lg border relative ${
                    isFastest
                      ? 'bg-slate-900 border-indigo-500/80 shadow-md ring-1 ring-indigo-500/30'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {isFastest && (
                    <div className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      <span>{t.fastestBadge}</span>
                    </div>
                  )}

                  <div className="text-xs font-semibold text-slate-200">{res.name}</div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">{res.complexity}</div>

                  <div className="mt-4 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{t.throughput}:</span>
                      <strong className="text-emerald-400 font-bold tabular-nums">
                        {res.opsPerSec.toLocaleString()} ops/s
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{t.latency}:</span>
                      <strong className="text-white font-bold tabular-nums">
                        {res.avgLatencyUs} µs
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{t.speedup}:</span>
                      <strong className="text-indigo-400 font-bold tabular-nums">
                        {res.speedup}x
                      </strong>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-[11px]">
                      <span className="text-slate-500">{t.totalTime}:</span>
                      <span className="text-slate-400">{res.durationMs} ms</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comparative Latency Visual Bars */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
              {t.latencyChartTitle}
            </h2>
            <div className="space-y-4">
              {results.map((res) => {
                const maxUs = Math.max(...results.map(r => r.avgLatencyUs));
                const pct = Math.max(2, (res.avgLatencyUs / maxUs) * 100);

                return (
                  <div key={res.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 font-medium">{res.name}</span>
                      <span className="text-indigo-300 tabular-nums">
                        {res.avgLatencyUs} µs / query ({res.opsPerSec.toLocaleString()} ops/s)
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          res.complexity === 'O(1)'
                            ? 'bg-sky-500'
                            : res.complexity === 'O(log N)'
                            ? 'bg-indigo-500'
                            : res.complexity.includes('range')
                            ? 'bg-emerald-500'
                            : 'bg-amber-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
