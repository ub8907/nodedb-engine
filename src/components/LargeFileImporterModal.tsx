/**
 * 大文件后台流式分块导入组件 (Large File Chunked Stream Importer with Zero OOM)
 * 采用 1.5MB 分片 Base64 增量上传至服务器临时文件，彻底杜绝前端与后端 Out of Memory (OOM) 崩溃。
 */

import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles, Play, Database as DbIcon } from 'lucide-react';
import { Language, translations } from '../i18n/translations';

interface LargeFileImporterModalProps {
  lang: Language;
  existingTables: string[];
  onImportCompleted: () => void;
  onClose: () => void;
}

export const LargeFileImporterModal: React.FC<LargeFileImporterModalProps> = ({
  lang,
  existingTables,
  onImportCompleted,
  onClose
}) => {
  const t = translations[lang];
  const [importMode, setImportMode] = useState<'create' | 'append'>(existingTables.length > 0 ? 'append' : 'create');
  const [targetTableName, setTargetTableName] = useState(existingTables[0] || 'imported_dataset');
  const [newTableName, setNewTableName] = useState('new_dataset');
  const [fileType, setFileType] = useState<'json' | 'csv'>('json');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; sizeMb: number; previewText: string } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // 轮询后台导入任务状态
  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/db/import-status/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            clearInterval(timer);
            setImporting(false);
            if (data.status === 'COMPLETED') {
              onImportCompleted();
            }
          }
        }
      } catch {
        // ignore
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [jobId]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    if (file.name.endsWith('.csv')) {
      setFileType('csv');
    } else {
      setFileType('json');
    }

    const suggestedName = file.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (suggestedName) {
      setNewTableName(suggestedName);
      if (existingTables.length === 0) {
        setTargetTableName(suggestedName);
      }
    }

    const sizeMb = Number((file.size / (1024 * 1024)).toFixed(2));

    // 轻量预览前 10KB
    const previewSlice = file.slice(0, 10240);
    const previewReader = new FileReader();
    previewReader.onload = (event) => {
      const previewContent = event.target?.result as string || '';
      setFileMeta({
        name: file.name,
        sizeMb,
        previewText: previewContent.substring(0, 1500)
      });
    };
    previewReader.readAsText(previewSlice);
  };

  const handleStartImport = async () => {
    if (!selectedFile) {
      alert(lang === 'zh' ? '请先选择要导入的数据文件。' : 'Please select a data file first.');
      return;
    }
    const finalTable = importMode === 'append' ? targetTableName : newTableName.trim();
    if (!finalTable) {
      alert(lang === 'zh' ? '请选择或填写目标表名。' : 'Please specify target table name.');
      return;
    }

    setImporting(true);
    setJobStatus(null);
    setUploadProgress(0);

    try {
      // 1. 初始化导入任务
      const initRes = await fetch('/api/db/import/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: finalTable, mode: importMode })
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || '初始化导入失败');

      const currentJobId = initData.jobId;
      setJobId(currentJobId);

      // 2. 原生二进制流式分片上传 (每片 2.5 MB，原生 Blob 零 Base64 膨胀，零浏览器与容器内存激增)
      const chunkSize = 2.5 * 1024 * 1024;
      const totalSize = selectedFile.size;
      let offset = 0;
      let chunkIndex = 0;

      while (offset < totalSize) {
        const slice = selectedFile.slice(offset, offset + chunkSize);

        const chunkRes = await fetch(`/api/db/import/chunk-binary?jobId=${currentJobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: slice
        });
        if (!chunkRes.ok) {
          const errData = await chunkRes.json().catch(() => ({}));
          throw new Error(errData.error || `上传分片 ${chunkIndex + 1} 失败`);
        }

        offset += chunkSize;
        chunkIndex++;
        setUploadProgress(Math.min(100, Math.round((offset / totalSize) * 100)));
      }

      // 3. 完成上传并启动后台流式解析
      const finishRes = await fetch('/api/db/import/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJobId, fileType })
      });
      const finishData = await finishRes.json();
      if (!finishRes.ok) throw new Error(finishData.error || '启动后台导入失败');

    } catch (err: any) {
      alert(err.message || '导入异常');
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-purple-500/10 text-purple-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">
                {lang === 'zh' ? '大文件后台分块流式导入 (Zero OOM 架构)' : 'Chunked Stream Importer (Zero OOM)'}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {lang === 'zh'
                  ? '采用 1.5MB 分片增量上传与磁盘流式逐行解析，支持几百 MB 至数 GB 数据集，内存占用恒定。'
                  : 'Chunk-based incremental upload & disk stream parsing supports massive files with constant memory usage.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm p-1 rounded hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* 1. 文件上传卡片 */}
          <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-lg p-5 text-center transition bg-slate-950/50">
            <input
              type="file"
              accept=".json,.csv,.txt"
              onChange={handleFileUpload}
              disabled={importing}
              id="large-file-input"
              className="hidden"
            />
            <label htmlFor="large-file-input" className="cursor-pointer block space-y-2">
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-xs font-medium text-slate-200">
                {fileMeta ? (
                  <span className="text-emerald-400 font-mono font-bold">📄 {fileMeta.name} ({fileMeta.sizeMb} MB)</span>
                ) : (
                  <span>{lang === 'zh' ? '点击选择任意大小的 JSON / CSV 文件' : 'Click to select large JSON / CSV file'}</span>
                )}
              </div>
              <div className="text-[10px] text-slate-500">
                {lang === 'zh' ? '支持分片上传，绝对不会发生 Out of Memory' : 'Chunked upload prevents Out of Memory errors'}
              </div>
            </label>
          </div>

          {/* 后台异步提示 */}
          <div className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-900/40 p-2.5 rounded flex items-center gap-2">
            <span>💡</span>
            <span>{lang === 'zh' ? '提示：上传完成后，服务端将在独立后台异步写入数据库并构建盘索引，不会中断。' : 'Tip: After upload, server processes import in background independently.'}</span>
          </div>

          {/* 文件轻量预览 */}
          {fileMeta && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{lang === 'zh' ? '文件结构预览 (前 1.5 KB):' : 'File Structure Preview:'}</span>
                <span className="font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">{fileType}</span>
              </div>
              <pre className="bg-slate-950 text-slate-300 font-mono text-[10px] p-2.5 rounded border border-slate-800 max-h-28 overflow-y-auto leading-relaxed">
                {fileMeta.previewText}
              </pre>
            </div>
          )}

          {/* 2. 导入策略选择 */}
          <div className="space-y-3 pt-2">
            <label className="block text-xs font-semibold text-slate-300">
              {lang === 'zh' ? '选择导入目标策略 (Target Table Strategy):' : 'Select Target Table Strategy:'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setImportMode('append')}
                disabled={importing || existingTables.length === 0}
                className={`p-3 rounded-lg border text-left text-xs transition cursor-pointer flex items-center gap-2.5 ${
                  importMode === 'append'
                    ? 'bg-indigo-950/60 border-indigo-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                } ${existingTables.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <DbIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <div className="font-semibold">{lang === 'zh' ? '追加到已有表' : 'Append to Existing'}</div>
                  <div className="text-[10px] text-slate-400">{existingTables.length} tables available</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setImportMode('create')}
                disabled={importing}
                className={`p-3 rounded-lg border text-left text-xs transition cursor-pointer flex items-center gap-2.5 ${
                  importMode === 'create'
                    ? 'bg-emerald-950/60 border-emerald-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-semibold">{lang === 'zh' ? '创建新数据表' : 'Create New Table'}</div>
                  <div className="text-[10px] text-slate-400">Auto schema detection</div>
                </div>
              </button>
            </div>
          </div>

          {/* 3. 表名设置 */}
          {importMode === 'append' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {lang === 'zh' ? '选择目标已有表 (Target Table):' : 'Select Existing Table:'}
              </label>
              <select
                value={targetTableName}
                onChange={e => setTargetTableName(e.target.value)}
                disabled={importing || existingTables.length === 0}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded px-3 py-2 font-mono focus:outline-none"
              >
                {existingTables.map(tbl => (
                  <option key={tbl} value={tbl}>{tbl}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {lang === 'zh' ? '输入新数据表名称 (New Table Name):' : 'New Table Name:'}
              </label>
              <input
                type="text"
                value={newTableName}
                onChange={e => setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g. analytics_log"
                disabled={importing}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded px-3 py-2 font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {/* 上传分片进度与后台处理状态 */}
          {importing && uploadProgress < 100 && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-medium text-slate-300">
                <span>{lang === 'zh' ? '正在分片上传至服务器...' : 'Uploading file chunks...'}</span>
                <span className="font-mono text-indigo-400">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {jobStatus && (
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2">
                  {jobStatus.status === 'PROCESSING' && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
                  {jobStatus.status === 'COMPLETED' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {jobStatus.status === 'FAILED' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                  <strong className="text-white">Status: {jobStatus.status}</strong>
                </span>
                <span className="font-mono text-indigo-300">{jobStatus.progressPercent}%</span>
              </div>

              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${jobStatus.status === 'FAILED' ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${jobStatus.progressPercent}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Imported: {jobStatus.importedRows} rows</span>
                <span>Speed: {jobStatus.speedRowsPerSec} rows/sec</span>
              </div>

              {jobStatus.errorMessage && (
                <div className="text-xs text-rose-400 font-mono bg-rose-950/40 p-2 rounded border border-rose-900/40">
                  {jobStatus.errorMessage}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-5 mt-5 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
          >
            {t.modalCancel}
          </button>
          <button
            type="button"
            disabled={importing || !selectedFile}
            onClick={handleStartImport}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors disabled:opacity-50 cursor-pointer shadow"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{importing ? (lang === 'zh' ? '零OOM流式导入中...' : 'Streaming Import...') : (lang === 'zh' ? '开始分块流式导入' : 'Start Chunked Import')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
