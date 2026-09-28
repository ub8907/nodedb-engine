import React, { useState } from 'react';
import { BookOpen, Copy, Check, ExternalLink, Shield, Database, Cpu, GitBranch, Key, HardDrive, Terminal, FileCode, CheckCircle2, AlertTriangle, Layers, Share2, Sparkles, HelpCircle } from 'lucide-react';
import { Language, translations } from '../i18n/translations';

interface DocumentationProps {
  lang: Language;
}

export const Documentation: React.FC<DocumentationProps> = ({ lang }) => {
  const t = translations[lang];
  const [activeSection, setActiveSection] = useState<string>('share_url');
  const [copiedLink, setCopiedLink] = useState(false);

  // AI Studio 环境变量或元数据传入的外部公开分享链接
  const SHARED_APP_URL = 'https://ais-pre-phvssdqys7h2zfpe5jjejd-292860730917.asia-northeast1.run.app';
  const DEV_APP_URL = 'https://ais-dev-phvssdqys7h2zfpe5jjejd-292860730917.asia-northeast1.run.app';

  const copySharedUrl = () => {
    navigator.clipboard.writeText(SHARED_APP_URL);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const sections = [
    { id: 'share_url', title: '0. Share your app 外网链接获取指南 (必读)', icon: Share2, badge: '热门问题' },
    { id: 'arch', title: '1. 系统架构总览与微内核设计', icon: Database },
    { id: 'btree', title: '2. 主键自建平衡 B-树 (Order t)', icon: GitBranch },
    { id: 'btree_multi', title: '3. 二级多值 B-树与区间范围扫描', icon: Layers },
    { id: 'hash_index', title: '4. 唯一列 O(1) 哈希索引与冲突防重', icon: Cpu },
    { id: 'autoincrement', title: '5. SQLite AUTOINCREMENT 自增行为规范', icon: Key },
    { id: 'base62', title: '6. 时间有序 Base62 简短唯一键算法', icon: Sparkles },
    { id: 'storage', title: '7. 六重存储高可用与防灾保护体系', icon: Shield },
    { id: 'sql', title: '8. SQL 引擎与多表 JOIN (INLJ/Hash Join)', icon: Terminal },
    { id: 'code_api', title: '9. Node.js & 纯 Python SDK 封装调用', icon: FileCode }
  ];

  return (
    <div className="space-y-6">
      {/* 头部 Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 mt-1">
              <BookOpen className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {lang === 'zh' ? 'NodeDB 数据库系统全量中文技术文档' : 'NodeDB System Complete Technical Documentation'}
              </h1>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-3xl">
                {lang === 'zh'
                  ? '包含算法数学推导、多表 JOIN 索引优化器、Base62 毫秒熵池编码、六重存储物理防护、以及在 Google AI Studio 中获取公开普通外网访问链接的标准教程。'
                  : 'Complete algorithmic proofs, multi-table JOIN index optimizers, Base62 entropy encoding, 6-layer crash protection, and external sharing guides.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveSection('share_url')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer self-start md:self-auto"
          >
            <Share2 className="w-4 h-4" />
            <span>{lang === 'zh' ? '如何获取外网链接？' : 'Get Shareable Public URL'}</span>
          </button>
        </div>
      </div>

      {/* 主体左右双栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧章节导航 */}
        <aside className="lg:col-span-4 space-y-1.5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 mb-2">
            {lang === 'zh' ? '文档核心章节目录' : 'Documentation Index'}
          </div>
          {sections.map(sec => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-medium transition flex items-center justify-between group cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 border border-slate-800/80'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'}`} />
                  <span className="truncate">{sec.title}</span>
                </span>
                {sec.badge && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${isActive ? 'bg-white text-indigo-700' : 'bg-rose-500/20 text-rose-300'}`}>
                    {sec.badge}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* 右侧正文区域 */}
        <main className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-lg p-6 text-slate-200 text-xs sm:text-sm leading-relaxed space-y-6">
          {/* 章节 0：Share your app 外网链接获取指南 */}
          {activeSection === 'share_url' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-indigo-400" />
                  <span>Share your app 怎么获取普通外网访问链接？</span>
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                  官方推荐分享机制
                </span>
              </div>

              {/* 核心区别卡片 */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-amber-400" />
                  为什么直接复制浏览器地址栏的链接，别人打不开（显示 403 权限拒绝）？
                </h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  在 Google AI Studio 中，应用有两个不同的 URL 地址，具有完全不同的权限级别：
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                  <div className="p-3 rounded bg-slate-900 border border-rose-500/30">
                    <div className="font-bold text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      1. 开发预览链接 (Development App URL)
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 truncate mt-1 bg-slate-950 p-1.5 rounded">
                      {DEV_APP_URL}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      <span className="text-rose-300 font-semibold">仅限开发者本人：</span>该链接用于实时编码热调试，绑定了开发者的 Google 账号登录鉴权与 Cookie，其他任何人打开都会被 Google Cloud IAM 拦截拒绝（403 Forbidden）。
                    </p>
                  </div>

                  <div className="p-3 rounded bg-slate-900 border border-emerald-500/40">
                    <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      2. 公开分享链接 (Shared App URL)
                    </div>
                    <div className="font-mono text-[11px] text-emerald-300 truncate mt-1 bg-slate-950 p-1.5 rounded">
                      {SHARED_APP_URL}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      <span className="text-emerald-300 font-semibold">全网公开免登录：</span>已打通全球 Cloud Run CDN 网关，支持手机、微信、电脑等任何外部浏览器免登录直接访问！
                    </p>
                  </div>
                </div>
              </div>

              {/* 当前应用专属公开链接一键获取 */}
              <div className="p-4 rounded-lg bg-indigo-950/40 border border-indigo-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    当前应用的有效普通外网访问链接：
                  </span>
                  <span className="text-[11px] text-emerald-400 font-medium">状态：已上线就绪 (Live)</span>
                </div>

                <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <input
                    type="text"
                    readOnly
                    value={SHARED_APP_URL}
                    className="w-full bg-transparent text-emerald-300 font-mono text-xs focus:outline-none"
                  />
                  <button
                    onClick={copySharedUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0 transition cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? '已复制外网链接' : '一键复制'}
                  </button>
                  <a
                    href={SHARED_APP_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                    title="在全新标签页中以外网访客身份打开"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* 分步操作教学图解 */}
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-100 text-sm">
                  从 Google AI Studio 界面中获取 / 更新外网链接的分步步骤：
                </h3>
                <ol className="space-y-2.5 text-xs text-slate-300 list-decimal list-inside bg-slate-950/60 p-4 rounded-lg border border-slate-800">
                  <li className="leading-relaxed">
                    <strong className="text-white">点击右上角「Share」按钮：</strong> 在 AI Studio 当前编辑界面的右上角顶部导航栏，找到蓝色的 <span className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 font-medium">Share</span> 或 <span className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 font-medium">Deploy / Share App</span> 按钮。
                  </li>
                  <li className="leading-relaxed">
                    <strong className="text-white">配置分享权限 (Access Control)：</strong> 弹出的分享设置窗口中，选择 <span className="text-emerald-400 font-semibold">"Anyone with the link can view / access"</span>（任何拥有链接的人均可访问）。
                  </li>
                  <li className="leading-relaxed">
                    <strong className="text-white">复制 Shared URL 并分发：</strong> 点击弹窗中的 <span className="text-indigo-400 font-semibold">Copy Link</span>。该链接格式形如 <code className="text-emerald-300 font-mono">https://ais-pre-*.asia-northeast1.run.app</code>。
                  </li>
                  <li className="leading-relaxed">
                    <strong className="text-white">测试外网连通性：</strong> 打开浏览器的「无痕模式 / 隐身窗口」或手机断开公司内网使用 5G 蜂窝网络打开该链接，即可验证外部访客能否秒级打开 NodeDB 工作台。
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* 章节 1：系统架构总览 */}
          {activeSection === 'arch' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Database className="w-5 h-5 text-indigo-400" />
                <span>1. 系统架构总览与微内核设计</span>
              </h2>
              <p>
                NodeDB 是一个<strong>零外部重量级 C 依赖</strong>、纯 TypeScript/Node.js 与纯 Python 双语言自建的高可用嵌入式存储引擎。
                它摒弃了依赖 sqlite3.node、rocksdb 等需要本机构建工具链的包，采用纯数学结构自主实现完整数据库核心。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded bg-slate-950 border border-slate-800">
                  <div className="font-semibold text-indigo-400">1. 自建平衡树内核</div>
                  <p className="text-[11px] text-slate-400 mt-1">Order t 可配置多路平衡 B-树，主键 O(log N) 点查与多值区间扫描。</p>
                </div>
                <div className="p-3 rounded bg-slate-950 border border-slate-800">
                  <div className="font-semibold text-emerald-400">2. 六重物理防灾</div>
                  <p className="text-[11px] text-slate-400 mt-1">POSIX 原子重命名、IEEE 802.3 CRC32 校验、.bak 灾备自愈与 fsync 硬件刷盘。</p>
                </div>
                <div className="p-3 rounded bg-slate-950 border border-slate-800">
                  <div className="font-semibold text-amber-400">3. 全语法 SQL & JOIN</div>
                  <p className="text-[11px] text-slate-400 mt-1">内置 Lexer、Parser 与 Optimizer，支持 INLJ 与 Hash Join 多表高效联查。</p>
                </div>
              </div>
            </div>
          )}

          {/* 章节 2：主键自建平衡 B-树 */}
          {activeSection === 'btree' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <GitBranch className="w-5 h-5 text-indigo-400" />
                <span>2. 主键自建平衡 B-树 (Order t) 数学原理</span>
              </h2>
              <p>
                NodeDB 的主键索引基于标准 <strong>B-Tree (Minimum Degree $t$)</strong> 算法实现。每个内部节点至多拥有 $2t-1$ 个键，至少拥有 $t-1$ 个键（根节点除外）。
              </p>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2 font-mono text-xs">
                <div className="text-indigo-300 font-bold">// B-树核心数学不变量：</div>
                <div>1. 根节点至少拥有 1 个键，至多拥有 2t - 1 个键；</div>
                <div>2. 内部非根节点至少拥有 t - 1 个键，至多拥有 2t - 1 个键；</div>
                <div>3. 拥有 k 个键的内部节点，严格拥有 k + 1 个子树指针；</div>
                <div>4. 所有叶子节点严格处于完全相同的深度（绝对平衡）；</div>
                <div>5. 点查时间复杂度：O(t · log_t N) ≈ O(log N)；</div>
              </div>
              <p className="text-xs text-slate-400">
                当节点键数量达到 $2t-1$ 时，插入操作触发主动分裂（Preemptive Split），将中间键提升至父节点；当删除节点导致键数量不足 $t-1$ 时，触发借键（Borrow）或子树合并（Merge），确保树结构永不退化。
              </p>
            </div>
          )}

          {/* 章节 3：二级多值 B-树 */}
          {activeSection === 'btree_multi' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Layers className="w-5 h-5 text-indigo-400" />
                <span>3. 二级多值 B-树与区间范围扫描</span>
              </h2>
              <p>
                在关系数据库中，二级列（如订单金额 amount、状态 status、城市 city）往往存在大量重复值。常规唯一 B-树无法直接容纳重复键。
              </p>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs space-y-2">
                <strong className="text-indigo-300">多值映射设计 (Inverted PK Map)：</strong>
                <p className="text-slate-300">
                  每个 B-树节点的 Key 对应一个 <code className="text-amber-300 font-mono">Set&lt;PK&gt;</code> 主键集合。
                  执行等值查询时直接取出匹配的 Set；执行 <code className="text-emerald-300 font-mono">BETWEEN minKey AND maxKey</code> 区间查询时，利用中序迭代器仅遍历命中范围内的树分支，时间复杂度为 <code className="text-indigo-300 font-mono">O(log N + K)</code>（K 为区间内命中的记录数），彻底规避全表扫描。
                </p>
              </div>
            </div>
          )}

          {/* 章节 4：唯一列哈希索引 */}
          {activeSection === 'hash_index' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Cpu className="w-5 h-5 text-indigo-400" />
                <span>4. 唯一列 O(1) 哈希索引与冲突防重</span>
              </h2>
              <p>
                对于客户邮箱（customer_email）或唯一短键（order_no），NodeDB 构建了基于散列表的高性能哈希索引：
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <li><strong className="text-white">O(1) 精确点查：</strong> 无需树节点逐层比较，通过高分散度 Hashcode 直接定位主键 PK 指针。</li>
                <li><strong className="text-white">严格唯一约束防护：</strong> 插入新记录前，原子检查哈希表中是否存在相同值。若存在且不属于当前更新主键，直接抛出 <code className="text-rose-400 font-mono">UniqueConstraintError</code> 阻断写入。</li>
              </ul>
            </div>
          )}

          {/* 章节 5：SQLite AUTOINCREMENT 行为 */}
          {activeSection === 'autoincrement' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Key className="w-5 h-5 text-indigo-400" />
                <span>5. SQLite AUTOINCREMENT 自增行为规范</span>
              </h2>
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs">
                <strong>核心准则：持久化 next_id 单调递增，删除记录历史 ID 严格永不复用。</strong>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                在普通自增系统中，若删除 ID=10 的末尾记录，下次插入可能会重新生成 ID=10，这将导致历史外键引用混乱和合规审计断裂。
                NodeDB 深度对齐 <strong>SQLite sqlite_sequence</strong> 机制：
                每张表维护一个持久化的 <code className="text-indigo-300 font-mono">next_id</code> 计数器（例如当前 next_id=11）。
                即便数据行被删除，<code className="text-indigo-300 font-mono">next_id</code> 绝对不会回退。无论是系统重启还是故障自愈，下一个插入记录的主键将严格延续递增，彻底保护审计追溯链条。
              </p>
            </div>
          )}

          {/* 章节 6：时间有序 Base62 简短唯一键 */}
          {activeSection === 'base62' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <span>6. 时间有序 Base62 简短唯一键算法</span>
              </h2>
              <p>
                传统 UUID (36 字符) 长度过长且字符完全无序，作为索引键会导致 B-树剧烈页面抖动。NodeDB 创新设计了<strong>时间有序 Base62 紧凑短键 (13 字符)</strong>：
              </p>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2 text-xs font-mono">
                <div className="text-slate-400">短键格式: <span className="text-indigo-400 font-bold">[9 位 Base62 毫秒时间戳]</span> + <span className="text-emerald-400 font-bold">[4 位 (counter ⊕ PID) 混合熵]</span></div>
                <div className="text-slate-400">示例生成: <span className="text-amber-300">00VWJVRsk004C</span></div>
                <div className="pt-2 text-slate-300 font-sans">
                  <strong>优势：</strong>
                  1. 字符自然字典序严格等价于生成时间先后顺序；
                  2. 插入时自动生成（无需用户传值）；
                  3. 遇到冲突时触发内置指数避让重试，达到 100% 全局无碰撞保证。
                </div>
              </div>
            </div>
          )}

          {/* 章节 7：六重存储防护 */}
          {activeSection === 'storage' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Shield className="w-5 h-5 text-indigo-400" />
                <span>7. 六重存储高可用与磁盘索引持久化低内存体系</span>
              </h2>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start gap-2">
                  <span className="font-bold text-indigo-400 shrink-0">1. 原子写入 (Atomic Write):</span>
                  <span>每次刷写先写入独立 .tmp 临时文件，校验成功后执行系统级 POSIX 原子重命名，彻底杜绝断电半写入崩溃。</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start gap-2">
                  <span className="font-bold text-emerald-400 shrink-0">2. CRC32 完整性防静默翻转:</span>
                  <span>文件头部嵌入 IEEE 802.3 标准 32 位循环冗余校验和，加载读取时动态双向比对，毫秒级发现静默比特腐蚀 (Bit-rot)。</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start gap-2">
                  <span className="font-bold text-amber-400 shrink-0">3. .bak 镜像灾备回退:</span>
                  <span>每次覆盖写之前轮转归档 .bak 镜像。若主存储损坏，启动自动触发自愈回退并发出报警。</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start gap-2">
                  <span className="font-bold text-sky-400 shrink-0">4. PID 排他独占文件锁 (.lock):</span>
                  <span>写入时获取附带进程 PID 与微秒时间戳的独占文件锁，避免多进程并发争抢写入破坏文件。</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start gap-2">
                  <span className="font-bold text-purple-400 shrink-0">5. fsync 硬件物理刷盘:</span>
                  <span>在调用 rename 前强制调用 fsync 刷透 OS Page Cache，确保 dirty pages 彻底写入非易失介质。</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start gap-2">
                  <span className="font-bold text-rose-400 shrink-0">6. 磁盘持久化 B-树索引与 V8 紧凑二进制页 (低内存架构):</span>
                  <span>硬盘保留完整的 4KB 扇区对齐磁盘索引文件 (.idx)，采用 V8 紧凑二进制序列化替代笨重 JSON，空间缩小 90%+；配合 Buffer Pool LRU 页面置换，严格限定内存预算（如 32MB），热页常驻、冷页换出，完美适配内存极度受限环境。</span>
                </div>
              </div>
            </div>
          )}

          {/* 章节 8：SQL 引擎与多表 JOIN */}
          {activeSection === 'sql' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <span>8. SQL 引擎与多表 JOIN 原理 (INLJ / Hash Join)</span>
              </h2>
              <p>
                NodeDB 实现了自研的 ANSI-SQL 子集解析引擎，针对多表关联提供了企业级索引优化：
              </p>
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-emerald-400">索引嵌套循环连接 (Index Nested Loop Join, INLJ):</div>
                <p className="text-slate-300">
                  当执行 <code className="text-amber-300 font-mono">FROM orders INNER JOIN customers ON orders.customer_id = customers.id</code> 时，
                  查询优化器分析发现内表的 <code className="text-sky-300 font-mono">customers.id</code> 拥有主键自建平衡 B-树索引，因此外表的每一行不会去全表扫描内表，而是直接调用内表的 <code className="text-indigo-300 font-mono">pkIndex.search(customer_id)</code>，以 <code className="text-emerald-400 font-mono">O(M · log N)</code> 的极致速度完成多表连接！
                </p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-indigo-400">哈希连接 (Hash Join):</div>
                <p className="text-slate-300">
                  对于非索引列的 JOIN，优化器在内存中为内表构建单次 Hash Table，外表单遍探查匹配，将时间复杂度从 <code className="text-rose-400 font-mono">O(M × N)</code> 降低为线性 <code className="text-indigo-300 font-mono">O(M + N)</code>。
                </p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-amber-400">DDL 数据定义语言 (CREATE TABLE & DROP TABLE):</div>
                <p className="text-slate-300">
                  支持标准 SQL-92 / Core-2016 建表与删表语法，创建表时自动分配主键平衡 B-树与相关哈希/二级索引：
                </p>
                <div className="bg-slate-900 p-2.5 rounded font-mono text-[11px] text-emerald-300">
                  {`CREATE TABLE IF NOT EXISTS products (
  id INT PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(32) SHORTKEY UNIQUE,
  title TEXT,
  category TEXT INDEX,
  price NUMBER INDEX,
  in_stock BOOLEAN
);`}
                </div>
                <p className="text-slate-400 text-[11px]">
                  <strong>支持修饰符：</strong>
                  <code className="text-amber-300">PRIMARY KEY</code> (指定自建平衡 B-树主键)、
                  <code className="text-indigo-300">AUTOINCREMENT</code> (持久化 next_id 单调自增，删除不复用)、
                  <code className="text-emerald-300">SHORTKEY</code> (毫秒级 Base62 时间有序唯一短键)、
                  <code className="text-purple-300">UNIQUE</code> (O(1) 唯一散列哈希索引)、
                  <code className="text-sky-300">INDEX</code> (二级多值 B-树区间范围索引)。
                </p>
              </div>
            </div>
          )}

          {/* 章节 9：SDK 封装调用 */}
          {activeSection === 'code_api' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <span>9. Node.js & 纯 Python SDK 封装调用</span>
              </h2>
              <p className="text-xs text-slate-300">
                无论是 Node.js 还是 Python 环境，您都可以直接导入单文件类库无缝使用 NodeDB：
              </p>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto">
                <pre>{`# Python 调用示例:
from pynodedb import Database

db = Database("./data/app.ndb")
orders = db.get_table("orders")

# 插入记录 (自动分配持久化 next_id 并生成 Base62 短键)
row = orders.insert({"amount": 520, "customer_email": "vip@python.org"})
print("分配主键:", row["id"], "短键:", row["order_no"])

# 执行 SQL 多表查询
res = db.execute_sql("""
    SELECT orders.id, customers.name, orders.amount 
    FROM orders 
    INNER JOIN customers ON orders.customer_id = customers.id 
    WHERE orders.amount > 200
""")
print("查询结果:", res["rows"])`}</pre>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
