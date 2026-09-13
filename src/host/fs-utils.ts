// dsh-plugin-file-system — Host 侧纯工具函数。
// 这些函数不依赖 DSH ctx，便于单元测试；宿主入口 lib/host/index.js 直接 import 使用。
import { resolve, basename, extname, join } from 'node:path'
import { homedir } from 'node:os'
import { ZH } from '../shared/locale.ts'

// 书库根：$DSH_HOME/books（process.env.DSH_HOME 优先；缺省 join(os.homedir(), '.dsh', 'books')）。
export function booksRoot(): string {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'books')
}

// 书库桶名：projectKey(项目根绝对路径)。算法与 DSH
// packages/session/session-persistence-jsonl/src/format.ts 的 projectKey 逐字一致
// （可读编码，非哈希）：安全字符 [A-Za-z0-9._-] 原样保留，'/' '\' ':' 连段转 '-'
// （连续分隔符只折一个连字符），其余字符转 '~XXXX'（UTF-16 code unit 十六进制、大写、
// 4 位补零；'~' 自身亦转义），首尾包 '--'，slug 段截断 251 字符；空串抛错。
export function projectKey(p: string | null | undefined): string {
  const cwd = String(p == null ? '' : p)
  if (cwd.length === 0) throw new Error(ZH.errEmptyProjectPath)
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

// 新桶目录：书库根 + 桶名。桶内直接 4 层（目录概览/文件摘要/源码注解/文章翻译）+ index.json，
// 无 <项目名>-book 中间层；项目根内不再有 .book。
export function newBookDir(projectRoot: string): string {
  return join(booksRoot(), projectKey(projectRoot))
}

// 旧库目录（迁移期只读回退）：<项目根>/.book/<basename(项目根)>-book/。
// 新代码只写新桶，旧库目录不再创建。
export function legacyBookDir(projectRoot: string): string {
  return resolve(projectRoot, '.book/' + basename(projectRoot) + '-book')
}

// 规范化相对路径：去 ./、去首尾 /
export function normRel(p: string | null | undefined): string {
  return String(p || '').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '')
}

// 工作区目录名（folder-doc 的「源码路径」前缀）。
export function wsName(root: string): string {
  return basename(root)
}

// 相对 root 的节点路径 → folder-doc「源码路径」键（工作区名 + '/' + 相对路径；根=工作区名）。
export function relToSrcKey(nodePath: string | null | undefined, root: string): string {
  const p = normRel(nodePath)
  const name = wsName(root)
  if (!p || p === '.' || p === name) return name
  return normRel(name + '/' + p)
}

// 目录层（folder-doc 目录概览）文档 stem：与文件层 computeDocStem 同一「含父目录层级」视角，
// 避免不同目录同名时互相覆盖（如 deepseekHARNESS/native/system/packages 与 deepseekHARNESS/packages
// 的 basename 同为 packages——旧规则只取文件夹名，两者落在同一 docAbs，见
// docs/agent/reports/2026-09-13-folder-doc-stem-collision.md）。
// 入参 relP 为相对归属根（projectRoot）的节点路径：/tree 目录分支用 normRel(nodeAbs.slice(root.length))，
// folder-doc 能力用 BookTarget.relP——两处经本函数收敛到与文件层完全相同的命名。
// 例：native/system/packages（归属根 deepseekHARNESS）→ deepseekHARNESS-native-system-packages 展开为
// computeDocStem 视角的 native-system-packages；根下 packages → deepseekHARNESS-packages（顶层工作区名兜底）。
// ⚠ 命名规则联动（改本函数必须三处同步，否则「UI 圆点判定」与「落盘文件名」漂移）：
//   ① 本函数（目录层 stem 唯一真源）
//   ② src/host/index.ts /tree 目录分支（hasDoc/docRel 判定）
//   ③ src/host/abilities/folder-doc/index.ts docStem（写盘文件名）
// computeDocStem 本身不动：文件层三层（文件摘要/源码注解/文章翻译）历史文档命名依赖它。
export function folderDocStem(relP: string | null | undefined, root: string): string {
  return computeDocStem(relToSrcKey(relP, root))
}

// 文件/源码层文档 stem，复现 file-doc/source-doc 的 computeName：
// 文件名前缀 = 文件相对工作区根的完整父目录路径（原样保留层级，用 - 连），
// 顶层（无父目录）用工作区名做前缀。rel 含工作区名前缀（宿主契约）。
// 例：ws/src/client/index.js → src-client-index；ws/README.md → ws-README。
// ⚠ 命名规则唯一真源：文件/源码层文档 stem 只此一处实现，改动即全部影响面。
export function computeDocStem(rel: string | null | undefined): string {
  const parts = String(rel || '').split('/').filter(Boolean)   // [工作区名, ...父目录, 文件名]
  const relParents = parts.slice(1, -1)
  const fileName = parts[parts.length - 1] || ''
  const stem = fileName.replace(/\.(md|markdown|js|ts|jsx|tsx|py|go|rs|json|yml|yaml|c|cpp|h|java|rb|php|sh|sql|mjs|d\.ts)$/i, '')
  return relParents.length === 0 ? `${String(parts[0])}-${stem}` : `${relParents.join('-')}-${stem}`
}

// 逻辑文档路径（docRel）格式：<层名>/<stem>.md（无前缀 = 当前工作区根的桶，兼容旧会话）。
// 前端透传该值，host 负责解析。
export function docRelBook(sub: string, stem: string): string {
  return normRel(sub + '/' + stem + '.md')
}

// 带桶逻辑文档路径（docRel）格式：@<桶名>/<层名>/<stem>.md。
// 跨工作区共享：文档归属「包含目标的最近已知项目根」的桶，docRel 自带桶名后
// 前端无需知道桶映射，/read 按桶段直接定位（客户端对 docRel 只做不透明透传）。
export function docRelBookIn(bucket: string, sub: string, stem: string): string {
  return '@' + bucket + '/' + sub + '/' + stem + '.md'
}

// 桶名形状校验：projectKey 输出字符集 [A-Za-z0-9._-~]，首尾 '--'；
// 显式拒绝含 '..' 段（防 @.. 穿越，resolveIn 另有兜底）。
export function bookBucketValid(bucket: string | null | undefined): boolean {
  const b = String(bucket == null ? '' : bucket)
  return /^[A-Za-z0-9._~-]+$/.test(b) && b !== '..' && !b.includes('..')
}

// 书库四层名（须与宿主侧其它四层名声明逐字一致，如 src/host/book-store.ts 的 BOOK_LAYERS）。
export const BOOK_REL_LAYERS: string[] = ['目录概览', '文件摘要', '源码注解', '文章翻译']

// 书库逻辑文档 rel 形状校验：<层名>/<stem>.md 或 @<桶名>/<层名>/<stem>.md，
// 以四个层名之一开头并以 .md/.markdown 结尾。
// 只做形状检查；../ 穿越与实际存在性由 host 侧「双位置/按桶」解析负责。
export function bookDocRelValid(rel: string | null | undefined): boolean {
  const n = normRel(String(rel == null ? '' : rel))
  if (!/\.(md|markdown)$/i.test(n)) return false
  const parts = n.split('/')
  if (parts.length === 3) {
    const b = String(parts[0])
    if (!b.startsWith('@') || !bookBucketValid(b.slice(1))) return false
    return BOOK_REL_LAYERS.includes(String(parts[1]))
  }
  return BOOK_REL_LAYERS.includes(String(parts[0]))
}

// 判定 rel 是否书库内逻辑文档（/read 据此走白名单双位置解析）。
export function isBookDocRel(rel: string | null | undefined): boolean {
  return bookDocRelValid(rel)
}

// 文档文件相对路径（新格式 <层名>/<stem>.md；root 参数保留仅为调用兼容）。
// `_root` 前缀：该参数源实现未使用，仅为调用兼容保留位置；noUnusedParameters 要求下划线命名。
export function docRelPath(_root: string, sub: string, stem: string): string {
  return docRelBook(sub, stem)
}

// md/markdown 类文档不生成 L2/L3（用户确认：md 本身即文档，不需文件层说明与源码翻译）。
export function isMdPath(p: string | null | undefined): boolean {
  const ext = extname(String(p || '')).slice(1).toLowerCase()
  return ext === 'md' || ext === 'markdown'
}

// 书库内路径判定：以 .book/ 开头（或就是 .book）。旧库兼容期有效（双位置回退依赖
// 旧库仍在项目根内）。项目文件内的 md 才能翻译，书库内的解读/译文文档不参与翻译。
export function isBookPath(p: string | null | undefined): boolean {
  const n = normRel(p)
  return n === '.book' || n.startsWith('.book/')
}

// 越权错误形状：源实现以动态属性挂 statusCode（host 侧统一映射 400），TS 下需显式声明。
interface PathEscapeError extends Error {
  statusCode: number
}

// 安全：路径必须落在 root 内，阻止 ../ 越权。
// 注意：用 root + 路径分隔符做前缀边界，避免 `/root/foobar` 被 `/root/foo` 误放行。
export function resolveIn(root: string, pathArg?: string | null): string {
  const sep = process.platform === 'win32' ? '\\' : '/'
  const abs = resolve(root, pathArg == null ? '.' : String(pathArg))
  if (abs !== root && !abs.startsWith(root + sep)) {
    const err = new Error(ZH.errPathEscape) as PathEscapeError
    err.statusCode = 400
    throw err
  }
  return abs
}

// 单次读取上限（2MB）：/api/fs/read 与翻译任务的源文大小校验共用同一真源。
export const READ_LIMIT = 2 * 1024 * 1024

// ---- 后台生成/翻译子 agent 的作用域规范（纯逻辑，便于单测）----

// 统一工作目录段名：所有后台生成/翻译会话的 cwd = booksRoot()/<GEN_CWD_SEG>。
// 固定它使会话落盘桶不再随 GUI 工作区漂移（历史上同一功能散落在 4 个桶），
// 子 agent 的临时产物也集中于此；该目录不写 index.json，故不参与书库桶发现。
export const GEN_CWD_SEG = 'session'

// 各任务形态期望的工具白名单。
//   src（L3）：2026-09-10 起确定性工作（单元划分/行号/排版/frontmatter/命名/index.json）全部由
//     宿主完成，骨架≈源码全文×1.5 故落盘到子 agent 的 cwd，模型用 read 分段读、edit 分批填空
//     （整篇 write 必然耗尽单步输出预算）——故不再需要 skill/bash，也不需要 glob/grep
//     （注解对象只有目标文件本身）；write 保留供问题台账建档。
//   folder（L1）：2026-09-10 起确定性工作（frontmatter/命名/目录树/index.json）全部由宿主
//     直接完成，提示词已带骨架，模型只「读子文件 → 写产物」——故不放开 skill/bash/检索。
//   file（L2）：同 L1 由宿主渲染骨架，但正文要写「谁用它 / 它用谁」，故保留只读检索工具。
//   translate：读源 + 写骨架 + 编辑追加。长文档译文超过单步输出预算，必须「骨架 + 锚点
//     分段 edit 追加」才能落盘（一次写完会耗尽预算导致空转，实测见 issues/2026-09-09-12）。
export const GEN_SCOPE_TOOLS: Record<string, string[]> = {
  src: ['read', 'write', 'edit'],
  folder: ['read', 'write'],
  file: ['read', 'write', 'glob', 'grep'],
  translate: ['read', 'write', 'edit'],
}

// 期望白名单（或与「当前可用工具名」的交集）。可用集合未提供时返回期望名单本身：
// 调用方在 setup 内拿不到 agent 作用域视图（tools.schemas() 省略 scope 即全局视图，
// 不含预设注册的工具），故按期望名单直给；提供了则取交集，避免名单含当前组合
// 没有的工具名导致 tools.restrict 抛 unknown global tool。
export function genScopeAllow(kind: string, available?: readonly string[]): string[] {
  const desired = GEN_SCOPE_TOOLS[kind] || []
  if (available === undefined) return [...desired]
  const has = new Set(available)
  return desired.filter(n => has.has(n))
}

// ---- 提示词模板渲染（纯逻辑，真源见 src/host/prompts/README.md）----

// 把模板里的 ${name} 替换为 vars[name]。约定与边界：
//   · 只认 ${name}（name 为 [A-Za-z0-9_]），**不处理 {{name}}**：{{…}} 是 system prompt 的
//     模板变量语法，未注册即 assembly 报错（见 index.js 中 {{model}} 的注释），故模板中禁用；
//     任务提示词自 2026-09-10 起只注入 user message、不再进 system prompt，该约定继续保留，
//     以免渲染结果将来被送回 system prompt 时踩同一坑。
//   · 未知占位符或值为 null/undefined 时**原样保留**，不抛错：一个模板笔误不应让整次
//     生成任务失败，且残留的 ${...} 在产物里一眼可见，便于定位。
export function renderPromptTemplate(tpl: string, vars?: Record<string, string | number | null | undefined>): string {
  return String(tpl).replace(/\$\{([A-Za-z0-9_]+)\}/g, (raw: string, name: string) => {
    const v = vars ? vars[name] : undefined
    return v === undefined || v === null ? raw : String(v)
  })
}

// 生成时间戳：YYYY-MM-DD HH:mm（本地时区），与 skills/*/scripts/*.mjs 的 formatStamp 同格式。
// 翻译层产物由模型写 frontmatter（该层无技能脚本参与），时间戳只能由宿主提供，
// 否则四层 frontmatter 的「生成时间」格式不一致（见 AGENTS.md §1）。
export function formatStamp(d?: Date): string {
  const t = d instanceof Date ? d : new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`
}

// ---- 问题台账序号（纯逻辑）----

// 台账序号：从 issues 目录文件名 <date>-<序号>-<slug>.md 取最大序号，返回下一个（两位补零）。
// 宿主在派发任务前算好并作为模板变量下发——翻译子 agent 工具面只有 read/write，
// 无法列目录自行取号。
export function nextIssueNo(fileNames?: readonly string[] | null): string {
  let max = 0
  for (const name of fileNames || []) {
    const m = /^\d{4}-\d{2}-\d{2}-(\d+)-/.exec(String(name))
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return String(max + 1).padStart(2, '0')
}
