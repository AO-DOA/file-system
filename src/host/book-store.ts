// dsh-plugin-file-system — 书库定位（Host 侧基础设施）。
// 从 index.ts 的 apply 闭包抽出：已知项目根注册表、最近根定向、桶目录幂等创建、
// /tree 文档集合缓存。只依赖 node fs 与 fs-utils 的通用纯逻辑，不 import index.ts，
// 也不感知具体能力（能力描述符另见 abilities/registry.ts，本模块不 import 它）。
import { promises as fsp, type Dirent } from 'node:fs'
import { resolve, basename, join } from 'node:path'
import { normRel, relToSrcKey, resolveIn, newBookDir, legacyBookDir, booksRoot, projectKey, GEN_CWD_SEG } from './fs-utils.ts'

// 已知项目根条目：一个注册过的项目根绝对路径 + 它的书库桶名与桶目录。
// knownBookRoots 产出、bestRootFor 匹配、bookTargetFor 归属、ensureBookDirAt 建桶都走这个形状。
export interface BookRootEntry {
  projectRoot: string
  bucket: string
  dir: string
}

// 书库四层文档名集合：键为四层层名（与 fs-utils.ts 的 BOOK_REL_LAYERS 逐字一致），值为 md stem 集合。
export interface DocStemSets {
  目录概览: Set<string>
  文件摘要: Set<string>
  源码注解: Set<string>
  文章翻译: Set<string>
}

// /tree 文档视图条目：与当前根有前缀关系的某个项目根，及其四层 stem 集合（不含桶目录）。
export interface BookViewEntry {
  projectRoot: string
  bucket: string
  sets: DocStemSets
}

// 当前根的归属兜底条目：视图条目 + 桶目录（/tree 兜底分支要用 dir 拼带桶 docRel）。
export interface BookHomeEntry extends BookViewEntry {
  dir: string
}

// 读写定向结果（bookTargetFor）：目标绝对路径、归属桶、相对该根的 relP、文档「源码路径」键。
export interface BookTarget {
  abs: string
  bookRoot: BookRootEntry
  relP: string
  key: string
}

// ensureBookDirAt 入参：目标根与其桶目录必填；bucket 仅描述性字段，调用方可直传 BookRootEntry。
export interface EnsureBookDirEntry {
  projectRoot: string
  dir: string
  bucket?: string
}

// index.json 的已知字段（中文键逐字保留）。索引签名保留「其它字段原样保留」的动态读取语义。
interface BookIndexFile {
  项目?: string
  项目根?: string
  目录层?: unknown[]
  文件层?: unknown[]
  源码层?: unknown[]
  文章翻译?: unknown[]
  [k: string]: unknown
}

// 书库定位工厂的返回面（键名与原 apply 闭包内函数名一致）。
export interface BookStore {
  projectRootPath: () => string
  freshBookDir: () => string
  oldBookDir: () => string
  ensureBookDirAt: (entry: EnsureBookDirEntry) => Promise<void>
  ensureBookDir: () => Promise<void>
  knownBookRoots: () => Promise<BookRootEntry[]>
  bestRootFor: <T extends { projectRoot: string }>(abs: string, roots: readonly T[]) => T | null
  bookTargetFor: (rel: string) => Promise<BookTarget>
  layerStemSetIn: (bases: readonly string[], sub: string) => Promise<Set<string>>
  docStemSetsIn: (bases: readonly string[]) => Promise<DocStemSets>
  invalidateRootsCache: () => void
  invalidateDocCache: () => void
  cachedBookView: () => Promise<BookViewEntry[]>
  selfHomeEntry: () => Promise<BookHomeEntry>
}

/**
 * 书库定位工厂。
 * @param deps getRoot 每次调用取值（/api/fs/set-root 会改写 root，不得缓存成常量）
 * @returns 书库定位函数集合（键名与原 apply 闭包内函数名一致）
 */
export function createBookStore({ getRoot }: { getRoot: () => string }): BookStore {
  // ---- 文件系统三层解读：惰性解析 ----
  // 三层文档状态不建索引：按「文档命名规则」由节点路径推导文档文件是否存在，
  // /tree 每次只读四层子目录文件名一次，开销与被浏览目录有关、与书库总量无关。
  // 书库集中化：新桶 $DSH_HOME/books/<projectKey>/<4层>/ 只写（projectKey 与 DSH format.ts 逐字一致）；
  // 旧库 <项目根>/.book/<basename>-book/ 仅作只读回退（迁移兼容），目录不再创建。
  // 跨工作区共享：读写都定向「包含目标的最深已知项目根」的桶（见 knownBookRoots/bestRootFor）。
  // 项目根绝对路径（index.json「项目根」字段、bucketKey 入参）。
  function projectRootPath(): string { return resolve(getRoot()) }
  // 新桶目录。
  function freshBookDir(): string { return newBookDir(projectRootPath()) }
  // 旧库目录（只读回退）。
  function oldBookDir(): string { return legacyBookDir(projectRootPath()) }
  // 书库四层落盘子目录（与生成技能一致）：目录概览/文件摘要/源码注解 为解读三层，
  // 文章翻译 为翻译层（项目文件内 md 文档的译文）。
  const BOOK_LAYERS: string[] = ['目录概览', '文件摘要', '源码注解', '文章翻译']

  // 幂等确保指定项目根的桶存在：只建新桶（含 4 层子目录）；旧库目录不再创建（仅只读回退）。
  // 同时幂等补最小 index.json（项目/项目根字段）：注册表 knownBookRoots 依赖各桶
  // index.json 的「项目根」字段发现已知项目根，根注册后其它工作区才能把读写定向到它
  // （跨工作区共享的前提）。已有内容保留，只补缺字段。
  async function ensureBookDirAt(entry: EnsureBookDirEntry): Promise<void> {
    await fsp.mkdir(entry.dir, { recursive: true })
    for (const sub of BOOK_LAYERS) {
      await fsp.mkdir(resolve(entry.dir, sub), { recursive: true })
    }
    const idxPath = resolve(entry.dir, 'index.json')
    let idx: unknown = null
    try { idx = JSON.parse(await fsp.readFile(idxPath, 'utf8')) } catch { /* 不存在/损坏 → 下面按空对象重建 */ }
    if (!idx || typeof idx !== 'object') idx = {}
    const file = idx as BookIndexFile
    let changed = false
    if (typeof file['项目'] !== 'string' || !file['项目']) { file['项目'] = basename(entry.projectRoot); changed = true }
    if (typeof file['项目根'] !== 'string' || !file['项目根']) { file['项目根'] = entry.projectRoot; changed = true }
    for (const k of ['目录层', '文件层', '源码层', '文章翻译']) {
      if (!Array.isArray(file[k])) { file[k] = []; changed = true }
    }
    if (changed) {
      await fsp.writeFile(idxPath, JSON.stringify(file, null, 2) + '\n', 'utf8')
      invalidateRootsCache()
    }
  }
  // 当前工作区根的桶（加载/切换工作区时调用：打开过的根即注册为已知项目根）。
  function ensureBookDir(): Promise<void> {
    return ensureBookDirAt({ projectRoot: projectRootPath(), bucket: projectKey(projectRootPath()), dir: freshBookDir() })
  }

  // ---- 跨工作区共享：已知项目根注册表与最近根定向 ----
  // 书库按「项目根绝对路径」分桶；同一物理文件在不同工作区根下属于不同桶、键也不同。
  // 共享模型：读写都定向「包含目标的最深（最近）已知项目根」的桶，单一事实源——
  // 在插件目录根下生成的文档，从父级工作区（如 DSHworkPace）浏览时同样可见、可续写。
  // 已知项目根 = 各桶 index.json 的「项目根」字段（projectKey 是可读编码但 '-' 有歧义，
  // 不能从桶名可靠反解路径，故以 index.json 注册为准；无 index.json 的桶不参与定向）。
  // 已知项目根注册表缓存 TTL：readdir 书库根 + 逐桶读 index.json 是 /tree 高频路径，
  // 短缓存避免每次展开都全量扫盘。
  const ROOTS_CACHE_TTL = 5000
  let rootsCache: { at: number; roots: BookRootEntry[] | null } = { at: 0, roots: null }
  function invalidateRootsCache(): void { rootsCache = { at: 0, roots: null } }
  // 读一个桶注册的「项目根」；index.json 缺失/损坏/字段缺失一律返回 null。被吞掉的只有这次读取：
  // 该桶不参与读写定向，只是少一个候选根，其余桶与当前根照常工作，没有调用方依赖这个失败。
  async function bucketProjectRoot(bucket: string): Promise<string | null> {
    const idxPath = join(booksRoot(), bucket, 'index.json')
    let idx: unknown = null
    try { idx = JSON.parse(await fsp.readFile(idxPath, 'utf8')) } catch { /* 无/损坏 index.json → 视为未注册 */ }
    const file = idx as BookIndexFile | null
    const pr = file === null ? undefined : file['项目根']
    return typeof pr === 'string' && pr ? resolve(pr) : null
  }
  async function knownBookRoots(): Promise<BookRootEntry[]> {
    const now = Date.now()
    if (rootsCache.roots && now - rootsCache.at < ROOTS_CACHE_TTL) return rootsCache.roots
    const out: BookRootEntry[] = [] // [{ projectRoot, bucket, dir }]
    const seen = new Set<string>()
    for (const e of await readDirEntries(booksRoot())) {
      if (!e.isDirectory()) continue
      // 生成会话的统一工作目录不是书库桶（其中不写 index.json，此处显式跳过兜底）。
      if (e.name === GEN_CWD_SEG) continue
      const pr = await bucketProjectRoot(e.name)
      if (!pr || seen.has(pr)) continue
      seen.add(pr)
      out.push({ projectRoot: pr, bucket: e.name, dir: join(booksRoot(), e.name) })
    }
    // 当前工作区根隐式并入（即使桶尚未注册），保证「当前根恒参与定向」的现状语义。
    const selfRoot = projectRootPath()
    if (!seen.has(selfRoot)) {
      out.push({ projectRoot: selfRoot, bucket: projectKey(selfRoot), dir: freshBookDir() })
    }
    rootsCache = { at: now, roots: out }
    return out
  }
  // 包含 abs 的已知项目根中取路径最长（最深、离目标最近）者；无命中返回 null（调用方兜底当前根）。
  // 只读元素的 projectRoot 并把元素本身原样返回：两个调用点的入参形状不同（knownBookRoots 的
  // {projectRoot,bucket,dir} 与 cachedBookView 的 {projectRoot,bucket,sets}），故按元素类型泛型化。
  function bestRootFor<T extends { projectRoot: string }>(abs: string, roots: readonly T[]): T | null {
    const sep = process.platform === 'win32' ? '\\' : '/'
    let best: T | null = null
    for (const r of roots) {
      const p = r.projectRoot
      if (abs === p || abs.startsWith(p + sep)) {
        if (!best || p.length > best.projectRoot.length) best = r
      }
    }
    return best
  }
  // 读写定向：目标 rel（相对当前工作区根）→ 最近已知项目根条目 + 相对其的 relP + 源码键 key。
  // gen/tree 共用：文档 stem、frontmatter「源码路径」、/gen-status 的 docRel 必须同一根视角，
  // 否则宿主推导与技能落盘文件名漂移。
  async function bookTargetFor(rel: string): Promise<BookTarget> {
    const abs = resolveIn(getRoot(), rel)
    const roots = await knownBookRoots()
    const hit = bestRootFor(abs, roots)
      || { projectRoot: projectRootPath(), bucket: projectKey(projectRootPath()), dir: freshBookDir() }
    const relP = normRel(abs.slice(hit.projectRoot.length)) || '.'
    return { abs, bookRoot: hit, relP, key: relToSrcKey(relP, hit.projectRoot) }
  }
  // 读目录条目；目录不存在/不可读 → 空列表。调用方只关心「有没有条目」：书库根未创建、
  // 旧库位置不存在都是正常状态，没有任何通道会读到这次失败。
  async function readDirEntries(dir: string): Promise<Dirent[]> {
    try { return await fsp.readdir(dir, { withFileTypes: true }) } catch { /* 不存在/不可读 → 空列表 */ }
    return []
  }
  // 惰性读某一层子目录的既有文档名集合（存 stem，不含 .md）。
  // 双位置只读回退：新桶 + 旧库都探测并合并；某一位置缺失 → 该位置没有文档，另一位置照常读。
  async function layerStemSetIn(bases: readonly string[], sub: string): Promise<Set<string>> {
    const set = new Set<string>()
    for (const base of bases) {
      for (const f of await readDirEntries(resolve(base, sub))) {
        if (f.isFile() && f.name.endsWith('.md')) set.add(f.name.slice(0, -3))
      }
    }
    return set
  }
  // 惰性读四层文档名集合：每个项目根只做 4 次目录名 readdir。
  async function docStemSetsIn(bases: readonly string[]): Promise<DocStemSets> {
    const [a, b, c, d] = await Promise.all([
      layerStemSetIn(bases, '目录概览'), layerStemSetIn(bases, '文件摘要'),
      layerStemSetIn(bases, '源码注解'), layerStemSetIn(bases, '文章翻译'),
    ])
    return { 目录概览: a, 文件摘要: b, 源码注解: c, 文章翻译: d }
  }

  // /tree 文档视图短缓存：目录浏览是高频路径，避免每次展开都 ensureBookDir + N 次 readdir。
  // TTL 1.5s；root 变更自然 miss（缓存带 root 键）；runGenDoc 完成时主动失效，
  // 保证新生成文档的圆点在下一次 /tree 即出现。
  // 视图 = 与当前 root 有前缀关系（相等/互为祖先后代）的已知项目根各自的四层 stem 集合：
  // 只有这些根的桶可能被本工作区浏览的节点命中（跨工作区共享：子树定向到最近根桶）。
  const DOC_CACHE_TTL = 1500
  let docCache: { at: number; root: string; view: BookViewEntry[] | null } = { at: 0, root: '', view: null }
  function invalidateDocCache(): void { docCache = { at: 0, root: '', view: null }; invalidateRootsCache() }
  async function cachedBookView(): Promise<BookViewEntry[]> {
    const now = Date.now()
    if (docCache.view && docCache.root === getRoot() && now - docCache.at < DOC_CACHE_TTL) return docCache.view
    await ensureBookDir()
    const self = projectRootPath()
    const sep = process.platform === 'win32' ? '\\' : '/'
    const roots = (await knownBookRoots()).filter(r =>
      r.projectRoot === self || r.projectRoot.startsWith(self + sep) || self.startsWith(r.projectRoot + sep))
    const view: BookViewEntry[] = []
    for (const r of roots) {
      // 每桶双位置只读回退：新桶 + 该项目根的旧库（迁移兼容，通常不存在 → readdir 跳过）。
      const sets = await docStemSetsIn([r.dir, legacyBookDir(r.projectRoot)])
      view.push({ projectRoot: r.projectRoot, bucket: r.bucket, sets })
    }
    docCache = { at: Date.now(), root: getRoot(), view }
    return view
  }

  // 当前根自己的文档视图条目。归属兜底专用：已知根注册表缓存 5s、文档视图缓存 1.5s，两者不同步，
  // 切根后的窗口期内 view 可能不含当前根（此时 bestRootFor 对根下节点也返回 null）。调用方先判
  // view 是否含当前根，只在缺失时现算，命中缓存时零额外读盘。
  async function selfHomeEntry(): Promise<BookHomeEntry> {
    const self = projectRootPath()
    return {
      projectRoot: self,
      bucket: projectKey(self),
      dir: freshBookDir(),
      sets: await docStemSetsIn([freshBookDir(), legacyBookDir(self)]),
    }
  }

  return {
    projectRootPath,
    freshBookDir,
    oldBookDir,
    ensureBookDirAt,
    ensureBookDir,
    knownBookRoots,
    bestRootFor,
    bookTargetFor,
    layerStemSetIn,
    docStemSetsIn,
    invalidateRootsCache,
    invalidateDocCache,
    cachedBookView,
    selfHomeEntry,
  }
}
