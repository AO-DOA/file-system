/**
 * src/host/index.ts（P3-A 路由层 + P3-B 任务状态机）集成式 spec。
 *
 * 迁移自迁移源 `tests/host-routes.test.js`（638 行 / 21 例，node:test）与
 * `tests/task-timeout.test.js`（121 行 / 2 例）—— 用例逐条映射，标题后标注源文件行号；
 * 另按 `docs/baseline/host.md` §A（路由全表）与 §B（任务状态机）补齐源测试未覆盖的
 * 分支：`/root`、`/session`、`/mkdir`、`/delete`、body 10MB→413、去重键规范化、
 * sweep 的 TTL/容量淘汰、`fsgen-`/`fstr-` 两个 taskId 前缀、`__fsTest` 句柄成员。
 *
 * 被测面是**对外契约**，不是内部实现：断言只读 HTTP 状态码、JSON 出参、任务记录叶子
 * 字段与磁盘上的真实文件；`ctx.__fsTest` 只是观察窗口（NODE_ENV==='test' 才挂载）。
 *
 * 四条纪律（1–2 是源仓踩过的坑，逐条保留其语义；3–4 是 2026-09-11 的 G-1/G-1b 修复新增）：
 *   1. **严禁固定 sleep**：后台任务用 `setImmediate` 起、宿主立即回 200，固定等待在并发
 *      负载下会漏判（源仓缺陷 C：6 并发 6/6 失败）。一律轮询可观测信号——`waitTaskRegistered`
 *      （占位记录）、`waitTaskRunning`、`waitTaskSettled`（直读 genTasks）、`waitSettled`
 *      （走真实 /gen-status）；10s 上限只用于防挂死，不作为同步手段。
 *   2. **路径隔离**：所有临时根用 `mkdtemp(join(tmpdir(), …))`（禁用 `Date.now()` 拼可预测
 *      路径：vitest 并行下会撞）；`DSH_HOME` 与 `DSH_FS_ISSUES_DIR` 指向进程级临时目录，
 *      后者防宿主收尾的 `syncIssueIndex()` read-modify-write 改写受版本控制的 issues/README.md。
 *   3. **写路由 path 必填（G-1，2026-09-11）**：`/write`、`/mkdir`、`/delete` 缺失 `path`
 *      一律 400 `path required`（判据与既有 `/read`、`/translate` 同源）。源插件「锁定无校验」
 *      的 D-10 用例已按本次修复改写：`/delete` 缺 path 曾把 `abs` 解析成工作区根并整根 `rm -rf`。
 *   4. **`/delete` 拒绝根自身（G-1b，2026-09-11）**：`.`, `./`, `sub/..` 都解析回 root，而越权
 *      检查 `abs !== root` 恰好放行根自身 → 该路由另设守卫，一律 400
 *      `refusing to delete the workspace root`。`/mkdir`、`/write` 不加此守卫：它们对根操作
 *      不毁数据（`mkdir root` 幂等 / `write root` 报 EISDIR 500），加了反而改变既有语义。
 */
process.env.NODE_ENV ??= 'test'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { apply } from '../src/host/index.ts'
import { GEN_CWD_SEG, READ_LIMIT, booksRoot, projectKey } from '../src/host/fs-utils.ts'
import type { BookRootEntry } from '../src/host/book-store.ts'
import { ZH } from '../src/shared/locale.ts'

// 执行器成功路径要 `await import('@deepseek-ai/dsh-llm')`（peer 依赖）。本仓 node_modules 里
// 没有它，能否解析取决于上层目录的安装形态（实测可经 DSHworkPace/node_modules 兜底，但不该
// 让路由层 spec 依赖这一点）：桩掉 createUserMessage，两种形态下成功路径都可达。
vi.mock('@deepseek-ai/dsh-llm', () => ({
  createUserMessage: (message: unknown): unknown => message,
}))

// ---- 进程级隔离（必须在任何 apply() 之前生效）----

const previousHome = process.env.DSH_HOME
const previousIssuesDir = process.env.DSH_FS_ISSUES_DIR
// 书库根 $DSH_HOME/books 指向进程级临时目录，避免测试读写真实 ~/.dsh/books。
const testHome = await mkdtemp(join(tmpdir(), 'fs-p3-routes-home-'))
process.env.DSH_HOME = testHome
// 问题台账目录同样隔离：宿主收尾会调 syncIssueIndex()（read-modify-write），
// 不隔离就会改写受版本控制的 issues/README.md（回归口径见缺陷 D）。
process.env.DSH_FS_ISSUES_DIR = join(testHome, 'issues')

afterAll(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  if (previousIssuesDir === undefined) delete process.env.DSH_FS_ISSUES_DIR
  else process.env.DSH_FS_ISSUES_DIR = previousIssuesDir
  await rm(testHome, { recursive: true, force: true })
})

// ---- 用例级临时工作区根 ----

const roots: string[] = []

/**
 * 建一个临时工作区根（每用例独立）。
 * @param prefix - mkdtemp 前缀，区分用例用途便于残留排查。
 * @returns 新建的临时目录绝对路径。
 */
async function newRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const dir of roots.splice(0)) await rm(dir, { recursive: true, force: true })
})

// ---- 类型：与 index.ts 的对外形状逐字同形（spec 只读叶子字段）----

/** 任务 4 态（pending → running → success | error，无 cancelled）。 */
type TaskStatus = 'pending' | 'running' | 'success' | 'error'

/** genTasks 记录（/gen-status 原样下发前端的形状）。 */
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

/** ctx.__fsTest：NODE_ENV==='test' 才挂载的观察窗口。 */
interface FsTestHandle {
  handle(req: IncomingMessage, res: ServerResponse, seg: string): Promise<void>
  genTasks: Map<string, GenTask>
  sweepGenTasks(): void
  getRoot(): string
  setRoot(p: string): void
  genCwdAbs(): string
  knownBookRoots(): Promise<BookRootEntry[]>
}

/** index.ts 注册到 webServer 上的路由（prefix /api/fs）。 */
interface RegisteredRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>
}

interface WebServerStub {
  routes: RegisteredRoute[]
  register(route: RegisteredRoute): () => void
}

interface SessionsStub {
  get?(sessionId: string): { header?: { cwd?: string } } | undefined
}

/** apply 收到的 ctx 最小面（与 index.ts 的 FsHostContext 结构兼容）。 */
interface TestCtx {
  webServer: WebServerStub
  sandboxPolicy?: { workspaceRoot?: string }
  sessions?: SessionsStub
  /** ctx.get 的数据源：用例按分支改写（agentLoop / agents / agentDefaultModel / agentPresets）。 */
  services: Record<string, unknown>
  get(name: string): unknown
  effect(callback: () => unknown, label?: string): unknown
  __fsTest?: FsTestHandle
}

/** 出参形状（断言前的最小投射；缺字段一律 undefined，避免把形状差异吞掉）。 */
interface StartedBody {
  ok?: boolean
  started?: boolean
  taskId?: string
  reused?: boolean
  docRel?: string
}

interface ErrorBody {
  ok?: boolean
  error?: string
}

interface TaskBody {
  ok?: boolean
  task?: GenTask | null
  tasks?: GenTask[]
  error?: string
}

interface TreeNode {
  name: string
  type: string
  path: string
  hasDoc: boolean
  hasDocSrc: boolean
  hasDocTr: boolean
  docRel: string
  docSrcRel: string
  docTrRel: string
}

interface TreeBody {
  path?: string
  list?: TreeNode[]
}

interface ReadBody {
  content?: string
  ext?: string
  size?: number
}

/** 假请求：EventsEmitter + method/url；`destroy` 可选（readBody 只在它是函数时调用）。 */
interface FakeReq extends EventEmitter {
  method: string
  url: string
  destroy?: () => void
}

/** 假响应：记状态码/头/body，并用 `ended` 暴露 end() 时刻。 */
interface FakeRes {
  statusCode: number
  headers: Record<string, string>
  body: string
  ended: Promise<void>
  setHeader(name: string, value: string): void
  end(data?: string): void
}

interface CallResult {
  status: number
  json: unknown
  body: string
}

// ---- 装置 ----

/**
 * 建一个最小 ctx 桩（结构化最小面，无需真实 cordis Context）。
 * @param root - 传给 sandboxPolicy.workspaceRoot 的默认读写根；省略则该服务缺失。
 * @returns ctx 桩；`services` 可按用例改写 ctx.get 的返回值。
 */
function createCtx(root?: string): TestCtx {
  const routes: RegisteredRoute[] = []
  const services: Record<string, unknown> = {}
  const ctx: TestCtx = {
    webServer: {
      routes,
      register(route) {
        routes.push(route)
        return () => undefined
      },
    },
    services,
    get(name) {
      return services[name]
    },
    effect(callback) {
      return callback()
    },
  }
  if (root !== undefined) ctx.sandboxPolicy = { workspaceRoot: root }
  return ctx
}

/**
 * 取测试句柄；未挂载即说明 NODE_ENV 不是 test（显式失败，不用非空断言）。
 * @param ctx - apply 过的 ctx 桩。
 * @returns __fsTest 句柄。
 */
function fsTestOf(ctx: TestCtx): FsTestHandle {
  const handle = ctx.__fsTest
  if (handle === undefined) throw new Error('__fsTest 未挂载：NODE_ENV 不是 test')
  return handle
}

function createRes(): FakeRes {
  let markEnded: () => void = () => undefined
  const ended = new Promise<void>((resolve) => {
    markEnded = resolve
  })
  const res: FakeRes = {
    statusCode: 0,
    headers: {},
    body: '',
    ended,
    setHeader(name, value) {
      res.headers[name] = value
    },
    end(data) {
      if (typeof data === 'string') res.body = data
      markEnded()
    },
  }
  return res
}

/**
 * 建一个请求桩：body 在 setImmediate 里异步发出（模拟真实 HTTP body）。
 * @param method - HTTP 方法。
 * @param url - 请求 URL（含 query）。
 * @param body - 字符串原样发送（构造非法 JSON 用），对象序列化后发送。
 * @returns 假请求。
 */
function createReq(method: string, url: string, body?: string | Record<string, unknown>): FakeReq {
  const req = new EventEmitter() as FakeReq
  req.method = method
  req.url = url
  const chunks: Array<string | Buffer> = []
  if (body !== undefined) chunks.push(typeof body === 'string' ? body : JSON.stringify(body))
  setImmediate(() => {
    for (const chunk of chunks) req.emit('data', chunk)
    req.emit('end')
  })
  return req
}

/** 逐片自控的请求：用于 413、迟到分片、error 事件等 readBody 分支。 */
function createRawReq(method: string, url: string): FakeReq {
  const req = new EventEmitter() as FakeReq
  req.method = method
  req.url = url
  return req
}

/**
 * 解析响应体；非 JSON 一律 null（让断言落在 status/body 上，而不是在解析处抛错）。
 * @param body - 响应体原文。
 * @returns 解析结果或 null。
 */
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    // 保留 null：调用方的断言会给出更可读的失败信息。
    return null
  }
}

/**
 * 直接走 ctx.__fsTest.handle 发一次请求（seg 由调用方给，等价于 prefix 路由解析后的值）。
 * @param fsTest - 测试句柄。
 * @param req - 请求桩。
 * @param seg - 路由段（如 'tree'、'gen-doc'）。
 * @returns 状态码与解析后的响应体。
 */
async function call(fsTest: FsTestHandle, req: FakeReq, seg: string): Promise<CallResult> {
  const res = createRes()
  await fsTest.handle(req as unknown as IncomingMessage, res as unknown as ServerResponse, seg)
  return { status: res.statusCode, json: parseJson(res.body), body: res.body }
}

/**
 * 经真实注册的 prefix handler 发一次请求：覆盖 index.ts 里 seg 解析与 `void handle(...)` 的装配闭包。
 * handler 内部不 await handle，故只能等 res.end()。
 * @param route - webServer.register 收到的路由。
 * @param req - 请求桩。
 * @returns 状态码与解析后的响应体。
 */
async function dispatch(route: RegisteredRoute, req: FakeReq): Promise<CallResult> {
  const res = createRes()
  await route.handler(req as unknown as IncomingMessage, res as unknown as ServerResponse)
  await res.ended
  return { status: res.statusCode, json: parseJson(res.body), body: res.body }
}

// ---- 时序辅助：等可观测信号，不用固定 sleep ----

const POLL_STEP_MS = 2
const POLL_TIMEOUT_MS = 10_000

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, POLL_STEP_MS)
  })
}

/**
 * 等某个 rel 的任务占位（进入 pending/running）：去重只认 genTasks 里的占位记录。
 * @param genTasks - 测试句柄暴露的任务表。
 * @param rel - 目标相对路径。
 * @returns 命中的占位记录。
 */
async function waitTaskRegistered(genTasks: Map<string, GenTask>, rel: string): Promise<GenTask> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  for (;;) {
    for (const task of genTasks.values()) {
      if (task.rel === rel && (task.status === 'pending' || task.status === 'running')) return task
    }
    if (Date.now() > deadline) throw new Error('任务未占位: ' + rel)
    await tick()
  }
}

/**
 * 等任务进入 running（宿主在 createAgent 成功之后置该态）。
 * @param genTasks - 任务表。
 * @param taskId - 任务 id。
 * @returns 处于 running 的记录。
 */
async function waitTaskRunning(genTasks: Map<string, GenTask>, taskId: string): Promise<GenTask> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  for (;;) {
    const task = genTasks.get(taskId)
    if (task !== undefined && task.status === 'running') return task
    if (Date.now() > deadline) throw new Error('任务未在 ' + String(POLL_TIMEOUT_MS) + 'ms 内进入 running: ' + taskId)
    await tick()
  }
}

/**
 * 等后台任务收尾：直接读 genTasks（Map），轮询到离开 pending/running。
 * @param genTasks - 任务表。
 * @param taskId - 任务 id。
 * @returns 终态记录（success 或 error）。
 */
async function waitTaskSettled(genTasks: Map<string, GenTask>, taskId: string): Promise<GenTask> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  for (;;) {
    const task = genTasks.get(taskId)
    if (task !== undefined && task.status !== 'pending' && task.status !== 'running') return task
    if (Date.now() > deadline) throw new Error('任务未在 ' + String(POLL_TIMEOUT_MS) + 'ms 内收尾: ' + taskId)
    await tick()
  }
}

/**
 * 等后台任务收尾：走真实 /gen-status 路由（与前端轮询同一条通道）。
 * @param fsTest - 测试句柄。
 * @param taskId - 任务 id。
 * @returns 终态记录。
 */
async function waitSettled(fsTest: FsTestHandle, taskId: string): Promise<GenTask> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  for (;;) {
    const out = await call(fsTest, createReq('GET', '/api/fs/gen-status?id=' + encodeURIComponent(taskId)), 'gen-status')
    const task = (out.json as TaskBody).task
    if (task !== undefined && task !== null && task.status !== 'pending' && task.status !== 'running') return task
    if (Date.now() > deadline) throw new Error('任务未在 ' + String(POLL_TIMEOUT_MS) + 'ms 内收尾: ' + taskId)
    await tick()
  }
}

/**
 * 轮询等到某个可观测条件成立（用于"任务永不 settle"场景下的装配断言）。
 * @param predicate - 条件。
 * @param what - 超时信息（描述在等什么）。
 */
async function waitFor(predicate: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('未在 ' + String(POLL_TIMEOUT_MS) + 'ms 内等到: ' + what)
    await tick()
  }
}

/**
 * 造一条任务记录（注入 genTasks 用）。
 * @param id - 任务 id。
 * @param over - 覆盖字段（其余取中性默认值）。
 * @returns 完整记录。
 */
function makeTask(id: string, over: Partial<GenTask> = {}): GenTask {
  return {
    id,
    kind: 'folder',
    rel: 'src',
    docRel: '',
    status: 'pending',
    error: null,
    startedAt: null,
    finishedAt: null,
    ...over,
  }
}

/** 从 /tree 出参里取一个节点（缺失即显式失败）。 */
function nodeOf(body: TreeBody, name: string): TreeNode {
  const node = (body.list ?? []).find(item => item.name === name)
  if (node === undefined) throw new Error('tree 未返回节点: ' + name)
  return node
}

// ---- 假 agentLoop：任务状态机与装配面的驱动 ----

interface AgentModelOptions {
  provider?: string
  model?: string
  reasoningEffort?: string
  maxTokens?: number
}

/** 执行器传给 createAgent 的入参形状（本 spec 只关心 meta/agentOptions/setup）。 */
interface FakeAgentOptions {
  sessionId?: string
  meta?: { cwd?: string; agentPreset?: string }
  agentOptions?: AgentModelOptions
  setup?(agentCtx: unknown): void | Promise<void>
}

interface FakeAgentHandle {
  agent: { followup(message: unknown): void; whenIdle(): Promise<void> }
  dispose(): Promise<void>
}

interface FakeAgentLoop {
  calls: FakeAgentOptions[]
  releaseCreate(): void
  releaseIdle(): void
  createAgent(ctx: unknown, options: FakeAgentOptions): Promise<FakeAgentHandle>
}

interface FakeLoopOptions {
  /** whenIdle 行为：never=永不 settle（任务停在 running，用于去重）；gate=手动放行；默认立即返回。 */
  idle?: 'never' | 'gate'
  /** true 时 createAgent 先停在闸门：任务保持 pending，可确定性观察占位态。 */
  holdCreate?: boolean
  /** 传给执行器 setup 的 agentCtx；默认 undefined（覆盖 applyGenScope 的早退支）。 */
  setupArg?: unknown
}

/**
 * 造一个假 agentLoop（不真起子会话）。
 * @param options - 闸门与 setup 入参。
 * @returns 假服务；`calls` 记录每次 createAgent 的入参。
 */
function createFakeAgentLoop(options: FakeLoopOptions = {}): FakeAgentLoop {
  const calls: FakeAgentOptions[] = []
  let openCreate: () => void = () => undefined
  let openIdle: () => void = () => undefined
  const createGate = new Promise<void>((resolve) => {
    openCreate = resolve
  })
  const idleGate = new Promise<void>((resolve) => {
    openIdle = resolve
  })
  return {
    calls,
    releaseCreate() {
      openCreate()
    },
    releaseIdle() {
      openIdle()
    },
    async createAgent(_ctx, agentOptions) {
      if (options.holdCreate === true) await createGate
      calls.push(agentOptions)
      if (typeof agentOptions.setup === 'function') await agentOptions.setup(options.setupArg)
      return {
        agent: {
          followup() {
            // 提示词注入不在本 spec 的断言范围（见 tests/gen-executor.spec.ts）。
          },
          async whenIdle() {
            if (options.idle === 'never') await new Promise<void>(() => undefined)
            else if (options.idle === 'gate') await idleGate
          },
        },
        async dispose() {
          // 释放无副作用：本 spec 不断言 dispose 通道。
        },
      }
    },
  }
}

// ---- 用例 ----

describe('apply 装配与 __fsTest 句柄', () => {
  it('apply 暴露测试句柄，root 默认取 sandboxPolicy.workspaceRoot（源 host-routes.test.js:89）', async () => {
    const root = await newRoot('fs-p3-apply-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)
    expect(fsTest.getRoot()).toBe(root)
    expect(ctx.webServer.routes).toHaveLength(1)
  })

  it('apply 注册 /api/fs 前缀路由：真实 handler 逐字解析 seg 并分派（源 real-composition.test.js:93 的进程内等价）', async () => {
    const root = await newRoot('fs-p3-prefix-')
    await mkdir(join(root, 'sub'), { recursive: true })
    const ctx = createCtx(root)
    apply(ctx)
    const route = ctx.webServer.routes[0]
    if (route === undefined) throw new Error('/api/fs 前缀路由未注册')
    expect(route.kind).toBe('prefix')
    expect(route.path).toBe('/api/fs')

    const rootOut = await dispatch(route, createReq('GET', '/api/fs/root'))
    expect(rootOut.status).toBe(200)
    expect(rootOut.json).toEqual({ root })

    // 连续 '/' 只折一层：'/api/fs//tree' → seg 'tree'
    const treeOut = await dispatch(route, createReq('GET', '/api/fs//tree?path=sub'))
    expect(treeOut.status).toBe(200)
    expect((treeOut.json as TreeBody).path).toBe('sub')

    // 空前缀 → seg '' → GET 兜底 404
    const emptyOut = await dispatch(route, createReq('GET', '/api/fs/'))
    expect(emptyOut.status).toBe(404)
    expect(emptyOut.json).toEqual({ ok: false, error: 'unknown route: ' })

    // POST 兜底 404（同样先读 body）
    const postOut = await dispatch(route, createReq('POST', '/api/fs/nope', {}))
    expect(postOut.status).toBe(404)
    expect(postOut.json).toEqual({ ok: false, error: 'unknown route: nope' })
  })

  it('apply 无 sandboxPolicy 时 root 回退 process.cwd()（源 index.ts:145 的兜底支）', () => {
    const ctx = createCtx()
    apply(ctx)
    expect(fsTestOf(ctx).getRoot()).toBe(process.cwd())
  })

  it('NODE_ENV 非 test 时不挂 __fsTest，路由照常注册（源 real-composition.test.js:116 的生产支）', () => {
    const ctx = createCtx()
    vi.stubEnv('NODE_ENV', 'production')
    try {
      apply(ctx)
      expect(ctx.__fsTest).toBeUndefined()
      expect(ctx.webServer.routes).toHaveLength(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('__fsTest 暴露统一工作目录与书库桶发现，setRoot 立即影响 getRoot（源 gen-scope.test.js:480 的进程内等价）', async () => {
    const root = await newRoot('fs-p3-handle-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    expect(fsTest.genCwdAbs()).toBe(join(booksRoot(), GEN_CWD_SEG))
    const known = await fsTest.knownBookRoots()
    // 当前根隐式并入注册表（即使桶尚未注册）。
    expect(known.some(entry => entry.projectRoot === root)).toBe(true)

    const other = await newRoot('fs-p3-handle-next-')
    fsTest.setRoot(other)
    expect(fsTest.getRoot()).toBe(other)
  })
})

describe('GET /root 与 GET /session', () => {
  it('GET /root 只回 {root}（无 ok 字段），set-root 后跟随新根（源 §A 的出参形状）', async () => {
    const root = await newRoot('fs-p3-root-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('GET', '/api/fs/root'), 'root')
    expect(out.status).toBe(200)
    // 反直觉契约：/root 与 /tree 的响应没有 ok 字段（逐字锁定形状）
    expect(out.json).toEqual({ root })

    // req.url 缺失时兜底 '/'（源 index.ts:352 的 `req.url || '/'`）：/root 不读 query，正好覆盖该支
    const noUrl = await call(fsTest, createReq('GET', ''), 'root')
    expect(noUrl.json).toEqual({ root })

    const target = await newRoot('fs-p3-root-next-')
    const set = await call(fsTest, createReq('POST', '/api/fs/set-root', { path: target }), 'set-root')
    expect(set.status).toBe(200)
    expect(set.json).toEqual({ ok: true, root: target })

    const after = await call(fsTest, createReq('GET', '/api/fs/root'), 'root')
    expect(after.json).toEqual({ root: target })
  })

  it('GET /session 四种会话形态：无 id / 会话不存在 / 有 header.cwd / 会话无 header（源 §A，源测试未覆盖）', async () => {
    const root = await newRoot('fs-p3-session-')
    const ctx = createCtx(root)
    ctx.sessions = {
      get(sessionId) {
        if (sessionId === 's1') return { header: { cwd: '/tmp/ws-one' } }
        if (sessionId === 's2') return {}
        return undefined
      },
    }
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const none = await call(fsTest, createReq('GET', '/api/fs/session'), 'session')
    expect(none.status).toBe(200)
    expect(none.json).toEqual({ sessionId: null, cwd: null, root })

    const unknown = await call(fsTest, createReq('GET', '/api/fs/session?id=s9'), 'session')
    expect(unknown.json).toEqual({ sessionId: 's9', cwd: null, root })

    const withCwd = await call(fsTest, createReq('GET', '/api/fs/session?id=s1'), 'session')
    expect(withCwd.json).toEqual({ sessionId: 's1', cwd: '/tmp/ws-one', root })

    const noHeader = await call(fsTest, createReq('GET', '/api/fs/session?id=s2'), 'session')
    expect(noHeader.json).toEqual({ sessionId: 's2', cwd: null, root })
  })

  it('GET /session 在 sessions 服务缺失或缺 get 时不崩，cwd 为 null（源 index.ts:203-207 的防御支）', async () => {
    const root = await newRoot('fs-p3-session-nosrv-')

    const noService = createCtx(root)
    // createCtx 默认不设 sessions：覆盖 `sessions && ...` 的左操作数
    apply(noService)
    const out1 = await call(fsTestOf(noService), createReq('GET', '/api/fs/session?id=s1'), 'session')
    expect(out1.json).toEqual({ sessionId: 's1', cwd: null, root })

    const noGet = createCtx(root)
    noGet.sessions = {}
    apply(noGet)
    const out2 = await call(fsTestOf(noGet), createReq('GET', '/api/fs/session?id=s1'), 'session')
    expect(out2.json).toEqual({ sessionId: 's1', cwd: null, root })
  })
})

describe('GET /tree', () => {
  it('tree 列出目录与文件：目录优先、只返回当前层（源 :97）', async () => {
    const root = await newRoot('fs-p3-tree-')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src', 'a.js'), 'const a = 1\n', 'utf8')
    await writeFile(join(root, 'zzz.txt'), 'z\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('GET', '/api/fs/tree?path=.'), 'tree')
    expect(out.status).toBe(200)
    const body = out.json as TreeBody
    expect(body.path).toBe('.')
    // 目录优先于文件；同类型按 zh-CN 本地化排序
    expect((body.list ?? []).map(item => item.name)).toEqual(['src', 'zzz.txt'])
    // tree 只返回当前层，不递归
    expect((body.list ?? []).some(item => item.name === 'src/a.js')).toBe(false)
    const srcItem = nodeOf(body, 'src')
    expect(srcItem.type).toBe('directory')
    expect(srcItem.path).toBe('src')

    // 非 '.' 时节点 path 为「父路径 + / + 名字」
    const subOut = await call(fsTest, createReq('GET', '/api/fs/tree?path=src'), 'tree')
    expect(nodeOf(subOut.json as TreeBody, 'a.js').path).toBe('src/a.js')
  })

  it('#1 /tree 归属兜底：已知根注册表尚未跟上切根时，节点仍归属当前根（源 :116）', async () => {
    const parent = await newRoot('fs-p3-tree-home-')
    const child = join(parent, 'child')
    await mkdir(join(child, 'sub'), { recursive: true })
    await writeFile(join(child, 'sub', 'a.js'), 'export const a = 1\n', 'utf8')
    await mkdir(join(parent, 'other'), { recursive: true })
    await writeFile(join(parent, 'other', 'y.js'), 'export const y = 2\n', 'utf8')

    const ctx = createCtx(child)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // 首次浏览：已知根注册表缓存（TTL 5s）以「只含 child」的内容建立
    const first = await call(fsTest, createReq('GET', '/api/fs/tree?path=.'), 'tree')
    expect(first.status).toBe(200)
    expect((first.json as TreeBody).list?.some(item => item.name === 'sub')).toBe(true)

    // 父根的桶在缓存建立之后才出现，且字段齐全：ensureBookDirAt 只在改写 index.json 时才失效
    // 注册表缓存，故缓存仍只含 child。此时切到 parent → 视图含 child（parent 的子根）但不含
    // parent，bestRootFor 对 parent 下节点返回 null ——「当前根恒在视图中」不再成立，兜底分支被求值。
    const parentBucket = join(booksRoot(), projectKey(parent))
    await mkdir(parentBucket, { recursive: true })
    await writeFile(join(parentBucket, 'index.json'), JSON.stringify({
      项目: basename(parent),
      项目根: parent,
      目录层: [],
      文件层: [],
      源码层: [],
      文章翻译: [],
    }, null, 2) + '\n')

    fsTest.setRoot(parent)
    const out = await call(fsTest, createReq('GET', '/api/fs/tree?path=other'), 'tree')
    expect(out.status).toBe(200)
    const list = (out.json as TreeBody).list ?? []
    expect(list).toHaveLength(1)
    // 兜底按当前根现算条目：书库无对应文档 → 圆点位全空，但字段必须完整（不是 undefined 崩溃）
    expect(list[0]).toEqual({
      name: 'y.js',
      type: 'file',
      path: 'other/y.js',
      hasDoc: false,
      hasDocSrc: false,
      hasDocTr: false,
      docRel: '',
      docSrcRel: '',
      docTrRel: '',
    })
  })

  it('tree 四层圆点位与 docRel 同源：文件命中三层、目录命中目录层、未命中为 false + 空串（源 §A 的补充形状契约）', async () => {
    const root = await newRoot('fs-p3-tree-layers-')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src', 'a.js'), 'export const a = 1\n', 'utf8')
    await writeFile(join(root, 'src', 'b.js'), 'export const b = 2\n', 'utf8')

    const bucket = join(booksRoot(), projectKey(root))
    for (const layer of ['目录概览', '文件摘要', '源码注解', '文章翻译']) {
      await mkdir(join(bucket, layer), { recursive: true })
    }
    await writeFile(join(bucket, '目录概览', 'src.md'), '# 概览\n', 'utf8')
    for (const layer of ['文件摘要', '源码注解', '文章翻译']) {
      await writeFile(join(bucket, layer, 'src-a.md'), '# 文档\n', 'utf8')
    }

    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('GET', '/api/fs/tree?path=.'), 'tree')
    const dirNode = nodeOf(out.json as TreeBody, 'src')
    // 目录节点的 stem 就是目录名（folder-doc 命名），三个「源/译」位恒为 false + 空串
    expect(dirNode.hasDoc).toBe(true)
    expect(dirNode.docRel).toBe('@' + projectKey(root) + '/目录概览/src.md')
    expect(dirNode.hasDocSrc).toBe(false)
    expect(dirNode.docSrcRel).toBe('')
    expect(dirNode.hasDocTr).toBe(false)
    expect(dirNode.docTrRel).toBe('')

    const subOut = await call(fsTest, createReq('GET', '/api/fs/tree?path=src'), 'tree')
    const body = subOut.json as TreeBody
    const aJs = nodeOf(body, 'a.js')
    expect(aJs.type).toBe('file')
    expect(aJs.hasDoc).toBe(true)
    expect(aJs.hasDocSrc).toBe(true)
    expect(aJs.hasDocTr).toBe(true)
    expect(aJs.docRel).toBe('@' + projectKey(root) + '/文件摘要/src-a.md')
    expect(aJs.docSrcRel).toBe('@' + projectKey(root) + '/源码注解/src-a.md')
    expect(aJs.docTrRel).toBe('@' + projectKey(root) + '/文章翻译/src-a.md')

    const bJs = nodeOf(body, 'b.js')
    expect(bJs.hasDoc).toBe(false)
    expect(bJs.hasDocSrc).toBe(false)
    expect(bJs.hasDocTr).toBe(false)
    expect(bJs.docRel).toBe('')
    expect(bJs.docSrcRel).toBe('')
    expect(bJs.docTrRel).toBe('')
  })

  it('tree 未知目录 → 500（readdir ENOENT 未兜底，既有行为）（源 §A 的 500 分支）', async () => {
    const root = await newRoot('fs-p3-tree-500-')
    const ctx = createCtx(root)
    apply(ctx)
    const out = await call(fsTestOf(ctx), createReq('GET', '/api/fs/tree?path=no-such-dir'), 'tree')
    expect(out.status).toBe(500)
    const body = out.json as ErrorBody
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/ENOENT/)
  })

  it('read/tree 双位置回退：旧库文档仍可见，新桶优先（源 :502）', async () => {
    const root = await newRoot('fs-p3-dual-')
    await mkdir(join(root, 'src'), { recursive: true })
    const ws = basename(root)
    // 旧库（只读回退）：目录概览/src.md、文件摘要/x.md
    const legacy = join(root, '.book', ws + '-book')
    await mkdir(join(legacy, '目录概览'), { recursive: true })
    await writeFile(join(legacy, '目录概览', 'src.md'), '# 旧库目录概览\n', 'utf8')
    await mkdir(join(legacy, '文件摘要'), { recursive: true })
    await writeFile(join(legacy, '文件摘要', 'x.md'), '# 旧库文件摘要\n', 'utf8')
    // 新桶：放同名 目录概览/src.md（验证新桶优先读）
    const bucket = join(booksRoot(), projectKey(root))
    await mkdir(join(bucket, '目录概览'), { recursive: true })
    await writeFile(join(bucket, '目录概览', 'src.md'), '# 新桶目录概览\n', 'utf8')

    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // /tree 双位置探测：src 目录 hasDoc 可见；docRel 输出带桶格式 @<桶名>/<层名>/<stem>.md
    const out = await call(fsTest, createReq('GET', '/api/fs/tree?path=.'), 'tree')
    expect(out.status).toBe(200)
    const srcItem = nodeOf(out.json as TreeBody, 'src')
    expect(srcItem.type).toBe('directory')
    expect(srcItem.hasDoc).toBe(true)
    expect(srcItem.docRel).toBe('@' + projectKey(root) + '/目录概览/src.md')

    // /read 带桶 docRel：按桶段定位（读新桶内容）
    const byRel = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent(srcItem.docRel)), 'read')
    expect(byRel.status).toBe(200)
    expect((byRel.json as ReadBody).content).toBe('# 新桶目录概览\n')

    // /read 新桶优先：同名文档读新桶内容
    const fresh = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('目录概览/src.md')), 'read')
    expect((fresh.json as ReadBody).content).toBe('# 新桶目录概览\n')

    // /read 旧库回退：新桶没有时读旧库内容
    const legacyRead = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('文件摘要/x.md')), 'read')
    expect((legacyRead.json as ReadBody).content).toBe('# 旧库文件摘要\n')
  })

  it('跨工作区共享：子树定向最近已知项目根桶，读写同桶（源 :553）', async () => {
    // root 为父工作区；plugins/child 是已注册项目根（其桶 index.json 含「项目根」绝对路径）。
    const root = await newRoot('fs-p3-cross-')
    const child = join(root, 'plugins', 'child')
    await mkdir(join(child, 'src'), { recursive: true })
    await writeFile(join(child, 'src', 'a.js'), 'const a = 1\n', 'utf8')
    await writeFile(join(child, 'README.md'), '# Child\n', 'utf8')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src', 'b.js'), 'const b = 2\n', 'utf8')
    // child 桶：目录概览/src.md（child/src 的概览）+ 文件摘要/src-a.md（child/src/a.js 的摘要）
    const childBucketName = projectKey(child)
    const childBucket = join(booksRoot(), childBucketName)
    await mkdir(join(childBucket, '目录概览'), { recursive: true })
    await mkdir(join(childBucket, '文件摘要'), { recursive: true })
    await writeFile(join(childBucket, '目录概览', 'src.md'), '# 跨根目录概览\n', 'utf8')
    await writeFile(join(childBucket, '文件摘要', 'src-a.md'), '# 跨根文件摘要\n', 'utf8')
    await writeFile(join(childBucket, 'index.json'), JSON.stringify({
      项目: 'child',
      项目根: child,
      目录层: [],
      文件层: [],
      源码层: [],
      文章翻译: [],
    }) + '\n', 'utf8')

    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // /tree 浏览 child 根：src 目录命中 child 桶（跨工作区可见），docRel 带 child 桶段
    const childTree = await call(fsTest, createReq('GET', '/api/fs/tree?path=' + encodeURIComponent('plugins/child')), 'tree')
    expect(childTree.status).toBe(200)
    const srcDir = nodeOf(childTree.json as TreeBody, 'src')
    expect(srcDir.hasDoc).toBe(true)
    expect(srcDir.docRel).toBe('@' + childBucketName + '/目录概览/src.md')

    // /tree 浏览 child/src：a.js 的文件摘要命中 child 桶（stem 按 child 根视角推导）
    const srcTree = await call(fsTest, createReq('GET', '/api/fs/tree?path=' + encodeURIComponent('plugins/child/src')), 'tree')
    expect(srcTree.status).toBe(200)
    const aJs = nodeOf(srcTree.json as TreeBody, 'a.js')
    expect(aJs.hasDoc).toBe(true)
    expect(aJs.hasDocSrc).toBe(false)
    expect(aJs.docRel).toBe('@' + childBucketName + '/文件摘要/src-a.md')

    // /read 带桶 docRel：跨根读到 child 桶内容
    const crossRead = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent(aJs.docRel)), 'read')
    expect(crossRead.status).toBe(200)
    expect((crossRead.json as ReadBody).content).toBe('# 跨根文件摘要\n')

    // root 直属 src/b.js 不属于 child 根：归属 root 桶（空），无文档
    const rootTree = await call(fsTest, createReq('GET', '/api/fs/tree?path=src'), 'tree')
    expect(rootTree.status).toBe(200)
    const bJs = nodeOf(rootTree.json as TreeBody, 'b.js')
    expect(bJs.hasDoc).toBe(false)
    expect(bJs.docRel).toBe('')

    // 写定向：/gen-doc 的 docRel 指向 child 桶（路由层即定向，无需 agentLoop）
    const gen = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'file', path: 'plugins/child/src/a.js' }), 'gen-doc')
    expect(gen.status).toBe(200)
    const genStatus = await call(
      fsTest,
      createReq('GET', '/api/fs/gen-status?id=' + encodeURIComponent((gen.json as StartedBody).taskId ?? '')),
      'gen-status',
    )
    expect((genStatus.json as TaskBody).task?.docRel).toBe('@' + childBucketName + '/文件摘要/src-a.md')

    // 翻译写定向：/translate 的 docRel 同样指向 child 桶
    const tr = await call(fsTest, createReq('POST', '/api/fs/translate', { path: 'plugins/child/README.md' }), 'translate')
    expect(tr.status).toBe(200)
    expect((tr.json as StartedBody).docRel).toBe('@' + childBucketName + '/文章翻译/child-README.md')

    // 带桶防穿越：@.. 桶名 → 400；桶内文档不存在 → 404
    const escaped = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('@../目录概览/a.md')), 'read')
    expect(escaped.status).toBe(400)
    const missing = await call(
      fsTest,
      createReq('GET', '/api/fs/read?path=' + encodeURIComponent('@' + childBucketName + '/目录概览/no-such.md')),
      'read',
    )
    expect(missing.status).toBe(404)
  })
})

describe('POST /set-root、/write、/mkdir、/delete', () => {
  it('set-root 拒绝不存在的路径，root 不被修改（源 :233）', async () => {
    const root = await newRoot('fs-p3-setroot-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)
    const missing = join(root, 'no-such-dir')
    const out = await call(fsTest, createReq('POST', '/api/fs/set-root', { path: missing }), 'set-root')
    expect(out.status).toBe(400)
    expect((out.json as ErrorBody).error).toBe('not a directory: ' + missing)
    expect(fsTest.getRoot()).toBe(root)
  })

  it('set-root 拒绝指向文件的路径（isDirectory 判定）', async () => {
    const root = await newRoot('fs-p3-setroot-file-')
    await writeFile(join(root, 'a.txt'), 'x\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)
    const file = join(root, 'a.txt')
    const out = await call(fsTest, createReq('POST', '/api/fs/set-root', { path: file }), 'set-root')
    expect(out.status).toBe(400)
    expect((out.json as ErrorBody).error).toBe('not a directory: ' + file)
    expect(fsTest.getRoot()).toBe(root)
  })

  it('set-root 缺 path 时幂等返回当前 root，并确保桶存在（源 :233 的另一支）', async () => {
    const root = await newRoot('fs-p3-setroot-nopath-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)
    const out = await call(fsTest, createReq('POST', '/api/fs/set-root', {}), 'set-root')
    expect(out.status).toBe(200)
    expect(out.json).toEqual({ ok: true, root })
    // ensureBookDir：建桶 + 四层子目录（读接口之外的写副作用，源 §E-4）
    expect((await stat(join(booksRoot(), projectKey(root), 'index.json'))).isFile()).toBe(true)
  })

  it('read 读取文件，write 写入后 read 回读一致；缺 content 写空文件（源 :154）', async () => {
    const root = await newRoot('fs-p3-rw-')
    await mkdir(join(root, 'sub'), { recursive: true })
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const writeOut = await call(fsTest, createReq('POST', '/api/fs/write', { path: 'sub/out.txt', content: 'hello\n' }), 'write')
    expect(writeOut.status).toBe(200)
    expect(writeOut.json).toEqual({ ok: true })

    const readOut = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('sub/out.txt')), 'read')
    expect(readOut.status).toBe(200)
    expect(readOut.json).toEqual({ content: 'hello\n', ext: 'txt', size: 6 })
    expect(await readFile(join(root, 'sub', 'out.txt'), 'utf8')).toBe('hello\n')

    // content 缺省 → 写空串（content || ''）
    const emptyOut = await call(fsTest, createReq('POST', '/api/fs/write', { path: 'sub/empty.txt' }), 'write')
    expect(emptyOut.status).toBe(200)
    expect(await readFile(join(root, 'sub', 'empty.txt'), 'utf8')).toBe('')
  })

  it('write 越权路径被拒绝，不会写出 root（源 :176）', async () => {
    const root = await newRoot('fs-p3-write-escape-')
    const ctx = createCtx(root)
    apply(ctx)
    const out = await call(fsTestOf(ctx), createReq('POST', '/api/fs/write', { path: '../outside.txt', content: 'evil' }), 'write')
    expect(out.status).toBe(400)
    expect((out.json as ErrorBody).error).toBe('path escapes workspace root')
    await expect(stat(join(root, '..', 'outside.txt'))).rejects.toThrow()
  })

  it('write 无 path → 400 path required，不再落到 writeFile(root)（G-1 修复，源 D-10 锁定已解除）', async () => {
    const root = await newRoot('fs-p3-write-nopath-')
    const ctx = createCtx(root)
    apply(ctx)
    const out = await call(fsTestOf(ctx), createReq('POST', '/api/fs/write', {}), 'write')
    // 修复前：无校验 → resolveIn(root, undefined) === root → writeFile(root) → EISDIR → 统一 500。
    // 修复后：校验卡在 resolveIn 之前 → 400，且根目录不被触碰。
    expect(out.status).toBe(400)
    expect(out.json).toEqual({ ok: false, error: 'path required' })
    expect((await stat(root)).isDirectory()).toBe(true)
  })

  it('mkdir 建目录成功、越权 400（源 :233 之外的 mkdir 支）', async () => {
    const root = await newRoot('fs-p3-mkdir-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const ok = await call(fsTest, createReq('POST', '/api/fs/mkdir', { path: 'a/b/c' }), 'mkdir')
    expect(ok.status).toBe(200)
    expect(ok.json).toEqual({ ok: true })
    expect((await stat(join(root, 'a', 'b', 'c'))).isDirectory()).toBe(true)

    const escaped = await call(fsTest, createReq('POST', '/api/fs/mkdir', { path: '../evil' }), 'mkdir')
    expect(escaped.status).toBe(400)
    expect((escaped.json as ErrorBody).error).toBe('path escapes workspace root')
  })

  it('mkdir 无 path → 400 path required，不再对工作区根 mkdir -p（G-1 修复，源 D-10 锁定已解除）', async () => {
    const root = await newRoot('fs-p3-mkdir-nopath-')
    const ctx = createCtx(root)
    apply(ctx)
    const out = await call(fsTestOf(ctx), createReq('POST', '/api/fs/mkdir', {}), 'mkdir')
    // 修复前：abs === root，mkdir -p 幂等 → 200（把「缺参数」静默当成功）。
    expect(out.status).toBe(400)
    expect(out.json).toEqual({ ok: false, error: 'path required' })
    expect((await stat(root)).isDirectory()).toBe(true)
  })

  it('delete 删除文件与目录、越权 400、目标不存在仍 200（force + recursive）', async () => {
    const root = await newRoot('fs-p3-delete-')
    await mkdir(join(root, 'dir', 'inner'), { recursive: true })
    await writeFile(join(root, 'dir', 'inner', 'a.txt'), 'x\n', 'utf8')
    await writeFile(join(root, 'file.txt'), 'y\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const fileOut = await call(fsTest, createReq('POST', '/api/fs/delete', { path: 'file.txt' }), 'delete')
    expect(fileOut.status).toBe(200)
    expect(fileOut.json).toEqual({ ok: true })
    await expect(stat(join(root, 'file.txt'))).rejects.toThrow()

    const dirOut = await call(fsTest, createReq('POST', '/api/fs/delete', { path: 'dir' }), 'delete')
    expect(dirOut.status).toBe(200)
    await expect(stat(join(root, 'dir'))).rejects.toThrow()

    const escaped = await call(fsTest, createReq('POST', '/api/fs/delete', { path: '../evil' }), 'delete')
    expect(escaped.status).toBe(400)
    expect((escaped.json as ErrorBody).error).toBe('path escapes workspace root')

    // force:true：目标不存在也 200（幂等删除）
    const again = await call(fsTest, createReq('POST', '/api/fs/delete', { path: 'dir' }), 'delete')
    expect(again.status).toBe(200)
    expect(again.json).toEqual({ ok: true })
  })

  it('delete 无 path → 400，工作区根与其中文件不被递归删除（G-1 修复，源 §F-3 高危已消除）', async () => {
    const root = await newRoot('fs-p3-delete-nopath-')
    await writeFile(join(root, 'keep.txt'), 'x\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/delete', {}), 'delete')
    expect(out.status).toBe(400)
    expect(out.json).toEqual({ ok: false, error: 'path required' })
    // 修复前：abs === root 从越权检查 `abs !== root && ...` 里通过 → rm(root, {recursive, force})
    // 删掉整个工作区根（实测 stat(root) 由 true 变 false）。
    // 修复后：校验先于 resolveIn，根目录与其内容原样保留（root 变量本就一直不变）。
    expect((await stat(root)).isDirectory()).toBe(true)
    expect(await readFile(join(root, 'keep.txt'), 'utf8')).toBe('x\n')
    expect(fsTest.getRoot()).toBe(root)
  })

  it('read 超过 2MB 上限被拒绝（源 :218）', async () => {
    const root = await newRoot('fs-p3-read-big-')
    const limit = 2 * 1024 * 1024
    await writeFile(join(root, 'big.txt'), 'a'.repeat(limit + 1), 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const out = await call(fsTestOf(ctx), createReq('GET', '/api/fs/read?path=' + encodeURIComponent('big.txt')), 'read')
    expect(out.status).toBe(400)
    expect((out.json as ErrorBody).error).toBe('file too large: ' + String(limit + 1) + ' bytes (limit ' + String(limit) + ')')
  })
})

// G-1（2026-09-11）：三条写路由的 path 必填校验，覆盖全部「缺失」形态。
// 判定 = `typeof path !== 'string' || path === ''`：前者拦 undefined / null / 数字 / 对象 /
// 布尔，后者拦空串；`'.'`、`'sub/dir'` 等合法非空串不受必填校验影响（/delete 另有 G-1b 守卫，
// 只拒「解析回工作区根自身」的目标）。
const MISSING_PATH_FORMS: Array<[string, Record<string, unknown>]> = [
  ['缺字段（undefined）', {}],
  ['null', { path: null }],
  ['空串', { path: '' }],
  ['数字 0', { path: 0 }],
  ['对象', { path: {} }],
  ['布尔 false', { path: false }],
]

describe('G-1/G-1b：写路由 path 必填，且 /delete 拒绝工作区根自身', () => {
  for (const seg of ['write', 'mkdir', 'delete'] as const) {
    it('/' + seg + '：各种缺失形态一律 400，且工作区根自始至终未被触碰', async () => {
      const root = await newRoot('fs-p3-g1-' + seg + '-')
      await writeFile(join(root, 'keep.txt'), 'x\n', 'utf8')
      const ctx = createCtx(root)
      apply(ctx)
      const fsTest = fsTestOf(ctx)

      const seen: string[] = []
      for (const [label, body] of MISSING_PATH_FORMS) {
        const out = await call(fsTest, createReq('POST', '/api/fs/' + seg, body), seg)
        const err = out.json as ErrorBody
        seen.push(label + ' → ' + String(out.status) + ' ' + String(err.ok) + ' ' + String(err.error))
        // 根必须始终在：/delete 的缺失形态在修复前会把整个工作区根删掉。
        expect((await stat(root)).isDirectory()).toBe(true)
      }
      expect(seen).toEqual(MISSING_PATH_FORMS.map(([label]) => label + ' → 400 false path required'))
      expect(await readFile(join(root, 'keep.txt'), 'utf8')).toBe('x\n')
    })
  }

  it('合法值不误伤：path 为 "." 或嵌套相对路径时三条路由照旧工作', async () => {
    const root = await newRoot('fs-p3-g1-legal-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // mkdir：'.'（工作区根自身，mkdir -p 幂等 → 200）与嵌套相对路径都放行。
    const dotDir = await call(fsTest, createReq('POST', '/api/fs/mkdir', { path: '.' }), 'mkdir')
    expect(dotDir.status).toBe(200)
    expect(dotDir.json).toEqual({ ok: true })
    const nested = await call(fsTest, createReq('POST', '/api/fs/mkdir', { path: 'sub/dir' }), 'mkdir')
    expect(nested.status).toBe(200)
    expect((await stat(join(root, 'sub', 'dir'))).isDirectory()).toBe(true)

    // write：嵌套路径正常落盘；'.' 指向目录本身，仍按既有语义走到 writeFile → EISDIR 500
    // （而不是被必填校验拒成 400）——这正是「只拦缺失形态、不拦合法值」的直接证据。
    const wrote = await call(fsTest, createReq('POST', '/api/fs/write', { path: 'sub/ok.txt', content: 'hi\n' }), 'write')
    expect(wrote.status).toBe(200)
    expect(await readFile(join(root, 'sub', 'ok.txt'), 'utf8')).toBe('hi\n')
    const dotFile = await call(fsTest, createReq('POST', '/api/fs/write', { path: '.', content: 'hi\n' }), 'write')
    expect(dotFile.status).toBe(500)
    expect((dotFile.json as ErrorBody).ok).toBe(false)

    // delete：嵌套相对路径照常删除（守卫只拦「根自身」，见下一用例）。
    const removed = await call(fsTest, createReq('POST', '/api/fs/delete', { path: 'sub/ok.txt' }), 'delete')
    expect(removed.status).toBe(200)
    expect(removed.json).toEqual({ ok: true })
    await expect(stat(join(root, 'sub', 'ok.txt'))).rejects.toThrow()
  })

  it('delete 指向工作区根自身 → 400 refusing to delete the workspace root，根与内容完好（G-1b）', async () => {
    const root = await newRoot('fs-p3-g1b-root-')
    await mkdir(join(root, 'sub'), { recursive: true })
    await writeFile(join(root, 'keep.txt'), 'x\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // 三种写法都解析回 root：'.'、'./'、'sub/..'（resolveIn 的越权检查只放行「根自身」，
    // 恰是它拦不住、必须由本守卫兜住的那一层）。逐条断言 400 + 文件系统零改动。
    const seen: string[] = []
    for (const rel of ['.', './', 'sub/..']) {
      const out = await call(fsTest, createReq('POST', '/api/fs/delete', { path: rel }), 'delete')
      const err = out.json as ErrorBody
      seen.push(rel + ' → ' + String(out.status) + ' ' + String(err.ok) + ' ' + String(err.error))
      expect((await stat(join(root, 'keep.txt'))).isFile()).toBe(true)
      expect((await stat(join(root, 'sub'))).isDirectory()).toBe(true)
    }
    expect(seen).toEqual([
      '. → 400 false refusing to delete the workspace root',
      './ → 400 false refusing to delete the workspace root',
      'sub/.. → 400 false refusing to delete the workspace root',
    ])
    // 修复前：这三种写法各自都会 rm -rf 掉整个工作区根（abs === root 从越权检查里通过）。
    expect((await stat(root)).isDirectory()).toBe(true)
    expect(await readFile(join(root, 'keep.txt'), 'utf8')).toBe('x\n')

    // 对照：非根的合法目标照常删除——守卫只拦「根自身」，不改变 /delete 的其余语义。
    const removed = await call(fsTest, createReq('POST', '/api/fs/delete', { path: 'sub' }), 'delete')
    expect(removed.status).toBe(200)
    expect(removed.json).toEqual({ ok: true })
    await expect(stat(join(root, 'sub'))).rejects.toThrow()
  })
})

describe('POST body 读取与上限', () => {
  it('POST 非法 JSON body 返回 400 而非 500（源 :247）', async () => {
    const root = await newRoot('fs-p3-badjson-')
    const ctx = createCtx(root)
    apply(ctx)
    const out = await call(fsTestOf(ctx), createReq('POST', '/api/fs/write', '{bad json'), 'write')
    expect(out.status).toBe(400)
    expect(out.json).toEqual({ ok: false, error: 'invalid json body' })
  })

  it('POST body 超过 10MB → 413 body too large，并 destroy 未读完的请求（源 §A 的 413 分支）', async () => {
    const root = await newRoot('fs-p3-body-limit-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    let destroyed = false
    const req = createRawReq('POST', '/api/fs/write')
    req.destroy = () => {
      destroyed = true
    }
    setImmediate(() => {
      req.emit('data', Buffer.alloc(10 * 1024 * 1024 + 1))
    })

    const out = await call(fsTest, req, 'write')
    expect(out.status).toBe(413)
    expect(out.json).toEqual({ ok: false, error: 'body too large' })
    expect(destroyed).toBe(true)
  })

  it('非 Buffer 分片同样计入 10MB 上限；req 无 destroy 时也不崩（源 index.ts:225-230 的两支）', async () => {
    const root = await newRoot('fs-p3-body-string-')
    const ctx = createCtx(root)
    apply(ctx)

    // EventEmitter 没有 destroy → 覆盖 `typeof req.destroy === 'function'` 的 false 支
    const req = createRawReq('POST', '/api/fs/mkdir')
    setImmediate(() => {
      req.emit('data', 'a'.repeat(10 * 1024 * 1024 + 1))
      req.emit('end')
    })

    const out = await call(fsTestOf(ctx), req, 'mkdir')
    expect(out.status).toBe(413)
    expect(out.json).toEqual({ ok: false, error: 'body too large' })
  })

  it('end 之后的迟到 data 分片被丢弃，不改写已解析的 body（源 index.ts:224 的 settled 守卫）', async () => {
    const root = await newRoot('fs-p3-body-late-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const req = createRawReq('POST', '/api/fs/write')
    setImmediate(() => {
      req.emit('data', '{"path":"late.txt","content":"ok"}')
      req.emit('end')
      req.emit('data', '{"path":"late.txt","content":"OVERWRITTEN"}')
    })

    const out = await call(fsTest, req, 'write')
    expect(out.status).toBe(200)
    expect(await readFile(join(root, 'late.txt'), 'utf8')).toBe('ok')
  })

  it('req 的 error 事件让 readBody reject → 500，处理器不挂起（源 index.ts:236 的防御支）', async () => {
    const root = await newRoot('fs-p3-body-error-')
    const ctx = createCtx(root)
    apply(ctx)
    const req = createRawReq('POST', '/api/fs/write')
    setImmediate(() => {
      req.emit('error', new Error('socket hang up'))
    })
    const out = await call(fsTestOf(ctx), req, 'write')
    expect(out.status).toBe(500)
    expect(out.json).toEqual({ ok: false, error: 'socket hang up' })
  })

  it('JSON 字面量 null（非对象 body）→ 500，而不是 400（源 index.ts:358-366 的既有行为）', async () => {
    const root = await newRoot('fs-p3-body-null-')
    const ctx = createCtx(root)
    apply(ctx)
    const out = await call(fsTestOf(ctx), createReq('POST', '/api/fs/write', 'null'), 'write')
    expect(out.status).toBe(500)
    expect((out.json as ErrorBody).ok).toBe(false)
    expect((out.json as ErrorBody).error).toMatch(/properties of null/)
  })
})

describe('POST /gen-doc', () => {
  it('gen-doc 返回 fsgen- 前缀 taskId 与 docRel，gen-status 可查到该任务（源 :188）', async () => {
    const root = await newRoot('fs-p3-gen-')
    await mkdir(join(root, 'src'), { recursive: true })
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect(out.status).toBe(200)
    const body = out.json as StartedBody
    expect(body.ok).toBe(true)
    expect(body.started).toBe(true)
    expect(typeof body.taskId).toBe('string')
    const taskId = body.taskId ?? ''
    // taskId 前缀只存在于本入口文件（能力注册表覆盖不到）：生成任务一律 fsgen-
    expect(taskId.startsWith('fsgen-')).toBe(true)

    // 无 agentLoop → 执行器抛错 → setImmediate 的 .catch 置 error
    const task = await waitSettled(fsTest, taskId)
    expect(task.status).toBe('error')
    expect(task.error).toMatch(/agentLoop/)
    // 任务记录目标文档路径：带桶格式 @<桶>/目录概览/<文件夹名>.md
    expect(task.docRel).toBe('@' + projectKey(root) + '/目录概览/src.md')

    const statusOut = await call(fsTest, createReq('GET', '/api/fs/gen-status?id=' + encodeURIComponent(taskId)), 'gen-status')
    expect(statusOut.status).toBe(200)
    const statusBody = statusOut.json as TaskBody
    expect(statusBody.ok).toBe(true)
    expect(statusBody.task?.id).toBe(taskId)
    expect(statusBody.task?.status).toBe('error')
  })

  it('gen-doc 占位先于 setImmediate：返回响应前任务已占位、docRel 已补算（源 index.ts:439-457 的顺序契约）', async () => {
    const root = await newRoot('fs-p3-gen-order-')
    await mkdir(join(root, 'src'), { recursive: true })
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const pendingCall = call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    // 占位可观测（去重只认这条记录）：此刻响应还没返回
    const placeholder = await waitTaskRegistered(fsTest.genTasks, 'src')
    const out = await pendingCall
    expect((out.json as StartedBody).taskId).toBe(placeholder.id)
    // 占位 → 补 docRel → setImmediate → 200：响应返回时 docRel 已算好（中间无 await 空隙）
    expect(fsTest.genTasks.get(placeholder.id)?.docRel).toBe('@' + projectKey(root) + '/目录概览/src.md')
    await waitTaskSettled(fsTest.genTasks, placeholder.id)
  })

  it('重复生成同 kind+rel 复用进行中的 taskId（源 :259）', async () => {
    const root = await newRoot('fs-p3-gen-dedup-')
    await mkdir(join(root, 'src'), { recursive: true })
    // 假 agentLoop：whenIdle 永不 settle → 任务停在 running，去重断言不依赖真实子 agent 时序
    const loop = createFakeAgentLoop({ idle: 'never' })
    const ctx = createCtx(root)
    ctx.services.agentLoop = loop
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // 等第一个请求真的占位再发第二次：去重读的是 genTasks 占位记录，而占位之前还有若干 await
    // （读 body、预检 stat）——「同时发起」并不保证后者看到前者（源 :453-458 的实测结论）。
    const first = call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    await waitTaskRegistered(fsTest.genTasks, 'src')
    const second = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    const firstOut = await first

    expect(firstOut.status).toBe(200)
    expect(second.status).toBe(200)
    const firstBody = firstOut.json as StartedBody
    const secondBody = second.json as StartedBody
    expect(secondBody.taskId).toBe(firstBody.taskId)
    expect(secondBody.reused).toBe(true)
    // 只起了一次子会话（whenIdle 永不 settle，故只能轮询 createAgent 的调用记录）
    await waitFor(() => loop.calls.length === 1, '子会话创建')
    expect(loop.calls).toHaveLength(1)
  })

  it('去重命中判据：pending/running 复用、终态不复用、kind 不同不复用（源 :285-289 的三支）', async () => {
    const root = await newRoot('fs-p3-gen-dedup-branch-')
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(join(root, 'lib'), { recursive: true })
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // ① pending 命中（`status === 'pending'` 的左操作数）
    const pending = makeTask('fsgen-pending', { rel: 'src' })
    fsTest.genTasks.set(pending.id, pending)
    const hitPending = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect((hitPending.json as StartedBody).taskId).toBe(pending.id)
    expect((hitPending.json as StartedBody).reused).toBe(true)

    // ② running 命中（右操作数）
    fsTest.genTasks.delete(pending.id)
    const running = makeTask('fsgen-running', { rel: 'src', status: 'running', startedAt: Date.now() })
    fsTest.genTasks.set(running.id, running)
    const hitRunning = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect((hitRunning.json as StartedBody).taskId).toBe(running.id)

    // ③ 终态不复用：同 kind+rel 但已 error → 新建任务（先把上面那条 running 清掉，只留终态记录）
    fsTest.genTasks.delete(running.id)
    fsTest.genTasks.set('fsgen-done', makeTask('fsgen-done', { rel: 'src', status: 'error', error: 'x', finishedAt: Date.now() }))
    const fresh = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    const freshBody = fresh.json as StartedBody
    expect(freshBody.reused).toBeUndefined()
    expect(freshBody.taskId).not.toBe('fsgen-done')
    expect(freshBody.taskId?.startsWith('fsgen-')).toBe(true)

    // ④ kind 不同不复用：rel 相同但 kind 是 translate
    fsTest.genTasks.set('fstr-other', makeTask('fstr-other', { kind: 'translate', rel: 'lib', status: 'running', startedAt: Date.now() }))
    const otherKind = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'lib' }), 'gen-doc')
    const otherBody = otherKind.json as StartedBody
    expect(otherBody.reused).toBeUndefined()
    expect(otherBody.taskId).not.toBe('fstr-other')
  })

  it('gen-doc 未知 kind 返回 400；空 body 的 kind 为 undefined 同样 400（源 :278）', async () => {
    const root = await newRoot('fs-p3-gen-kind-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'nope', path: 'src' }), 'gen-doc')
    expect(out.status).toBe(400)
    expect((out.json as ErrorBody).error).toBe('unknown gen kind: nope')

    const empty = await call(fsTest, createReq('POST', '/api/fs/gen-doc'), 'gen-doc')
    expect(empty.status).toBe(400)
    expect((empty.json as ErrorBody).error).toBe('unknown gen kind: undefined')
  })

  it('gen-doc 对 markdown 文件拒绝生成 L2/L3，folder 目标不受限（源 :290）', async () => {
    const root = await newRoot('fs-p3-gen-md-')
    await writeFile(join(root, 'b.md'), '# hi\n', 'utf8')
    await mkdir(join(root, 'a.md'), { recursive: true })
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    for (const kind of ['file', 'src']) {
      const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind, path: 'b.md' }), 'gen-doc')
      expect(out.status).toBe(400)
      expect((out.json as ErrorBody).error).toBe(ZH.errGenMd)
    }
    // 目录概览不受 md 限制：同名目录可以生成
    const dirOut = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'a.md' }), 'gen-doc')
    expect(dirOut.status).toBe(200)
    const taskId = (dirOut.json as StartedBody).taskId ?? ''
    expect(taskId.startsWith('fsgen-')).toBe(true)
    await waitTaskSettled(fsTest.genTasks, taskId)
  })

  it('gen-doc（folder）目标不是目录时 400，不创建任务（源 :312）', async () => {
    const root = await newRoot('fs-p3-gen-notdir-')
    await writeFile(join(root, 'a.js'), 'export const a = 1\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'a.js' }), 'gen-doc')
    expect(out.status).toBe(400)
    expect((out.json as ErrorBody).error).toBe(ZH.errTargetNotDir)
    // 预检失败不得留下任务占位（否则前端会轮询到一个永不开始的任务）
    expect(fsTest.genTasks.size).toBe(0)
  })

  it('gen-doc（file/src）目标不是文件时 400，不创建任务（源 :328）', async () => {
    const root = await newRoot('fs-p3-gen-notfile-')
    await mkdir(join(root, 'src'), { recursive: true })
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    for (const kind of ['file', 'src']) {
      const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind, path: 'src' }), 'gen-doc')
      expect(out.status).toBe(400)
      expect((out.json as ErrorBody).error).toBe(ZH.errTargetNotFile)
    }
    expect(fsTest.genTasks.size).toBe(0)
  })

  it('gen-doc/translate 目标不存在时 400，且不创建任务（源 :416）', async () => {
    const root = await newRoot('fs-p3-target-missing-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)
    const before = fsTest.genTasks.size
    const cases: Array<[string, Record<string, unknown>]> = [
      ['gen-doc', { kind: 'folder', path: 'no-such-dir' }],
      ['gen-doc', { kind: 'file', path: 'no-such.js' }],
      ['translate', { path: 'no-such.md' }],
    ]
    for (const [seg, body] of cases) {
      const out = await call(fsTest, createReq('POST', '/api/fs/' + seg, body), seg)
      expect(out.status).toBe(400)
      expect((out.json as ErrorBody).error).toBe(ZH.errTargetMissing)
    }
    // 预检在占位之前：一个任务都没建，子会话也就不会起
    expect(fsTest.genTasks.size).toBe(before)
  })

  it('gen-doc 缺 path 时 rel 取默认 "."（源 index.ts:407 的默认支）', async () => {
    const root = await newRoot('fs-p3-gen-dot-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder' }), 'gen-doc')
    expect(out.status).toBe(200)
    const taskId = (out.json as StartedBody).taskId ?? ''
    const task = fsTest.genTasks.get(taskId)
    expect(task?.rel).toBe('.')
    expect(task?.docRel).toBe('@' + projectKey(root) + '/目录概览/' + basename(root) + '.md')
    await waitTaskSettled(fsTest.genTasks, taskId)
  })

  it('gen-doc 越权 path 由预检 stat 的 resolveIn 拦下 → 400（源 :176 同源语义）', async () => {
    const root = await newRoot('fs-p3-gen-escape-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)
    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: '../outside' }), 'gen-doc')
    expect(out.status).toBe(400)
    expect((out.json as ErrorBody).error).toBe('path escapes workspace root')
    expect(fsTest.genTasks.size).toBe(0)
  })

  it('gen-doc 的 kind 白名单含 translate（G-2）：走生成分支、前缀 fsgen-、与 /translate 共用去重键（源 §F-4）', async () => {
    const root = await newRoot('fs-p3-gen-translate-kind-')
    await writeFile(join(root, 'a.js'), 'const a = 1\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // md 目标会被 errGenMd 拦下（kind !== 'folder'），故用 .js 观察白名单过宽的既有行为
    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'translate', path: 'a.js' }), 'gen-doc')
    expect(out.status).toBe(200)
    const taskId = (out.json as StartedBody).taskId ?? ''
    expect(taskId.startsWith('fsgen-')).toBe(true)
    const task = await waitTaskSettled(fsTest.genTasks, taskId)
    expect(task.kind).toBe('translate')
    expect(task.docRel).toBe('@' + projectKey(root) + '/文章翻译/' + basename(root) + '-a.md')

    // 副作用：kind 同为 translate → 与 /translate 共用去重键，互相复用
    const injected = makeTask('fstr-shared', { kind: 'translate', rel: 'a.js', status: 'running', startedAt: Date.now() })
    fsTest.genTasks.set(injected.id, injected)
    const shared = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'translate', path: 'a.js' }), 'gen-doc')
    expect((shared.json as StartedBody).taskId).toBe(injected.id)
    expect((shared.json as StartedBody).reused).toBe(true)
  })
})

describe('POST /translate', () => {
  it('translate 返回 fstr- 前缀 taskId 与 docRel（文章翻译层），任务可达 gen-status（源 :344）', async () => {
    const root = await newRoot('fs-p3-tr-')
    await mkdir(join(root, 'docs'), { recursive: true })
    await writeFile(join(root, 'README.md'), '# Hello\n', 'utf8')
    await writeFile(join(root, 'docs', 'guide.md'), '# Guide\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)
    const ws = basename(root)

    // 顶层 md → 文章翻译/<工作区名>-README.md
    const out = await call(fsTest, createReq('POST', '/api/fs/translate', { path: 'README.md' }), 'translate')
    expect(out.status).toBe(200)
    const body = out.json as StartedBody
    expect(body.ok).toBe(true)
    expect(typeof body.taskId).toBe('string')
    const taskId = body.taskId ?? ''
    // 翻译任务一律 fstr- 前缀（生成任务为 fsgen-）
    expect(taskId.startsWith('fstr-')).toBe(true)
    expect(body.docRel).toBe('@' + projectKey(root) + '/文章翻译/' + ws + '-README.md')

    // 子目录 md → 文章翻译/docs-guide.md（完整相对路径前缀）
    const sub = await call(fsTest, createReq('POST', '/api/fs/translate', { path: 'docs/guide.md' }), 'translate')
    expect(sub.status).toBe(200)
    expect((sub.json as StartedBody).docRel).toBe('@' + projectKey(root) + '/文章翻译/docs-guide.md')

    // 无 agentLoop → 执行器抛错 → error；任务里记录 kind/rel
    const task = await waitSettled(fsTest, taskId)
    expect(task.kind).toBe('translate')
    expect(task.rel).toBe('README.md')
    expect(task.status).toBe('error')

    const statusOut = await call(fsTest, createReq('GET', '/api/fs/gen-status?id=' + encodeURIComponent(taskId)), 'gen-status')
    expect((statusOut.json as TaskBody).task?.id).toBe(taskId)
  })

  it('translate 拒绝非 md 文件、书库内文档与缺 path（源 :385）', async () => {
    const root = await newRoot('fs-p3-tr-bad-')
    await writeFile(join(root, 'a.js'), 'const a = 1\n', 'utf8')
    await mkdir(join(root, '.book', 'x-book', '文章翻译'), { recursive: true })
    await writeFile(join(root, '.book', 'x-book', '文章翻译', 'a.md'), '# 译文\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const notMd = await call(fsTest, createReq('POST', '/api/fs/translate', { path: 'a.js' }), 'translate')
    expect(notMd.status).toBe(400)
    expect((notMd.json as ErrorBody).error).toBe(ZH.errTranslateOnlyMd)

    const inBook = await call(fsTest, createReq('POST', '/api/fs/translate', { path: '.book/x-book/文章翻译/a.md' }), 'translate')
    expect(inBook.status).toBe(400)
    expect((inBook.json as ErrorBody).error).toBe(ZH.errBookNoTranslate)

    const noPath = await call(fsTest, createReq('POST', '/api/fs/translate', {}), 'translate')
    expect(noPath.status).toBe(400)
    expect((noPath.json as ErrorBody).error).toBe('path required')
  })

  it('translate 重复请求复用进行中的 taskId（源 :436）', async () => {
    const root = await newRoot('fs-p3-tr-dup-')
    await writeFile(join(root, 'a.md'), '# hi\n', 'utf8')
    // 假 agentLoop：whenIdle 永不 settle → 任务停在 running，去重断言不依赖真实子 agent 时序
    const loop = createFakeAgentLoop({ idle: 'never' })
    const ctx = createCtx(root)
    ctx.services.agentLoop = loop
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const first = call(fsTest, createReq('POST', '/api/fs/translate', { path: 'a.md' }), 'translate')
    // 等第一个请求真的占位再发第二次（占位之前还有读 body、预检 precheck 若干 await）
    await waitTaskRegistered(fsTest.genTasks, 'a.md')
    const second = await call(fsTest, createReq('POST', '/api/fs/translate', { path: 'a.md' }), 'translate')
    const firstOut = await first

    expect(firstOut.status).toBe(200)
    expect(second.status).toBe(200)
    expect((second.json as StartedBody).taskId).toBe((firstOut.json as StartedBody).taskId)
    expect((second.json as StartedBody).reused).toBe(true)
    await waitFor(() => loop.calls.length === 1, '子会话创建')
    expect(loop.calls).toHaveLength(1)
  })

  it('translate 去重键用原始未规范化 rel："a.md" 与 "./a.md" 不去重（源 §B 的并发/去重契约）', async () => {
    const root = await newRoot('fs-p3-tr-rel-')
    await writeFile(join(root, 'a.md'), '# hi\n', 'utf8')
    const loop = createFakeAgentLoop({ idle: 'never' })
    const ctx = createCtx(root)
    ctx.services.agentLoop = loop
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const first = call(fsTest, createReq('POST', '/api/fs/translate', { path: 'a.md' }), 'translate')
    await waitTaskRegistered(fsTest.genTasks, 'a.md')
    const second = await call(fsTest, createReq('POST', '/api/fs/translate', { path: './a.md' }), 'translate')
    const firstOut = await first

    expect(second.status).toBe(200)
    expect((second.json as StartedBody).reused).toBeUndefined()
    expect((second.json as StartedBody).taskId).not.toBe((firstOut.json as StartedBody).taskId)
    // 两条占位记录的 rel 逐字不同（正是未规范化导致的"重复任务"）
    const rels = [...fsTest.genTasks.values()].map(task => task.rel).sort()
    expect(rels).toEqual(['./a.md', 'a.md'])
    await waitFor(() => loop.calls.length === 2, '两次子会话创建')
    expect(loop.calls).toHaveLength(2)
  })

  it('translate 越权 path 在 stat 预检处被拦下 → 400（源 :553 的带桶防穿越同源语义）', async () => {
    const root = await newRoot('fs-p3-tr-escape-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)
    const out = await call(fsTest, createReq('POST', '/api/fs/translate', { path: '../outside.md' }), 'translate')
    expect(out.status).toBe(400)
    expect((out.json as ErrorBody).error).toBe('path escapes workspace root')
    expect(fsTest.genTasks.size).toBe(0)
  })
})

describe('GET /gen-status', () => {
  it('gen-status 未命中：HTTP 200 + {ok:false,error:"task not found",task:null}（源 §A 的反直觉契约）', async () => {
    const root = await newRoot('fs-p3-status-404-')
    const ctx = createCtx(root)
    apply(ctx)
    const out = await call(fsTestOf(ctx), createReq('GET', '/api/fs/gen-status?id=fsgen-nope'), 'gen-status')
    expect(out.status).toBe(200)
    expect(out.json).toEqual({ ok: false, error: 'task not found', task: null })
  })

  it('gen-status 无 id：最近任务列表按 startedAt 倒序、上限 20、未启动的排最后（源 index.ts:541）', async () => {
    const root = await newRoot('fs-p3-status-list-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    for (let i = 0; i < 25; i += 1) {
      const id = 't' + String(i)
      fsTest.genTasks.set(id, makeTask(id, { rel: 'r' + String(i), status: 'success', startedAt: 1000 + i, finishedAt: 1000 + i }))
    }
    fsTest.genTasks.set('pending-one', makeTask('pending-one', { rel: 'pending-rel' }))

    const out = await call(fsTest, createReq('GET', '/api/fs/gen-status'), 'gen-status')
    expect(out.status).toBe(200)
    const body = out.json as TaskBody
    expect(body.ok).toBe(true)
    expect(body.tasks?.length).toBe(20)
    expect(body.tasks?.[0]?.id).toBe('t24')
    // startedAt 为 null 的任务按 (startedAt || 0) 排在最后，被 20 条上限截掉
    expect(body.tasks?.some(task => task.id === 'pending-one')).toBe(false)
  })
})

describe('GET /read', () => {
  it('read 普通文件返回 content/ext/size；目录与不存在路径一律 400 not a file；缺 path 400（源 §A）', async () => {
    const root = await newRoot('fs-p3-read-')
    await mkdir(join(root, 'dir'), { recursive: true })
    await writeFile(join(root, 'note.txt'), 'hello\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const ok = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('note.txt')), 'read')
    expect(ok.status).toBe(200)
    expect(ok.json).toEqual({ content: 'hello\n', ext: 'txt', size: 6 })

    const dirOut = await call(fsTest, createReq('GET', '/api/fs/read?path=dir'), 'read')
    expect(dirOut.status).toBe(400)
    expect((dirOut.json as ErrorBody).error).toBe('not a file')

    const missing = await call(fsTest, createReq('GET', '/api/fs/read?path=nope.txt'), 'read')
    expect(missing.status).toBe(400)
    expect((missing.json as ErrorBody).error).toBe('not a file')

    const noPath = await call(fsTest, createReq('GET', '/api/fs/read'), 'read')
    expect(noPath.status).toBe(400)
    expect((noPath.json as ErrorBody).error).toBe('path required')
  })

  it('read 书库白名单：../../ 穿越、四层外、非法结构 rel 与带反斜杠的叶子均被拒绝（源 :468）', async () => {
    const root = await newRoot('fs-p3-read-book-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // 非书库 rel 但越权（../../etc/passwd）→ resolveIn 拒绝，状态码映射为 400
    const escape = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('../../etc/passwd')), 'read')
    expect(escape.status).toBe(400)
    expect((escape.json as ErrorBody).error).toBe('path escapes workspace root')

    // 命中「层名开头」形状但层名在白名单四层外 → 不是书库 rel，按普通项目文件解析 → 不存在
    const offLayer = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('其他层/a.md')), 'read')
    expect(offLayer.status).not.toBe(200)
    expect(offLayer.status).toBe(400)

    // 命中书库形状但结构非法（../ 穿越层段）→ 400 invalid book doc rel
    const traversal = await call(
      fsTest,
      createReq('GET', '/api/fs/read?path=' + encodeURIComponent('目录概览/../文件摘要/a.md')),
      'read',
    )
    expect(traversal.status).toBe(400)
    expect((traversal.json as ErrorBody).error).toMatch(/invalid book doc rel/)

    // 层段数与首段不符（3 段但首段不是 '@桶名'）→ 不是书库 rel，按普通项目文件解析 → 不存在
    const deep = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('目录概览/a/b.md')), 'read')
    expect(deep.status).toBe(400)
    expect((deep.json as ErrorBody).error).toBe('not a file')

    // 叶子含反斜杠（POSIX 下是合法文件名字符）→ 严格解析拒绝，防 Windows 路径语义混入
    const backslash = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('目录概览/a\\b.md')), 'read')
    expect(backslash.status).toBe(400)
    expect((backslash.json as ErrorBody).error).toMatch(/invalid book doc rel/)

    // 白名单层内但文件不存在 → 404
    const notFound = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('目录概览/no-such.md')), 'read')
    expect(notFound.status).toBe(404)
    expect((notFound.json as ErrorBody).error).toMatch(/not a file/)
  })

  it('read 带桶 rel：新桶定位、注册桶的旧库回退、未注册桶只读新桶（源 :553 与 :629 的合成）', async () => {
    const root = await newRoot('fs-p3-read-bucket-')
    const bucketName = projectKey(root)
    const bucket = join(booksRoot(), bucketName)
    await mkdir(join(bucket, '目录概览'), { recursive: true })
    await writeFile(join(bucket, '目录概览', 'new.md'), '# 新桶\n', 'utf8')
    await writeFile(join(bucket, 'index.json'), JSON.stringify({ 项目: basename(root), 项目根: root }) + '\n', 'utf8')
    // 旧库只在带桶分支被注册表查到「项目根」时作为回退候选
    const legacy = join(root, '.book', basename(root) + '-book')
    await mkdir(join(legacy, '目录概览'), { recursive: true })
    await writeFile(join(legacy, '目录概览', 'legacy.md'), '# 旧库\n', 'utf8')

    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const fresh = await call(fsTest, createReq('GET', '/api/fs/read?path=' + encodeURIComponent('@' + bucketName + '/目录概览/new.md')), 'read')
    expect(fresh.status).toBe(200)
    expect((fresh.json as ReadBody).content).toBe('# 新桶\n')

    const fallback = await call(
      fsTest,
      createReq('GET', '/api/fs/read?path=' + encodeURIComponent('@' + bucketName + '/目录概览/legacy.md')),
      'read',
    )
    expect(fallback.status).toBe(200)
    expect((fallback.json as ReadBody).content).toBe('# 旧库\n')

    // 未注册的桶（knownBookRoots 查不到映射）→ 只读新桶 → 404
    const unknownBucket = await call(
      fsTest,
      createReq('GET', '/api/fs/read?path=' + encodeURIComponent('@--no-such-bucket--/目录概览/new.md')),
      'read',
    )
    expect(unknownBucket.status).toBe(404)
  })
})

describe('任务状态机（4 态 / 去重 / sweep 兜底）', () => {
  it('sweepGenTasks 淘汰超时 running：置 error + 字典文案 + finishedAt 打点；未超时不动（源 task-timeout.test.js:74）', async () => {
    const root = await newRoot('fs-p3-sweep-timeout-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const stalledId = 'fsgen-stalled'
    fsTest.genTasks.set(stalledId, makeTask(stalledId, {
      docRel: '目录概览/src.md',
      status: 'running',
      startedAt: Date.now() - 10 * 60 * 1000 - 1000,
    }))
    // 未超时 running 任务（刚启动）不应被动过
    const freshId = 'fstr-fresh'
    fsTest.genTasks.set(freshId, makeTask(freshId, {
      kind: 'translate',
      rel: 'a.md',
      docRel: '文章翻译/a.md',
      status: 'running',
      startedAt: Date.now(),
    }))

    fsTest.sweepGenTasks()

    const stalled = fsTest.genTasks.get(stalledId)
    expect(stalled?.status).toBe('error')
    expect(stalled?.error).toBe(ZH.errTaskTimeout)
    // finishedAt 打点：本 sweep 不删除（TTL 检查在完成超 10 分钟之后），gen-status 仍可查到
    expect(typeof stalled?.finishedAt).toBe('number')
    const fresh = fsTest.genTasks.get(freshId)
    expect(fresh?.status).toBe('running')
    expect(fresh?.error).toBeNull()
  })

  it('超时任务经 gen-status 可见且 error 透传字典文案（源 task-timeout.test.js:104）', async () => {
    const root = await newRoot('fs-p3-sweep-status-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const taskId = 'fsgen-stalled2'
    fsTest.genTasks.set(taskId, makeTask(taskId, {
      kind: 'file',
      rel: 'src/a.js',
      docRel: '文件摘要/src-a.md',
      status: 'running',
      startedAt: Date.now() - 10 * 60 * 1000 - 1000,
    }))
    fsTest.sweepGenTasks()

    const out = await call(fsTest, createReq('GET', '/api/fs/gen-status?id=' + encodeURIComponent(taskId)), 'gen-status')
    expect(out.status).toBe(200)
    const body = out.json as TaskBody
    expect(body.ok).toBe(true)
    expect(body.task?.status).toBe('error')
    expect(body.task?.error).toBe(ZH.errTaskTimeout)
  })

  it('sweepGenTasks TTL：完成超 10 分钟的记录被删除，未超期的保留（源 §B，源测试未覆盖）', async () => {
    const root = await newRoot('fs-p3-sweep-ttl-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    fsTest.genTasks.set('old', makeTask('old', { status: 'success', startedAt: 1, finishedAt: Date.now() - 10 * 60 * 1000 - 1000 }))
    fsTest.genTasks.set('recent', makeTask('recent', { status: 'error', error: 'x', startedAt: 1, finishedAt: Date.now() }))

    fsTest.sweepGenTasks()

    expect(fsTest.genTasks.has('old')).toBe(false)
    expect(fsTest.genTasks.has('recent')).toBe(true)
  })

  it('sweepGenTasks 容量：超 100 条时按 finishedAt 删最旧的已完成记录，未完成的不参与（源 §B，源测试未覆盖）', async () => {
    const root = await newRoot('fs-p3-sweep-cap-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // 101 条已完成（finishedAt 递增，未超 TTL）+ 1 条 pending（无 finishedAt）
    for (let i = 0; i < 101; i += 1) {
      const id = 'done-' + String(i)
      fsTest.genTasks.set(id, makeTask(id, { status: 'success', startedAt: i, finishedAt: Date.now() - i }))
    }
    fsTest.genTasks.set('still-pending', makeTask('still-pending', { rel: 'pending-rel' }))

    fsTest.sweepGenTasks()

    // 删到容量上限为止：最旧的两条（finishedAt 最大 = now - 100、now - 99）先出局
    expect(fsTest.genTasks.size).toBe(100)
    expect(fsTest.genTasks.has('done-100')).toBe(false)
    expect(fsTest.genTasks.has('done-99')).toBe(false)
    expect(fsTest.genTasks.has('done-0')).toBe(true)
    expect(fsTest.genTasks.has('still-pending')).toBe(true)
  })

  it('任务 4 态：占位 pending（startedAt 为 null）→ running（打点 startedAt）→ success（打点 finishedAt）（源 §B 的 11 个迁移点）', async () => {
    const root = await newRoot('fs-p3-state-')
    await mkdir(join(root, 'src'), { recursive: true })
    // holdCreate：createAgent 停在闸门 → 任务可确定性停在 pending；
    // idle 闸门：whenIdle 停在闸门 → 任务可确定性停在 running。
    const loop = createFakeAgentLoop({ holdCreate: true, idle: 'gate', setupArg: { tools: { restrict: () => undefined } } })
    const ctx = createCtx(root)
    ctx.services.agentLoop = loop
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const posted = call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    const placeholder = await waitTaskRegistered(fsTest.genTasks, 'src')
    const out = await posted
    const taskId = (out.json as StartedBody).taskId ?? ''
    expect(taskId).toBe(placeholder.id)

    // ① pending：占位在响应返回前就存在，且 startedAt 仍为 null
    expect(fsTest.genTasks.get(taskId)?.status).toBe('pending')
    expect(fsTest.genTasks.get(taskId)?.startedAt).toBeNull()

    // ② running：createAgent 成功后由执行器置态，startedAt 打点
    loop.releaseCreate()
    const running = await waitTaskRunning(fsTest.genTasks, taskId)
    expect(running.finishedAt).toBeNull()
    expect(typeof running.startedAt).toBe('number')

    // ③ success：子 agent 写出产物（宿主收尾 verify 通过）→ 置 success + finishedAt 打点
    const docAbs = join(booksRoot(), projectKey(root), '目录概览', 'src.md')
    await mkdir(dirname(docAbs), { recursive: true })
    await writeFile(docAbs, '---\n源码路径: x\n层级: 目录\n---\n\n# src\n\n> 该目录放示例源码。\n', 'utf8')
    loop.releaseIdle()
    const settled = await waitTaskSettled(fsTest.genTasks, taskId)
    expect(settled.status).toBe('success')
    expect(settled.error).toBeNull()
    expect(typeof settled.finishedAt).toBe('number')
  })
})

describe('执行器装配面：模型路由与工具面收敛（index.ts 的闭包，经真实执行器触达）', () => {
  it('子 agent 模型路由：initiator 优先、缺字段回退部署默认、两者皆无为空对象（源 index.ts:257-278）', async () => {
    const root = await newRoot('fs-p3-route-model-')
    await mkdir(join(root, 'src'), { recursive: true })
    const loop = createFakeAgentLoop()
    const ctx = createCtx(root)
    ctx.services.agentLoop = loop
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // ① initiator 四个字段齐全 → 原样继承
    ctx.services.agents = {
      currentInitiator: () => ({ options: { provider: 'p1', model: 'm1', reasoningEffort: 'low', maxTokens: 4096 } }),
    }
    const first = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    await waitTaskSettled(fsTest.genTasks, (first.json as StartedBody).taskId ?? '')
    expect(loop.calls[0]?.agentOptions).toEqual({ provider: 'p1', model: 'm1', reasoningEffort: 'low', maxTokens: 4096 })

    // ② initiator 只有 provider → model/reasoningEffort 由部署默认补位（maxTokens 不在选择里则不带）
    ctx.services.agents = { currentInitiator: () => ({ options: { provider: 'p1' } }) }
    ctx.services.agentDefaultModel = { currentSelection: () => ({ provider: 'dp', model: 'dm', reasoningEffort: 'high' }) }
    const second = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    await waitTaskSettled(fsTest.genTasks, (second.json as StartedBody).taskId ?? '')
    expect(loop.calls[1]?.agentOptions).toEqual({ provider: 'p1', model: 'dm', reasoningEffort: 'high' })

    // ③ initiator 无 options、部署默认也无 currentSelection → 空对象
    ctx.services.agents = { currentInitiator: () => ({}) }
    ctx.services.agentDefaultModel = {}
    const third = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    await waitTaskSettled(fsTest.genTasks, (third.json as StartedBody).taskId ?? '')
    expect(loop.calls[2]?.agentOptions).toEqual({})

    // ④ 两个服务都不存在 → 空对象（{{model}} 无值的坑由调用方兜底）
    ctx.services.agents = undefined
    ctx.services.agentDefaultModel = undefined
    const fourth = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    await waitTaskSettled(fsTest.genTasks, (fourth.json as StartedBody).taskId ?? '')
    expect(loop.calls[3]?.agentOptions).toEqual({})
  })

  it('工具面收敛：有 restrict 时按能力白名单收敛；无 tools / restrict 非函数时跳过；restrict 抛错只降级 warn（源 index.ts:182-192）', async () => {
    const root = await newRoot('fs-p3-route-scope-')
    await mkdir(join(root, 'src'), { recursive: true })
    const restricts: Array<{ allow: string[] }> = []

    // ① 正常路径：folder 能力 → GEN_SCOPE_TOOLS.folder
    const loopOk = createFakeAgentLoop({
      setupArg: {
        tools: {
          restrict: (options: { allow: string[] }) => {
            restricts.push(options)
          },
        },
      },
    })
    const ctxOk = createCtx(root)
    ctxOk.services.agentLoop = loopOk
    apply(ctxOk)
    const okOut = await call(fsTestOf(ctxOk), createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    await waitTaskSettled(fsTestOf(ctxOk).genTasks, (okOut.json as StartedBody).taskId ?? '')
    expect(restricts).toEqual([{ allow: ['read', 'write'] }])

    // ② 无 tools：跳过收敛但不抛，任务照常起
    const loopNoTools = createFakeAgentLoop({ setupArg: {} })
    const ctxNoTools = createCtx(root)
    ctxNoTools.services.agentLoop = loopNoTools
    apply(ctxNoTools)
    const noToolsOut = await call(fsTestOf(ctxNoTools), createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect(noToolsOut.status).toBe(200)
    await waitTaskSettled(fsTestOf(ctxNoTools).genTasks, (noToolsOut.json as StartedBody).taskId ?? '')
    expect(loopNoTools.calls).toHaveLength(1)

    // ③ restrict 不是函数：同样跳过（防御预设漂移时把非函数塞进来）
    const loopBadRestrict = createFakeAgentLoop({ setupArg: { tools: { restrict: 'nope' } } })
    const ctxBadRestrict = createCtx(root)
    ctxBadRestrict.services.agentLoop = loopBadRestrict
    apply(ctxBadRestrict)
    const badOut = await call(
      fsTestOf(ctxBadRestrict),
      createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }),
      'gen-doc',
    )
    expect(badOut.status).toBe(200)
    await waitTaskSettled(fsTestOf(ctxBadRestrict).genTasks, (badOut.json as StartedBody).taskId ?? '')
    expect(loopBadRestrict.calls).toHaveLength(1)

    // ④ restrict 抛错（如组合里没有该工具名）：只 warn，任务不因此失败
    const warns: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warns.push(args.map(String).join(' '))
    })
    const loopThrows = createFakeAgentLoop({
      setupArg: {
        tools: {
          restrict: () => {
            throw new Error('unknown global tool: bash')
          },
        },
      },
    })
    const ctxThrows = createCtx(root)
    ctxThrows.services.agentLoop = loopThrows
    apply(ctxThrows)
    const throwsOut = await call(fsTestOf(ctxThrows), createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    await waitTaskSettled(fsTestOf(ctxThrows).genTasks, (throwsOut.json as StartedBody).taskId ?? '')
    expect(warns.join('\n')).toContain('tools.restrict 降级')
  })

  it('applyGenScope 在 agentCtx 为空（未提供工具面）时直接返回，不抛（源 index.ts:182-186 的左支）', async () => {
    const root = await newRoot('fs-p3-route-scope-none-')
    await mkdir(join(root, 'src'), { recursive: true })
    // setupArg 缺省即 undefined：执行器把 undefined 交给 applyGenScope
    const loop = createFakeAgentLoop()
    const ctx = createCtx(root)
    ctx.services.agentLoop = loop
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect(out.status).toBe(200)
    const taskId = (out.json as StartedBody).taskId ?? ''
    const task = await waitTaskSettled(fsTest.genTasks, taskId)
    // 无 tools 面 → 不收敛；任务照常跑完（无产物 → 收尾校验置 error）
    expect(task.status).toBe('error')
    expect(loop.calls).toHaveLength(1)
  })
})

// ---- 覆盖率补齐（P3-1 收口）：源用例未触达、但运行时可构造的分支 ----
// 这三处都是**可达**的，只是源 `host-routes.test.js` 的用例组合没走到；
// 剩下几处（parseBookDocRel 的三重双保险、serveFile 的 not-a-file、applyGenScope
// 的空白名单）在当前调用链下不可达，另见交付报告。

describe('覆盖率补齐：可达但源用例未触达的分支', () => {
  it('resolveAgentOptions：initiator 缺 provider 时由 agentDefaultModel 补齐（源 index.ts:157-159 的左支）', async () => {
    const root = await newRoot('fs-p3-cov-model-')
    await mkdir(join(root, 'src'), { recursive: true })
    const loop = createFakeAgentLoop()
    const ctx = createCtx(root)
    ctx.services.agentLoop = loop
    // initiator 只给 model：provider 缺失才会落进 `!out.provider && sel.provider` 分支
    ctx.services.agents = { currentInitiator: () => ({ options: { model: 'm-only' } }) }
    ctx.services.agentDefaultModel = { currentSelection: () => ({ provider: 'p-from-default', reasoningEffort: 'low' }) }
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect(out.status).toBe(200)
    await waitTaskSettled(fsTest.genTasks, (out.json as StartedBody).taskId ?? '')
    // provider 来自默认模型、model 来自 initiator、effort 来自默认模型 —— 三者合成同一对象
    expect(loop.calls[0]?.agentOptions).toEqual({ model: 'm-only', provider: 'p-from-default', reasoningEffort: 'low' })
  })

  it('setGenTaskStatus 对已被淘汰的任务是 no-op（源 index.ts:165-172 的 `if (!task) return`）', async () => {
    const root = await newRoot('fs-p3-cov-status-')
    await mkdir(join(root, 'src'), { recursive: true })
    // services 留空 → agentLoop 缺失 → runGenDoc 立即抛，setImmediate 的 .catch 会调 setGenTaskStatus
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect(out.status).toBe(200)
    const taskId = (out.json as StartedBody).taskId ?? ''
    // 任务启动的 setImmediate 要等下一轮 check 阶段；此处仍在同一 microtask 批次，
    // 同步淘汰记录即可让随后的 setGenTaskStatus 命中 `!task` 早退。
    expect(fsTest.genTasks.delete(taskId)).toBe(true)
    for (let i = 0; i < 3; i++) await tick()
    // 早退而非报错：记录没有被重新写回
    expect(fsTest.genTasks.has(taskId)).toBe(false)
  })

  it('serveFile：书库文档超过 READ_LIMIT → 400 file too large（源 index.ts:334-347 的上限分支）', async () => {
    const root = await newRoot('fs-p3-cov-big-')
    const bucketName = projectKey(root)
    const bucket = join(booksRoot(), bucketName)
    await mkdir(join(bucket, '目录概览'), { recursive: true })
    const big = READ_LIMIT + 1
    await writeFile(join(bucket, '目录概览', 'big.md'), 'x'.repeat(big), 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(
      fsTest,
      createReq('GET', '/api/fs/read?path=' + encodeURIComponent('@' + bucketName + '/目录概览/big.md')),
      'read',
    )
    expect(out.status).toBe(400)
    expect((out.json as ErrorBody).error).toBe('file too large: ' + String(big) + ' bytes (limit ' + String(READ_LIMIT) + ')')
  })
})

// ---- 覆盖率补齐（二）：其余可达分支 ----
// 这些分支都是**可达**的（与第一批的 parseBookDocRel 双保险等不可达代码不同），
// 只是源 host-routes.test.js 的用例组合没走到：靠空 body / 抛非 Error / settled 后事件 /
// 同 kind 不同 rel / startedAt 为 null / 缺 ?path 这些输入即可确定性地触达。

describe('覆盖率补齐（二）：可达分支', () => {
  it('readBody：error 事件先到则 reject 一次，迟到的 end 不重复 settle（源 index.ts:236 的两个分支）', async () => {
    const root = await newRoot('fs-p3-cov-bodyerr-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const req = createRawReq('POST', '/api/fs/write')
    const pending = call(fsTest, req, 'write')
    // 先 error：settled 置真并 reject；随后 end 命中 `if (!settled)` 的假支
    req.emit('error', new Error('socket boom'))
    req.emit('end')
    const out = await pending
    expect(out.status).toBe(500)
    expect((out.json as ErrorBody).error).toBe('socket boom')
  })

  it('readBody：错误不带 message 时 catch 走 `|| err` 右支（源 index.ts:655 与 :284 的右支）', async () => {
    const root = await newRoot('fs-p3-cov-bodyplain-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const req = createRawReq('POST', '/api/fs/write')
    const pending = call(fsTest, req, 'write')
    // 非 Error 的拒绝理由：`(err as Error)?.message` 为 undefined，回退到 err 本身
    req.emit('error', 'plain rejection')
    req.emit('end')
    const out = await pending
    expect(out.status).toBe(500)
    expect((out.json as ErrorBody).error).toBe('plain rejection')
  })

  it('applyGenScope：restrict 抛非 Error 时降级 warn 仍出（源 index.ts:190 的右支）', async () => {
    const root = await newRoot('fs-p3-cov-scopeplain-')
    await mkdir(join(root, 'src'), { recursive: true })
    const warns: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warns.push(args.map(String).join(' '))
    })
    const loop = createFakeAgentLoop({
      setupArg: {
        tools: {
          restrict: () => {
            // 抛字符串（非 Error）：走 `?.message || err` 的右支
            throw 'plain restrict failure'
          },
        },
      },
    })
    const ctx = createCtx(root)
    ctx.services.agentLoop = loop
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect(out.status).toBe(200)
    await waitTaskSettled(fsTest.genTasks, (out.json as StartedBody).taskId ?? '')
    expect(warns.join('\n')).toContain('plain restrict failure')
  })

  it('resolveAgentOptions：default 的 model 只在 initiator 缺 model 时补齐（源 index.ts:274 的左支）', async () => {
    const root = await newRoot('fs-p3-cov-model2-')
    await mkdir(join(root, 'src'), { recursive: true })
    const loop = createFakeAgentLoop()
    const ctx = createCtx(root)
    ctx.services.agentLoop = loop
    // initiator 只给 provider → out.model 仍缺失，才落进 `!out.model && sel.model`
    ctx.services.agents = { currentInitiator: () => ({ options: { provider: 'p-init' } }) }
    ctx.services.agentDefaultModel = { currentSelection: () => ({ model: 'm-default' }) }
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const out = await call(fsTest, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect(out.status).toBe(200)
    await waitTaskSettled(fsTest.genTasks, (out.json as StartedBody).taskId ?? '')
    expect(loop.calls[0]?.agentOptions).toEqual({ provider: 'p-init', model: 'm-default' })
  })

  it('sweepGenTasks：未收尾（finishedAt 为 null）的任务不参与 TTL 淘汰（源 index.ts:164 的假支）', async () => {
    const root = await newRoot('fs-p3-cov-sweep-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // pending 且未超时：TTL 分支与 running 超时分支都不成立 → 记录必须留下
    fsTest.genTasks.set('keep-pending', {
      id: 'keep-pending', kind: 'folder', rel: 'keep', docRel: '', status: 'pending',
      error: null, startedAt: Date.now(), finishedAt: null,
    })
    fsTest.sweepGenTasks()
    expect(fsTest.genTasks.has('keep-pending')).toBe(true)

    // 对照：已收尾且超 TTL 的记录被淘汰
    fsTest.genTasks.set('drop-done', {
      id: 'drop-done', kind: 'folder', rel: 'drop', docRel: '', status: 'success',
      error: null, startedAt: 1, finishedAt: Date.now() - 11 * 60 * 1000,
    })
    fsTest.sweepGenTasks()
    expect(fsTest.genTasks.has('drop-done')).toBe(false)
  })

  it('translate 去重循环：同 kind 但 rel 不同不命中，照常新建（源 index.ts:483 的假支）', async () => {
    const root = await newRoot('fs-p3-cov-dedup-')
    await writeFile(join(root, 'a.md'), '# a\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    fsTest.genTasks.set('other-pending', {
      id: 'other-pending', kind: 'translate', rel: 'other.md', docRel: '', status: 'pending',
      error: null, startedAt: null, finishedAt: null,
    })
    const out = await call(fsTest, createReq('POST', '/api/fs/translate', { path: 'a.md' }), 'translate')
    expect(out.status).toBe(200)
    // rel 不同 → 不复用；新任务用 fstr- 前缀
    expect((out.json as StartedBody).reused).toBeUndefined()
    expect(String((out.json as StartedBody).taskId).startsWith('fstr-')).toBe(true)
    expect((out.json as StartedBody).taskId).not.toBe('other-pending')
  })

  it('GET /tree 缺 ?path 时默认 .；/gen-status 列表对 startedAt 为 null 的任务排序（源 :547 与 :541 的右支）', async () => {
    const root = await newRoot('fs-p3-cov-tree-default-')
    await writeFile(join(root, 'x.txt'), 'x\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // 不带 ?path → query.get('path') 为 null，走 `|| '.'`
    const tree = await call(fsTest, createReq('GET', '/api/fs/tree'), 'tree')
    expect(tree.status).toBe(200)
    expect((tree.json as TreeBody).path).toBe('.')

    // startedAt 为 null 的 pending 记录参与排序 → 命中 `(b.startedAt || 0)` 的右支
    fsTest.genTasks.set('n1', {
      id: 'n1', kind: 'folder', rel: 'n1', docRel: '', status: 'pending',
      error: null, startedAt: null, finishedAt: null,
    })
    fsTest.genTasks.set('n2', {
      id: 'n2', kind: 'folder', rel: 'n2', docRel: '', status: 'running',
      error: null, startedAt: Date.now(), finishedAt: null,
    })
    const status = await call(fsTest, createReq('GET', '/api/fs/gen-status'), 'gen-status')
    expect(status.status).toBe(200)
    expect(((status.json as TaskBody).tasks ?? []).map(t => t.id).sort()).toEqual(['n1', 'n2'])
  })
})

// ---- 覆盖率补齐（三）：把每个复合条件的两侧都走一遍 ----

describe('覆盖率补齐（三）：复合条件的另一侧', () => {
  it('sweepGenTasks：刚完成（finishedAt 存在但未超 TTL）的任务不淘汰（源 :164 第二条件的假支）', async () => {
    const root = await newRoot('fs-p3-cov-sweep2-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    fsTest.genTasks.set('just-done', {
      id: 'just-done', kind: 'folder', rel: 'fresh', docRel: '', status: 'success',
      error: null, startedAt: Date.now(), finishedAt: Date.now(),
    })
    fsTest.sweepGenTasks()
    expect(fsTest.genTasks.has('just-done')).toBe(true)
  })

  it('readBody：error 事件重复到达时第二次不再 settle（源 :236 的 `if (!settled)` 假支）', async () => {
    const root = await newRoot('fs-p3-cov-bodyerr2-')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const req = createRawReq('POST', '/api/fs/write')
    const pending = call(fsTest, req, 'write')
    req.emit('error', new Error('first'))
    req.emit('error', new Error('second')) // settled 已为真 → 命中假支
    req.emit('end')                        // 同样命中假支
    const out = await pending
    // 只认第一次拒绝：第二次不会覆盖已写好的响应
    expect(out.status).toBe(500)
    expect((out.json as ErrorBody).error).toBe('first')
  })

  it('translate 去重循环：非 translate 的占位不参与比较（源 :483 的 `t.kind` 假支）', async () => {
    const root = await newRoot('fs-p3-cov-dedupkind-')
    await writeFile(join(root, 'a.md'), '# a\n', 'utf8')
    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    // rel 故意与请求相同：先让 `t.kind === 'translate'` 为假，短路掉后面的 rel 比较
    fsTest.genTasks.set('folder-same-rel', {
      id: 'folder-same-rel', kind: 'folder', rel: 'a.md', docRel: '', status: 'pending',
      error: null, startedAt: null, finishedAt: null,
    })
    const out = await call(fsTest, createReq('POST', '/api/fs/translate', { path: 'a.md' }), 'translate')
    expect(out.status).toBe(200)
    expect((out.json as StartedBody).reused).toBeUndefined()
    expect((out.json as StartedBody).taskId).not.toBe('folder-same-rel')
  })

  it('GET /tree：节点本身即已知项目根时 relHome 退化为点（源 :578 的短路右支）', async () => {
    const root = await newRoot('fs-p3-cov-subroot-')
    const subRoot = join(root, 'sub')
    await mkdir(subRoot, { recursive: true })
    await writeFile(join(subRoot, 'inner.txt'), 'x\n', 'utf8')
    // 让 sub 成为「已知项目根」：桶 + index.json 的「项目根」字段（knownBookRoots 据此发现）
    const subBucket = join(booksRoot(), projectKey(subRoot))
    await mkdir(join(subBucket, '目录概览'), { recursive: true })
    await writeFile(join(subBucket, 'index.json'), JSON.stringify({ 项目: 'sub', 项目根: subRoot }) + '\n', 'utf8')

    const ctx = createCtx(root)
    apply(ctx)
    const fsTest = fsTestOf(ctx)

    const tree = await call(fsTest, createReq('GET', '/api/fs/tree'), 'tree')
    expect(tree.status).toBe(200)
    const sub = ((tree.json as TreeBody).list ?? []).find(node => node.name === 'sub')
    // sub 自身即归属根 → nodeAbs.slice(projectRoot.length) 为空串 → `|| '.'`
    expect(sub).toBeDefined()
    expect(sub?.type).toBe('directory')
  })
})
