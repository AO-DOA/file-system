// dsh-plugin-file-system-zc — Host half.
// 文件系统：宿主(Node)侧直接用 node fs 读写删文件，经 webServer.register
// 暴露 /api/fs/* HTTP 路由，浏览器 client 用 fetch 调用（不依赖 host builtin）。
// 这样打包插件形态下也能持久常驻并对宿主文件做查看/编辑/删除。

import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve, dirname, extname, join } from 'node:path'
import { type IncomingMessage, type ServerResponse } from 'node:http'
import {
  normRel, relToSrcKey, computeDocStem, isMdPath, isBookPath, isBookDocRel, resolveIn,
  bookBucketValid, docRelBookIn, legacyBookDir, booksRoot, GEN_CWD_SEG, READ_LIMIT, genScopeAllow,
  BOOK_REL_LAYERS,
} from './fs-utils.ts'
import { ZH } from '../shared/locale.ts'
import { createBookStore } from './book-store.ts'
import { type BookRootEntry, type BookTarget, type BookViewEntry } from './book-store.ts'
import { loadAbilityPrompt } from './prompt-loader.ts'
import { issuesDir, nextIssueNoFromDisk, syncIssueIndex } from './issues.ts'
import { createGenExecutor } from './gen-executor.ts'
import { createTranslateExecutor } from './translate-executor.ts'
import { abilityOf, TRANSLATE_ABILITY } from './abilities/registry.ts'
import { errTaskTimeout, TASK_TIMEOUT_MS } from './task-utils.ts'

export const name = 'fs'
export const inject = ['webServer', 'sandboxPolicy', 'sessions', 'agentLoop']

// ---- 上下文最小面（类型层，运行时无对应物）----
// 各服务只声明本文件真正触达的成员，不 import 具体服务包、也不对 cordis `Context` 做
// 声明合并：同一 `Context` 键在 host/client 两个编译面各写一份不同形状会触发合并冲突
// （见 PROGRESS.md D-6）。运行时仍由 Loader 传入真实 ctx，结构兼容。

/** 宿主 web-server 服务：本插件只用 prefix 注册。 */
interface WebServerSurface {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** 沙箱策略服务：只读 workspaceRoot 作为默认读写根。 */
interface SandboxPolicySurface {
  workspaceRoot?: string
}

/** 会话服务：按 id 取会话对象，读 header.cwd 定位其工作目录。 */
interface SessionsSurface {
  get?(sessionId: string): { header?: { cwd?: string } } | undefined
}

/** 子 agent 模型路由（resolveAgentOptions 的输出，字段与 DSH agent options 同名）。 */
interface AgentModelOptions {
  provider?: string
  model?: string
  reasoningEffort?: string
  maxTokens?: number
}

/** agents 服务：取当前 initiator agent 以继承其模型路由。 */
interface AgentsSurface {
  currentInitiator?(): { options?: AgentModelOptions } | undefined
}

/** agentDefaultModel 服务：无 initiator（浏览器经 HTTP 触发）时的部署默认模型。 */
interface AgentDefaultModelSurface {
  currentSelection?(): { provider?: string; model?: string; reasoningEffort?: string } | undefined
}

/** 子 agent 上下文：applyGenScope 只触达 tools.restrict。 */
interface AgentCtxSurface {
  tools?: { restrict?: (options: { allow: string[] }) => void }
}

/** 后台生成/翻译任务状态：4 态（pending → running → success | error），无 cancelled。 */
type TaskStatus = 'pending' | 'running' | 'success' | 'error'

/** genTasks 的条目形状（/gen-status 原样下发前端）。 */
interface GenTask {
  id: string
  kind: string
  rel: string
  docRel: string
  status: TaskStatus
  error: string | null
  startedAt: number | null
  finishedAt: number | null
}

/** POST body 的已知字段；未知形状的属性读出来即 undefined（与源一致）。 */
interface FsPayload {
  path?: string
  content?: string
  kind?: string
}

/** /api/fs/tree 的节点：目录与文件字段集相同，仅 type 与几个固定空串不同。 */
interface TreeNode {
  name: string
  type: 'directory' | 'file'
  path: string
  hasDoc: boolean
  hasDocSrc: boolean
  hasDocTr: boolean
  docRel: string
  docSrcRel: string
  docTrRel: string
}

/** 书库逻辑文档 rel 的解析结果（bucket 为 null 表示无桶形状）。 */
interface ParsedBookDocRel {
  bucket: string | null
  sub: string
  leaf: string
}

/** 测试句柄（仅 NODE_ENV==='test' 挂载，生产不暴露内部状态）。 */
interface FsTestHandle {
  handle: (req: IncomingMessage, res: ServerResponse, seg: string) => Promise<void>
  genTasks: Map<string, GenTask>
  sweepGenTasks: () => void
  getRoot: () => string
  setRoot: (p: string) => void
  genCwdAbs: () => string
  knownBookRoots: () => Promise<BookRootEntry[]>
}

/** apply 收到的宿主上下文最小面（注入由 `inject` 声明的 4 个服务）。 */
interface FsHostContext {
  webServer?: WebServerSurface
  sandboxPolicy?: SandboxPolicySurface
  sessions?: SessionsSurface
  effect(callback: () => unknown, label?: string): unknown
  get(name: string): unknown
  __fsTest?: FsTestHandle
}

export function apply(ctx: FsHostContext): void {
  const webServer = ctx.webServer as WebServerSurface
  const sandboxPolicy = ctx.sandboxPolicy
  const sessions = ctx.sessions

  // 读写根：默认当前会话工作区（sandboxPolicy.workspaceRoot），回退进程 cwd，
  // 可经 POST /api/fs/set-root 覆盖。
  let root = (sandboxPolicy && sandboxPolicy.workspaceRoot) || process.cwd()

  // ---- 后台生成任务状态（供前端查询/错误反馈）----
  // key: taskId; value: { id, kind, rel, status, error, startedAt, finishedAt }
  const genTasks = new Map<string, GenTask>()
  // 任务记录淘汰：完成超 10 分钟删除；总量超 100 条时按完成时间删最旧的已完成任务。
  // 每次新增任务前调用，避免 Map 只增不减导致长跑内存缓增。
  // 兜底淘汰：running 且 startedAt 超 TASK_TIMEOUT_MS（进程重启后遗留 running，
  // 或子 agent 静默挂死、whenIdle 竞速未及触发）→ 置 error（finishedAt 打点），
  // 前端轮询 gen-status 收到 error 后停止。
  const GEN_TASK_TTL = 10 * 60 * 1000
  const GEN_TASK_CAP = 100
  function sweepGenTasks(): void {
    const now = Date.now()
    for (const [id, t] of genTasks) {
      if (t.finishedAt && now - t.finishedAt > GEN_TASK_TTL) {
        genTasks.delete(id)
        continue
      }
      if (t.status === 'running' && now - (t.startedAt || 0) > TASK_TIMEOUT_MS) {
        setGenTaskStatus(id, 'error', errTaskTimeout())
      }
    }
    if (genTasks.size <= GEN_TASK_CAP) return
    const done = [...genTasks.values()]
      .filter((t): t is GenTask & { finishedAt: number } => Boolean(t.finishedAt))
      .sort((a, b) => a.finishedAt - b.finishedAt)
    for (const t of done) {
      if (genTasks.size <= GEN_TASK_CAP) break
      genTasks.delete(t.id)
    }
  }

  // 统一工作目录（$DSH_HOME/books/session）：执行器用它作为子 agent 的 cwd；
  // 这里保留解析函数供测试句柄与路由复用（执行器各自 ensure 目录）。
  function genCwdAbs(): string { return join(booksRoot(), GEN_CWD_SEG) }

  function applyGenScope(agentCtx: AgentCtxSurface | undefined, kind: string): void {
    const tools = agentCtx && agentCtx.tools
    if (!tools || typeof tools.restrict !== 'function') return
    const allow = genScopeAllow(kind)
    if (allow.length === 0) return
    try {
      tools.restrict({ allow })
    } catch (err) {
      console.warn('[fs] tools.restrict 降级（工具面未收敛）: ' + String((err as Error | null | undefined)?.message || err))
    }
  }

  // ---- 书库定位（工厂装配，实现见 src/host/book-store.ts）----
  // 解构保持既有函数名，路由与缓存失效调用点无需改动；getRoot 每次取值以跟随 /set-root。
  const {
    freshBookDir, oldBookDir, ensureBookDirAt, ensureBookDir, knownBookRoots,
    bestRootFor, bookTargetFor, invalidateDocCache, cachedBookView,
    projectRootPath, selfHomeEntry,
  } = createBookStore({ getRoot: () => root })

  // 由会话 id 定位其工作目录（session.header.cwd）；无则为 undefined。
  function sessionCwd(sessionId: string | null | undefined): string | undefined {
    if (!sessionId) return undefined
    const sess = sessions && sessions.get ? sessions.get(sessionId) : undefined
    return sess && sess.header && sess.header.cwd
  }


  function json(res: ServerResponse, code: number, data: unknown): void {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(data))
  }
  // 读 POST body：Buffer 数组拼接（避免大 body 字符串反复重分配）；超 10MB 拒绝；
  // req 的 error 事件必须 reject，否则请求中断时 Promise 永不 settle、处理器挂起。
  const BODY_LIMIT = 10 * 1024 * 1024
  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolveBody, rejectBody) => {
      const chunks: Buffer[] = []
      let size = 0
      let settled = false
      req.on('data', (c: Buffer) => {
        if (settled) return
        const buf = Buffer.isBuffer(c) ? c : Buffer.from(c)
        size += buf.length
        if (size > BODY_LIMIT) {
          settled = true
          rejectBody(Object.assign(new Error(ZH.errBodyTooLarge), { statusCode: 413 }))
          if (typeof req.destroy === 'function') req.destroy()
          return
        }
        chunks.push(buf)
      })
      req.on('end', () => { if (!settled) { settled = true; resolveBody(Buffer.concat(chunks).toString('utf8')) } })
      req.on('error', (e: Error) => { if (!settled) { settled = true; rejectBody(e) } })
    })
  }

  // 生成/翻译任务的文档逻辑路径（docRel）：一律用能力描述符的 sub 与 docStem 推导，
  // 与 /tree 下发的 docRel/docSrcRel 同一命名规则（folder → basename，其余 → computeDocStem）。
  function trDocRelFor(t2: BookTarget): string {
    return docRelBookIn(t2.bookRoot.bucket, TRANSLATE_ABILITY.sub, TRANSLATE_ABILITY.docStem(t2))
  }
  function genDocRelFor(kind: string, t2: BookTarget): string {
    // abilityOf 已在上游按 400 排除未知 kind；此处按必然命中的契约取值（无可达的失败分支）。
    const ability = abilityOf(kind) as NonNullable<ReturnType<typeof abilityOf>>
    return docRelBookIn(t2.bookRoot.bucket, ability.sub, ability.docStem(t2))
  }

  // 后台触发一个临时子 agent，用 {folder-doc|file-doc|source-doc} 技能为「rel 这一个文件夹/文件」
  // 生成单篇文档。用 agentLoop.createAgent（免 parent Agent）+ createUserMessage + followup + whenIdle，
  // 完成后重新扫描索引供前端轮询到结果。
  // 子 agent 模型路由：优先继承 initiator agent；浏览器点击经 HTTP 触发属无 initiator 的
  // agentless 调用，必须回退部署默认模型 ctx.agentDefaultModel.currentSelection()，否则
  // {{model}}/{{provider}} 组装段无值、assembly 直接报 `prompt variable "{{model}}" has no value`。
  function resolveAgentOptions(): AgentModelOptions {
    const out: AgentModelOptions = {}
    const agents = ctx.get('agents') as AgentsSurface | undefined
    const initiator = agents && agents.currentInitiator ? agents.currentInitiator() : undefined
    if (initiator && initiator.options) {
      const o = initiator.options
      if (o.provider) out.provider = o.provider
      if (o.model) out.model = o.model
      if (o.reasoningEffort) out.reasoningEffort = o.reasoningEffort
      if (o.maxTokens) out.maxTokens = o.maxTokens
    }
    if (!out.provider || !out.model) {
      const dm = ctx.get('agentDefaultModel') as AgentDefaultModelSurface | undefined
      const sel = dm && dm.currentSelection ? dm.currentSelection() : undefined
      if (sel) {
        if (!out.provider && sel.provider) out.provider = sel.provider
        if (!out.model && sel.model) out.model = sel.model
        if (out.reasoningEffort === undefined && sel.reasoningEffort) out.reasoningEffort = sel.reasoningEffort
      }
    }
    return out
  }

  function setGenTaskStatus(id: string, status: TaskStatus, error?: unknown): void {
    const task = genTasks.get(id)
    if (!task) return
    task.status = status
    if (error != null) task.error = String((error as Error | null | undefined)?.message || (error as string))
    if (status === 'running') task.startedAt = Date.now()
    if (status === 'success' || status === 'error') task.finishedAt = Date.now()
  }

  // ---- 执行器装配（实现见 gen-executor.ts / translate-executor.ts）----
  // 执行器只认能力描述符；能力自己的骨架、校验、提示词都在 src/host/abilities/<name>/ 内。
  const executorDeps = {
    ctx, bookStore: { bookTargetFor, ensureBookDirAt, invalidateDocCache },
    promptLoader: { loadAbilityPrompt },
    issues: { issuesDir, nextIssueNoFromDisk, syncIssueIndex },
    applyGenScope, resolveAgentOptions, setGenTaskStatus,
  }
  const runGenDoc = createGenExecutor(executorDeps)
  const runTranslate = createTranslateExecutor(executorDeps)

  // 书库逻辑文档 rel 严格解析：<层名>/<stem>.md（无桶 = 当前工作区根双位置解析）
  // 或 @<桶名>/<层名>/<stem>.md（带桶 = 跨工作区共享，按桶段定位 + 该项目根旧库回退）。
  // 层名白名单四层、末段为 .md/.markdown 文件名且不含任何路径分隔、桶名经
  // bookBucketValid 校验（防 @.. 穿越）；非法返回 null（调用方按 400 拒绝）。
  function parseBookDocRel(rel: string): ParsedBookDocRel | null {
    const n = normRel(rel)
    const parts = n.split('/')
    const [p0 = '', p1 = '', p2 = ''] = parts
    let bucket: string | null = null
    let sub: string
    let leaf: string
    if (parts.length === 3 && p0.startsWith('@')) {
      bucket = p0.slice(1)
      if (!bookBucketValid(bucket)) return null
      sub = p1
      leaf = p2
    } else if (parts.length === 2) {
      sub = p0
      leaf = p1
    } else return null
    if (!BOOK_REL_LAYERS.includes(sub)) return null
    if (!/\.(md|markdown)$/i.test(leaf)) return null
    if (leaf === '.' || leaf === '..' || /[\\/]/.test(leaf)) return null
    return { bucket, sub, leaf }
  }
  // 在多个候选绝对路径中取第一个存在且为文件的；均不存在返回 null。
  async function firstExistingFile(...paths: string[]): Promise<string | null> {
    for (const p of paths) {
      const st = await fsp.stat(p).catch(() => null)
      if (st && st.isFile()) return p
    }
    return null
  }
  // 读单个文件并输出 JSON（含大小与扩展名）。
  async function serveFile(res: ServerResponse, abs: string): Promise<void> {
    const stat = await fsp.stat(abs).catch(() => null)
    if (!stat || stat.isDirectory()) {
      json(res, 400, { ok: false, error: ZH.errNotAFile })
      return
    }
    if (stat.size > READ_LIMIT) {
      json(res, 400, {
        ok: false,
        error: ZH.errFileTooLarge + String(stat.size) + ZH.errFileTooLargeMid + String(READ_LIMIT) + ZH.errFileTooLargeClose,
      })
      return
    }
    const content = await fsp.readFile(abs, 'utf8')
    const ext = extname(abs).slice(1).toLowerCase()
    json(res, 200, { content, ext, size: stat.size })
    return
  }

  async function handle(req: IncomingMessage, res: ServerResponse, seg: string): Promise<void> {
    try {
      const url = new URL(req.url || '/', 'http://x')
      const query = url.searchParams

      // POST /api/fs/{...}
      if (req.method === 'POST') {
        const body = await readBody(req)
        let payload: FsPayload = {}
        if (body) {
          try {
            payload = JSON.parse(body) as FsPayload
          } catch {
            json(res, 400, { ok: false, error: ZH.errInvalidJsonBody })
            return
          }
        }
        if (seg === 'set-root') {
          // 校验目标路径存在且为目录，避免任意值直接生效、错误延迟到下一次 /tree 才暴露。
          if (payload.path) {
            const st = await fsp.stat(payload.path).catch(() => null)
            if (!st || !st.isDirectory()) {
              json(res, 400, { ok: false, error: ZH.errNotADirectoryWith + payload.path })
              return
            }
            root = payload.path
          }
          await ensureBookDir()
          json(res, 200, { ok: true, root })
          return
        }
        if (seg === 'write') {
          // path 必填（G-1，2026-09-11）：判定与 /read、/translate 的 `path required` 同源。
          // 必须在 resolveIn 之前拦——resolveIn(root, 缺失值) 恰好解析成 root 本身，
          // 而越权检查写作 `abs !== root && !abs.startsWith(root + sep)`，root 自身会被放行。
          const rel = payload.path
          if (typeof rel !== 'string' || rel === '') {
            json(res, 400, { ok: false, error: ZH.errPathRequired })
            return
          }
          const abs = resolveIn(root, rel)
          await fsp.mkdir(dirname(abs), { recursive: true })
          await fsp.writeFile(abs, payload.content || '', 'utf8')
          json(res, 200, { ok: true })
          return
        }
        if (seg === 'mkdir') {
          // 同 /write：path 必填（G-1）；缺失时 mkdir -p 的目标会退化成 root 本身。
          const rel = payload.path
          if (typeof rel !== 'string' || rel === '') {
            json(res, 400, { ok: false, error: ZH.errPathRequired })
            return
          }
          const abs = resolveIn(root, rel)
          await fsp.mkdir(abs, { recursive: true })
          json(res, 200, { ok: true })
          return
        }
        if (seg === 'delete') {
          // 同 /write：path 必填（G-1）。这条最致命——缺失时 abs === root 从越权检查里通过，
          // 紧接着的 rm(recursive, force) 参数就是整个工作区根（实测已复现整根被删）。
          const rel = payload.path
          if (typeof rel !== 'string' || rel === '') {
            json(res, 400, { ok: false, error: ZH.errPathRequired })
            return
          }
          const abs = resolveIn(root, rel)
          // G-1b：即使 path 合法，删除工作区根自身也一律拒绝（'.'、'./'、'sub/..' 都解析回
          // root）。越权检查写作 `abs !== root && !abs.startsWith(root + sep)`，恰好放行 root
          // 自身，管不到这一层——而删除根本身在任何写法下都是全损操作，与「path 是否合法」
          // 是两个层次的问题。
          if (abs === root) {
            json(res, 400, { ok: false, error: ZH.errRefuseDeleteRoot })
            return
          }
          await fsp.rm(abs, { recursive: true, force: true })
          json(res, 200, { ok: true })
          return
        }
        if (seg === 'gen-doc') {
          // 后台触发单篇 folder/file/source 文档生成；立即返回，前端用 taskId 轮询 gen-status 看结果。
          const kind = payload.kind as string
          if (!abilityOf(kind)) {
            json(res, 400, { ok: false, error: ZH.errUnknownGenKindWith + kind })
            return
          }
          const rel = payload.path || '.'
          // md/markdown 类不生成 L2/L3（用户确认）；目录说明不受限。
          if (kind !== 'folder' && isMdPath(rel)) {
            json(res, 400, { ok: false, error: ZH.errGenMd })
            return
          }
          // 预检：目标必须存在。否则子 agent 会白跑一整轮（10 步空转、写台账、烧一份完整
          // token）才由收尾校验置 error——2026-09-10 实测错传路径的三个任务全部如此。
          // L1 额外要求目标是目录：宿主需读其第一层子项渲染目录树，文件目标直接 400。
          const targetStat = await fsp.stat(resolveIn(root, rel)).catch(() => null)
          if (!targetStat) {
            json(res, 400, { ok: false, error: ZH.errTargetMissing })
            return
          }
          if (kind === 'folder' && !targetStat.isDirectory()) {
            json(res, 400, { ok: false, error: ZH.errTargetNotDir })
            return
          }
          // L2/L3 的语义是「这一个文件」：目录目标直接 400，不空起子会话。
          if (kind !== 'folder' && !targetStat.isFile()) {
            json(res, 400, { ok: false, error: ZH.errTargetNotFile })
            return
          }
          // 去重：同 kind+rel 已有 pending/running 任务则复用，避免连点起多个子 agent 重复生成。
          for (const t of genTasks.values()) {
            if (t.kind === kind && t.rel === rel && (t.status === 'pending' || t.status === 'running')) {
              json(res, 200, { ok: true, started: true, taskId: t.id, reused: true })
              return
            }
          }
          sweepGenTasks()
          const taskId = 'fsgen-' + randomUUID()
          // 先同步占位（docRel 空）再异步补算：去重与占位之间不得有 await，
          // 否则并发重复请求会双双穿过去重各建任务。docRel 补算失败则删占位并抛错。
          const task: GenTask = {
            id: taskId, kind, rel,
            docRel: '',
            status: 'pending',
            error: null,
            startedAt: null,
            finishedAt: null,
          }
          genTasks.set(taskId, task)
          try {
            task.docRel = genDocRelFor(kind, await bookTargetFor(rel))
          } catch (err) {
            genTasks.delete(taskId)
            throw err
          }
          setImmediate(() => { runGenDoc(rel, kind, taskId).catch((err: unknown) => { setGenTaskStatus(taskId, 'error', err) }) })
          json(res, 200, { ok: true, started: true, taskId })
          return
        }
        if (seg === 'translate') {
          // 后台触发项目内一篇 md 文档的中文翻译；立即返回，前端用 taskId 轮询 gen-status。
          const rel = payload.path
          if (!rel) {
            json(res, 400, { ok: false, error: ZH.errPathRequired })
            return
          }
          if (!isMdPath(rel)) {
            json(res, 400, { ok: false, error: ZH.errTranslateOnlyMd })
            return
          }
          // 用户确认：md 对象是项目文件内的，书库内（.book/）文档不翻译。
          if (isBookPath(rel)) {
            json(res, 400, { ok: false, error: ZH.errBookNoTranslate })
            return
          }
          // 预检：同 /gen-doc —— 目标不存在就别起子会话。
          if (!(await fsp.stat(resolveIn(root, rel)).catch(() => null))) {
            json(res, 400, { ok: false, error: ZH.errTargetMissing })
            return
          }
          // 去重：同 rel 已有 pending/running 翻译任务则复用。
          for (const t of genTasks.values()) {
            if (t.kind === 'translate' && t.rel === rel && (t.status === 'pending' || t.status === 'running')) {
              json(res, 200, { ok: true, started: true, taskId: t.id, reused: true })
              return
            }
          }
          sweepGenTasks()
          const taskId = 'fstr-' + randomUUID()
          // 同 /gen-doc：先同步占位再异步补 docRel，保证去重窗口无 await。
          const task: GenTask = {
            id: taskId, kind: 'translate', rel,
            docRel: '',
            status: 'pending',
            error: null,
            startedAt: null,
            finishedAt: null,
          }
          genTasks.set(taskId, task)
          let docRel = ''
          try {
            docRel = trDocRelFor(await bookTargetFor(rel))
            task.docRel = docRel
          } catch (err) {
            genTasks.delete(taskId)
            throw err
          }
          setImmediate(() => { runTranslate(rel, taskId).catch((err: unknown) => { setGenTaskStatus(taskId, 'error', err) }) })
          json(res, 200, { ok: true, started: true, taskId, docRel })
          return
        }
        json(res, 404, { ok: false, error: ZH.errUnknownRouteWith + seg })
        return
      }

      // GET /api/fs/{...}
      if (seg === 'root') {
        json(res, 200, { root })
        return
      }
      if (seg === 'session') {
        // ?id= 当前会话 id；定位其工作目录(header.cwd)，作为默认根。
        const sid = query.get('id')
        const cwd = sessionCwd(sid)
        json(res, 200, {
          sessionId: sid || null,
          cwd: cwd || null,
          root,
        })
        return
      }
      if (seg === 'gen-status') {
        // ?id=<taskId> 返回单个任务；无 id 返回最近任务列表（倒序）。
        const id = query.get('id')
        if (id) {
          const task = genTasks.get(id)
          if (task) { json(res, 200, { ok: true, task }); return }
          json(res, 200, { ok: false, error: ZH.errTaskNotFound, task: null })
          return
        }
        const tasks = [...genTasks.values()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 20)
        json(res, 200, { ok: true, tasks })
        return
      }
      if (seg === 'tree') {
        // ?path= 相对 root 的目录；默认返回 root 下条目，目录优先 + 本地化排序。
        const rel = query.get('path') || '.'
        const abs = resolveIn(root, rel)
        const view = await cachedBookView()
        // 归属兜底条目按需现算：view 由已知根注册表派生（缓存 5s），可能与视图缓存（1.5s）
        // 在切根后的窗口期不同步——此时 view 不含当前根，bestRootFor 对根下节点也返回 null。
        const self = projectRootPath()
        // 当前根的归属条目：视图含它（按 projectRoot 匹配）就用视图里的条目，否则现算。
        // 与源的 `view.find(...) || fallbackHome` 两段同义——两者互补（视图含当前根则 find 必
        // 命中、不含则现算），合成一个条目后取值与 `selfHomeEntry()` 的调用次数都与源一致。
        const selfHome: BookViewEntry = view.find(v => v.projectRoot === self) ?? await selfHomeEntry()
        const entries = await fsp.readdir(abs, { withFileTypes: true })
        const list = entries.map((e): TreeNode => {
          const nodePath = rel === '.' ? e.name : rel.replace(/\/$/, '') + '/' + e.name
          const nodeAbs = resolve(root, nodePath)
          // 跨工作区共享：节点归属「包含它的最深已知项目根」的桶（当前根恒在视图中，必有归属）；
          // docRel 带桶段（@<桶名>/<层名>/<stem>.md），前端不透明透传、/read 按桶段定位。
          // 归属兜底与源同序：bestRootFor（遍历的 roots 即视图条目，返回的就是归属条目）→ 当前根条目。
          const home: BookViewEntry = bestRootFor(nodeAbs, view) || selfHome
          if (e.isDirectory()) {
            // 目录概览文档名 = 目标文件夹 basename（folder-doc 命名；与根视角无关）。
            const stem = e.name
            const hasDoc = home.sets['目录概览'].has(stem)
            return {
              name: e.name, type: 'directory', path: nodePath,
              hasDoc, hasDocSrc: false, hasDocTr: false,
              docRel: hasDoc ? docRelBookIn(home.bucket, '目录概览', stem) : '',
              docSrcRel: '',
              docTrRel: '',
            }
          }
          // 文件摘要/源码注解：文件名前缀 = 归属项目根视角的完整相对路径（file-doc/source-doc 命名）。
          const relHome = normRel(nodeAbs.slice(home.projectRoot.length)) || '.'
          const stem = computeDocStem(relToSrcKey(relHome, home.projectRoot))
          const hasDoc = home.sets['文件摘要'].has(stem)
          const hasDocSrc = home.sets['源码注解'].has(stem)
          // 文章翻译：仅项目内 md 文档可翻译，文件名前缀同一命名规则（translate-doc）。
          const hasDocTr = home.sets['文章翻译'].has(stem)
          return {
            name: e.name, type: 'file', path: nodePath,
            hasDoc, hasDocSrc, hasDocTr,
            docRel: hasDoc ? docRelBookIn(home.bucket, '文件摘要', stem) : '',
            docSrcRel: hasDocSrc ? docRelBookIn(home.bucket, '源码注解', stem) : '',
            docTrRel: hasDocTr ? docRelBookIn(home.bucket, '文章翻译', stem) : '',
          }
        })
        list.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name, 'zh-CN')
        })
        json(res, 200, { path: rel, list })
        return
      }
      if (seg === 'read') {
        const rel = query.get('path')
        if (!rel) {
          json(res, 400, { ok: false, error: ZH.errPathRequired })
          return
        }
        // 书库逻辑文档：白名单解析。无桶形状（<层名>/<stem>.md）→ 当前工作区根双位置
        // （先新桶后旧库，兼容旧会话）；带桶形状（@<桶名>/<层名>/<stem>.md）→ 按桶段定位，
        // 并回退该项目根的旧库（注册表查不到桶映射时只读新桶）。
        // 层名白名单四层、stem 经 resolveIn 语义校验防 ../；黑名单外一律 400/404。
        // 未命中书库形状 → 按普通项目内文件解析（维持 resolveIn(root, rel) 原语义）。
        if (isBookDocRel(rel)) {
          const parsed = parseBookDocRel(rel)
          if (!parsed) {
            json(res, 400, { ok: false, error: ZH.errInvalidBookDocRelWith + rel })
            return
          }
          let candidates: string[]
          if (parsed.bucket) {
            candidates = [resolveIn(join(booksRoot(), parsed.bucket), parsed.sub + '/' + parsed.leaf)]
            const home = (await knownBookRoots()).find(r => r.bucket === parsed.bucket)
            if (home) candidates.push(resolveIn(legacyBookDir(home.projectRoot), parsed.sub + '/' + parsed.leaf))
          } else {
            candidates = [
              resolveIn(freshBookDir(), parsed.sub + '/' + parsed.leaf),
              resolveIn(oldBookDir(), parsed.sub + '/' + parsed.leaf),
            ]
          }
          const abs = await firstExistingFile(...candidates)
          if (!abs) {
            json(res, 404, { ok: false, error: ZH.errNotAFileWith + rel })
            return
          }
          await serveFile(res, abs)
          return
        }
        const abs = resolveIn(root, rel)
        const stat = await fsp.stat(abs).catch(() => null)
        if (!stat || stat.isDirectory()) {
          json(res, 400, { ok: false, error: ZH.errNotAFile })
          return
        }
        if (stat.size > READ_LIMIT) {
          json(res, 400, {
            ok: false,
            error: ZH.errFileTooLarge + String(stat.size) + ZH.errFileTooLargeMid + String(READ_LIMIT) + ZH.errFileTooLargeClose,
          })
          return
        }
        const content = await fsp.readFile(abs, 'utf8')
        const ext = extname(abs).slice(1).toLowerCase()
        json(res, 200, { content, ext, size: stat.size })
        return
      }
      json(res, 404, { ok: false, error: ZH.errUnknownRouteWith + seg })
      return
    } catch (err) {
      // 业务错误可带 statusCode（如 readBody 的 413）；默认 500。
      const code = (err as { statusCode?: number } | null | undefined)?.statusCode || 500
      json(res, code, { ok: false, error: String((err as Error | null | undefined)?.message || err) })
      return
    }
  }

  // 前缀路由：匹配 /api/fs 及子路径
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/api/fs',
    handler: (req, res) => {
      const url = new URL(req.url || '/', 'http://x')
      const rest = url.pathname.slice('/api/fs'.length)
      const seg = rest.replace(/^\/+/, '')
      void handle(req, res, seg)
    },
  }), 'fs api routes')

  // 测试句柄，生产不挂：仅 NODE_ENV==='test' 暴露内部 handle / 任务状态，
  // 避免生产 ctx 挂带状态的可变句柄。
  if (process.env.NODE_ENV === 'test') {
    ctx.__fsTest = {
      handle,
      genTasks,
      sweepGenTasks,
      getRoot: () => root,
      setRoot: (p) => { root = p },
      // 本次改动新增：统一工作目录与书库桶发现（供装配/边界测试直接断言）。
      genCwdAbs,
      knownBookRoots,
    }
  }
}
