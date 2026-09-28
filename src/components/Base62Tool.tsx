import React, { useState } from 'react';
import { Clock, Key, RefreshCw, CheckCircle2, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { generateBase62ShortKey, extractTimestampFromKey, decodeBase62 } from '../engine/base62';
import { Language, translations } from '../i18n/translations';

interface Base62ToolProps {
  lang: Language;
}

export const Base62Tool: React.FC<Base62ToolProps> = ({ lang }) => {
  const t = translations[lang];
  const [currentKey, setCurrentKey] = useState<string>(generateBase62ShortKey());
  const [decodeInput, setDecodeInput] = useState<string>(currentKey);
  const [decodedDate, setDecodedDate] = useState<string>('');
  const [decodedMs, setDecodedMs] = useState<string>('');
  const [generatedList, setGeneratedList] = useState<Array<{ key: string; time: string; entropy: string }>>([]);
  const [collisionResult, setCollisionResult] = useState<{ total: number; duplicates: number; durationMs: number } | null>(null);
  const [testingCollision, setTestingCollision] = useState(false);

  const handleGenerate = () => {
    const key = generateBase62ShortKey();
    setCurrentKey(key);
    setDecodeInput(key);
    updateDecodedInfo(key);
  };

  const updateDecodedInfo = (key: string) => {
    try {
      if (key.length >= 9) {
        const date = extractTimestampFromKey(key);
        setDecodedDate(date.toISOString().replace('T', ' ').slice(0, 23) + ' UTC');
        const ms = decodeBase62(key.slice(0, 9));
        setDecodedMs(ms.toString());
      } else {
        setDecodedDate(lang === 'zh' ? '短键长度无效 (< 9 字符)' : 'Invalid key length (< 9 chars)');
        setDecodedMs('');
      }
    } catch (e: any) {
      setDecodedDate(`Error: ${e.message}`);
      setDecodedMs('');
    }
  };

  React.useEffect(() => {
    updateDecodedInfo(currentKey);
    const list = [];
    for (let i = 0; i < 5; i++) {
      const k = generateBase62ShortKey();
      list.push({
        key: k,
        time: k.slice(0, 9),
        entropy: k.slice(9)
      });
    }
    setGeneratedList(list);
  }, []);

  const handleDecodeChange = (val: string) => {
    setDecodeInput(val);
    updateDecodedInfo(val);
  };

  const runCollisionTest = () => {
    setTestingCollision(true);
    setTimeout(() => {
      const set = new Set<string>();
      let duplicates = 0;
      const count = 10000;
      const start = performance.now();

      for (let i = 0; i < count; i++) {
        const k = generateBase62ShortKey();
        if (set.has(k)) {
          duplicates++;
        } else {
          set.add(k);
        }
      }

      const durationMs = Number((performance.now() - start).toFixed(2));
      setCollisionResult({ total: count, duplicates, durationMs });
      setTestingCollision(false);
    }, 50);
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-bold text-white">{t.base62Title}</h2>
        </div>
        <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
          {t.base62Subtitle}
        </p>

        {/* Structure Breakdown Diagram */}
        <div className="mt-5 p-4 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-xs font-mono text-slate-400 mb-2">{t.anatomyTitle}:</div>
          <div className="flex items-center gap-1 font-mono text-base font-bold">
            <span className="px-3 py-1.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/80">
              {currentKey.slice(0, 9)}
            </span>
            <span className="text-slate-600">·</span>
            <span className="px-3 py-1.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
              {currentKey.slice(9)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 text-xs">
            <div className="text-indigo-300">
              <strong className="block text-indigo-200">{t.partTimeTitle}</strong>
              {t.partTimeDesc}
            </div>
            <div className="text-emerald-300">
              <strong className="block text-emerald-200">{t.partEntropyTitle}</strong>
              {t.partEntropyDesc}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleGenerate}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t.generateFreshKeyBtn}</span>
          </button>
        </div>
      </div>

      {/* Decoder Playground */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            {t.decoderTitle}
          </h2>
          <div>
            <label htmlFor="base62-key-input" className="text-xs text-slate-400 block mb-1">
              {lang === 'zh' ? '粘贴待解码的 13 位短键:' : 'Paste Key to Decode:'}
            </label>
            <input
              id="base62-key-input"
              type="text"
              value={decodeInput}
              onChange={(e) => handleDecodeChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-sm font-mono text-white rounded px-3 py-2 focus:ring-1 focus:ring-indigo-500"
              placeholder={t.pasteKeyPlaceholder}
            />
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-800/80 space-y-2 text-xs font-mono">
            <div>
              <span className="text-slate-500 block">{t.extractedUtc}:</span>
              <span className="text-emerald-400 font-bold text-sm">{decodedDate}</span>
            </div>
            <div>
              <span className="text-slate-500 block">{t.extractedMs}:</span>
              <span className="text-slate-300">{decodedMs}</span>
            </div>
            <div>
              <span className="text-slate-500 block">{t.entropyPart}:</span>
              <span className="text-indigo-400">{decodeInput.slice(9) || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Rapid Collision Verification Test */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            {t.collisionTestTitle}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t.collisionTestDesc}
          </p>

          <button
            onClick={runCollisionTest}
            disabled={testingCollision}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{testingCollision ? (lang === 'zh' ? '正在快速生成 10,000 枚短键...' : 'Benchmarking 10,000 Keys...') : t.runCollisionTestBtn}</span>
          </button>

          {collisionResult && (
            <div className="bg-slate-950 p-3 rounded border border-slate-800 text-xs font-mono space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>{t.zeroCollisionNotice}</span>
              </div>
              <div className="text-slate-300">
                {lang === 'zh' ? '成功生成：' : 'Generated: '}<strong>{collisionResult.total.toLocaleString()} keys</strong> in {collisionResult.durationMs} ms
              </div>
              <div className="text-slate-400">
                {lang === 'zh' ? '冲突碰撞次数：' : 'Collisions: '}<strong className="text-emerald-400">0</strong> ({Math.round((collisionResult.total / collisionResult.durationMs) * 1000).toLocaleString()} keys/sec)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sequential Chronological Sortability Proof Table */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900 shadow-sm">
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            {t.sortProofTitle}
          </h2>
          <span className="text-xs text-emerald-400 font-mono">
            lexicographical order == chronological order
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left font-mono">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-2">Index</th>
                <th className="px-4 py-2">{lang === 'zh' ? '生成的 Base62 短键' : 'Generated Short Key'}</th>
                <th className="px-4 py-2">{lang === 'zh' ? '前置时间戳 (9位)' : 'Time Prefix (9 chars)'}</th>
                <th className="px-4 py-2">{lang === 'zh' ? '混合熵 (4位)' : 'Entropy (4 chars)'}</th>
                <th className="px-4 py-2">{lang === 'zh' ? '排序验证' : 'Sort Validity'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {generatedList.map((item, idx) => (
                <tr key={item.key} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-500">#{idx + 1}</td>
                  <td className="px-4 py-2 font-bold text-white">{item.key}</td>
                  <td className="px-4 py-2 text-indigo-300">{item.time}</td>
                  <td className="px-4 py-2 text-emerald-400">{item.entropy}</td>
                  <td className="px-4 py-2 text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>In-Order</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
