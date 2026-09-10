// @vitest-environment node
/**
 * 后台生成/翻译子 agent 的**作用域契约** spec —— 迁移自迁移源 `tests/gen-scope.test.js`
 * （703 行 / 24 例，node:test，冻结于 3a3f89e）的业务行为部分。
 *
 * 源文件头写明的四条契约，逐条对应本文件的断言组：
 *   ① 统一工作目录：cwd 固定 $DSH_HOME/books/session，不随 GUI 工作区漂移；
 *   ② 不打 subagent 标：meta.origin 缺省（该标记会被 GUI 导航过滤、普通会话 API 拒绝访问）；
 *   ③ 作用域增量：setup 内只做 tools.restrict 收敛工具面；任务提示词只注入 user message，
 *      不再注入 system prompt（两处逐字重复＝两处计费）；
 *   ④ 书库桶发现：session 目录不被 knownBookRoots 当作书库桶。
 * 纯逻辑（genScopeAllow / renderPromptTemplate / formatStamp）与装配（createAgent 收到的
 * options 与 setup 行为）分别断言。
 *
 * ---- 装置与隔离（源仓的已知污染源，逐条加强）----
 *
 * 1. **进程级 env 改成 beforeAll 赋值 + afterAll 还原**。源在**模块顶层**改
 *    `DSH_HOME` / `DSH_FS_ISSUES_DIR` 且从不还原；vitest 的 `pool: 'forks'` + `isolate: true`
 *    只隔离进程，worker 复用属实现细节，不构成契约。`FS_GEN_PRESET` 一旦泄漏到别的文件，
 *    表现是「生成任务静默换预设」，且换个 maxWorkers 就消失 —— 故一律「保存原值 → 还原」，
 *    区分「原本不存在」与「原本有值」。
 * 2. **临时根一律 mkdtemp**。源有 `join(tmpdir(), '...-' + Date.now())` 这类可预测路径且不创建
 *    就使用；碰撞时不是「写坏文件」而是两个 ctx 指向同一 root、断言假通过。
 * 3. **时序只等可观测信号**，见 `waitSettled` 的注释。
 *
 * ---- 与源仓的两处必要差异（都不是行为放宽）----
 *
 * · `@deepseek-ai/dsh-llm` 是 peer 依赖，本仓 node_modules 里没有（与 `tests/gen-executor.spec.ts`
 *   同一实测结论）。执行器成功路径 `await import('@deepseek-ai/dsh-llm')` 必须能解析，故桩掉
 *   `createUserMessage`（原样返回入参，与源仓测试里 `followup(msg)` 直接记录入参等价）。
 * · `ctx.__fsTest`（观察窗口）只在 `NODE_ENV === 'test'` 时挂载。用 `??=` 兜底而非强制覆盖，
 *   并在 afterAll 还原：vitest 自身把 NODE_ENV 置为 test 时本行是 no-op。
 */
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { apply } from '../src/host/index.ts'
import {
  GEN_CWD_SEG, GEN_SCOPE_TOOLS, booksRoot, formatStamp, genScopeAllow,
  projectKey, renderPromptTemplate,
} from '../src/host/fs-utils.ts'
import { FILE_DOC_PLACEHOLDERS } from '../src/host/abilities/file-doc/skeleton.ts'

// peer 依赖桩：执行器成功路径要 `await import('@deepseek-ai/dsh-llm')` 取 createUserMessage。
// 原样返回入参 —— 与源仓测试断言 `captured.followup.content[0].text` 的取法逐字对应。
vi.mock('@deepseek-ai/dsh-llm', () => ({
  createUserMessage: (message: unknown): unknown => message,
}))

// ---- 进程级隔离（beforeAll 赋值 / afterAll 还原）----

// 原值必须在任何赋值之前读取；undefined 与空串要区分开（SKILL「capture whether the original
// value was absent or present; restore that exact state」）。
const previousHome = process.env.DSH_HOME
const previousIssuesDir = process.env.DSH_FS_ISSUES_DIR
const previousNodeEnv = process.env.NODE_ENV

// 书库根 $DSH_HOME/books 指向进程级临时目录，避免读写真实 ~/.dsh/books。
// （booksRoot() 在调用时读 env，故此处赋值对后续 apply/执行器调用生效。）
let testHome = ''

beforeAll(async () => {
  testHome = await mkdtemp(join(tmpdir(), 'dsh-fs-gen-scope-'))
  process.env.DSH_HOME = testHome
  // 问题台账目录同样隔离到临时目录：宿主收尾会调 syncIssueIndex()（read-modify-write），
  // 不隔离就会改写受版本控制的 issues/README.md（回归用例见 tests/issues.spec.ts）。
  process.env.DSH_FS_ISSUES_DIR = join(testHome, 'issues')
  // __fsTest 观察窗口的挂载条件（index.ts：NODE_ENV==='test'）。
  process.env.NODE_ENV ??= 'test'
})

afterAll(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  if (previousIssuesDir === undefined) delete process.env.DSH_FS_ISSUES_DIR
  else process.env.DSH_FS_ISSUES_DIR = previousIssuesDir
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previousNodeEnv
  await rm(testHome, { recursive: true, force: true })
})

// ---- 用例级临时工作区根（每用例独立 mkdtemp，用例后回收）----

const roots: string[] = []

/**
 * 建一个临时工作区根。
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

// ---- 类型：与 index.ts 的对外形状同形（spec 只读叶子字段）----

/** apply 收到的宿主上下文面（取自真实签名，避免手写第二份形状）。 */
type HostCtx = Parameters<typeof apply>[0]
/** ctx.__fsTest：NODE_ENV==='test' 才挂载的观察窗口。 */
type FsTestHandle = NonNullable<HostCtx['__fsTest']>

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

/** 一条 followup 消息：createUserMessage 桩原样返回入参，故入参形状即此处形状。 */
interface FollowupMessage {
  content: Array<{ type: string; text: string }>
}

/** createAgent 收到的 options（只声明断言触达的字段）。 */
interface AgentOptions {
  sessionId: string
  meta: { cwd: string; agentPreset: string; origin?: string }
  setup(agentCtx: AgentCtx): void | Promise<void>
}

/** setup 收到的 agent 上下文（执行器只触达这两个成员）。 */
interface AgentCtx {
  tools: { restrict(filter: { allow: string[] }): void }
  systemPrompt: { section(section: unknown): void }
}

/** 每次 createAgent 的独立记录：并发用例里共享字段会被后一个会话覆盖，断言必须按会话取。 */
interface SessionRecord {
  options: AgentOptions
  // 显式声明 `| undefined`：exactOptionalPropertyTypes 下「未调用 restrict」就是 undefined，
  // 不能省成可选属性（那样赋 undefined 会被判类型错误）。
  restrict: { allow: string[] } | undefined
  section: unknown
  followup?: FollowupMessage
}

/** 跨用例共享的捕获对象（`calls` 只在并发用例里由装置填充）。 */
interface Captured {
  options?: AgentOptions
  restrict?: { allow: string[] }
  section?: unknown
  followup?: FollowupMessage
  mountedPreset?: string
  calls?: SessionRecord[]
  onIdle?: ((rec: SessionRecord) => void | Promise<void>) | undefined
}

// ---- 装置 ----

/**
 * 造一个最小宿主 ctx：只实现本插件真正触达的服务面，其余服务缺席（`get` 返回 undefined）。
 * @param root - 充当 sandboxPolicy.workspaceRoot 的工作区根。
 * @param captured - 记录 createAgent 收到的 options 与 setup 内的调用。
 * @returns 可交给 apply 的 ctx。
 */
function createCtx(root: string, captured: Captured): HostCtx {
  const agentLoop = {
    async createAgent(_ctx: HostCtx, options: AgentOptions) {
      captured.options = options
      // 每次会话单独记一份：并发用例里 captured 的字段会被后一个会话覆盖，
      // 断言必须按会话（rec）取，不能读共享的 captured。
      const local: { restrict?: { allow: string[] }; section?: unknown } = {}
      const agentCtx: AgentCtx = {
        tools: { restrict(filter) { local.restrict = filter; captured.restrict = filter } },
        systemPrompt: { section(section) { local.section = section; captured.section = section } },
      }
      await options.setup(agentCtx)
      const rec: SessionRecord = { options, restrict: local.restrict, section: local.section }
      if (captured.calls) captured.calls.push(rec)
      return {
        agent: {
          followup(msg: FollowupMessage) { captured.followup = msg; rec.followup = msg },
          // whenIdle 让测试模拟子 agent 的实际行为：写产物（正常完成）或什么都不做（空转）。
          async whenIdle() { if (captured.onIdle) await captured.onIdle(rec) },
        },
        async dispose() {},
      }
    },
  }
  const ctx = {
    webServer: { register: () => () => {} },
    sandboxPolicy: { workspaceRoot: root },
    sessions: {},
    // agentPresets 只记录被挂载的预设名：本插件的作用域增量才是断言重点。
    get(name: string): unknown {
      if (name === 'agentLoop') return agentLoop
      if (name === 'agentPresets') {
        return { async mount(_agentCtx: AgentCtx, presetId: string) { captured.mountedPreset = presetId } }
      }
      return undefined
    },
    effect(fn: () => unknown) { return fn() },
  }
  return ctx
}

/** 取测试句柄；未挂载即说明 NODE_ENV 不是 test（显式失败，不用非空断言）。 */
function handleOf(ctx: HostCtx): FsTestHandle {
  const handle = ctx.__fsTest
  if (!handle) throw new Error('__fsTest 未挂载：NODE_ENV 不是 test')
  return handle
}

/** 一次请求的 req 桩（EventEmitter + method/url，body 走 data/end）。 */
interface ReqStub extends EventEmitter {
  method: string
  url: string
}

/** 一次请求的 res 桩（记录 statusCode 与 body）。 */
interface ResStub {
  statusCode: number
  body: string
  setHeader(name: string, value: string): void
  end(data?: string): void
}

/**
 * 造一个请求对象：body 用 setImmediate 异步发出（与真实连接的时序一致）。
 * @param method - HTTP 方法。
 * @param url - 含 query 的完整 url。
 * @param body - 可选 JSON body；falsy 时不发 data 事件。
 * @returns 可直接交给路由 handle 的 req。
 */
function createReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as ReqStub
  req.method = method
  req.url = url
  setImmediate(() => {
    if (body) req.emit('data', JSON.stringify(body))
    req.emit('end')
  })
  return req as unknown as IncomingMessage
}

/**
 * 造一个响应对象。
 * @returns 记录 statusCode 与 body 的 res 桩。
 */
function createRes(): ResStub {
  const res: ResStub = {
    statusCode: 0,
    body: '',
    setHeader: () => {},
    end: (data?: string) => { res.body = data ?? '' },
  }
  return res
}

/** 一次路由调用的结果：HTTP 状态码 + 解析后的 JSON。 */
interface CallResult {
  status: number
  json: Record<string, unknown>
}

/**
 * 调一次真实路由并解析响应。
 * @param handle - ctx.__fsTest.handle。
 * @param req - createReq 造的请求。
 * @param seg - /api/fs/ 之后的段名。
 * @returns 状态码与 JSON 出参。
 */
async function call(
  handle: FsTestHandle['handle'],
  req: IncomingMessage,
  seg: string,
): Promise<CallResult> {
  const res = createRes()
  await handle(req, res as unknown as ServerResponse, seg)
  return { status: res.statusCode, json: JSON.parse(res.body) as Record<string, unknown> }
}

// 后台任务收尾信号：宿主用 setImmediate 起后台任务并立即回 200（任务还是 pending），
// 固定 sleep 在并发负载下会漏判（实测 6 并发 6/6 失败、13 个用例受影响）。改为轮询
// gen-status 直到任务离开 pending/running——断言与异步完成真正同步；超时上限只用于
// 防挂死，不作为同步手段（见 docs/testing.zh.md「只有单独运行时才通过」即该 spec 的缺陷）。
const SETTLE_TIMEOUT_MS = 10_000

/**
 * 轮询真实路由 GET /api/fs/gen-status 直到任务离开 pending/running。
 * @param handle - ctx.__fsTest.handle（走真路由，不是读内存 Map）。
 * @param taskId - 待收尾的任务 id。
 * @returns 收尾后的任务记录。
 */
async function waitSettled(handle: FsTestHandle['handle'], taskId: string): Promise<GenTask> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS
  for (;;) {
    const out = await call(handle, createReq('GET', '/api/fs/gen-status?id=' + encodeURIComponent(taskId)), 'gen-status')
    const task = out.json.task as GenTask | null | undefined
    if (task && task.status !== 'pending' && task.status !== 'running') return task
    if (Date.now() > deadline) {
      throw new Error('任务未在 ' + String(SETTLE_TIMEOUT_MS) + 'ms 内收尾: ' + JSON.stringify(task))
    }
    await new Promise(r => setTimeout(r, 2))
  }
}

/** createAgent 收到的 options（缺失即说明任务根本没起子会话，显式失败）。 */
function optionsOf(captured: Captured): AgentOptions {
  const options = captured.options
  if (!options) throw new Error('createAgent 未被调用：captured.options 缺失')
  return options
}

/** 一次会话收到的 restrict 过滤条件。 */
function restrictOf(captured: Captured): { allow: string[] } {
  const restrict = captured.restrict
  if (!restrict) throw new Error('tools.restrict 未被调用')
  return restrict
}

/** 一次会话收到的任务提示词正文（只注入 user message）。 */
function followupText(rec: { followup?: FollowupMessage }): string {
  const msg = rec.followup
  if (!msg) throw new Error('agent.followup 未被调用')
  const first = msg.content[0]
  if (!first) throw new Error('followup 消息没有 content[0]')
  return first.text
}

// ---- 纯逻辑 ----

it('genScopeAllow：未提供可用集合时返回期望名单，提供时取交集', () => {
  expect(genScopeAllow('src')).toEqual(GEN_SCOPE_TOOLS.src)
  // L1 已去技能化：只读子文件、写产物（无 skill/bash/检索）
  expect(genScopeAllow('folder')).toEqual(['read', 'write'])
  expect(genScopeAllow('translate')).toEqual(GEN_SCOPE_TOOLS.translate)
  // 预设漂移（组合里没有 edit）→ 交集自动剔除，不把不存在的名字交给 restrict
  expect(genScopeAllow('src', ['read', 'write', 'edit', 'bash'])).toEqual(['read', 'write', 'edit'])
  expect(genScopeAllow('src', [])).toEqual([])
  // 未知 kind 不抛错，返回空名单（调用方据此跳过限制）
  expect(genScopeAllow('nope')).toEqual([])
})

it('renderPromptTemplate：只替换 ${name}，未知占位符与 {{...}} 原样保留', () => {
  expect(renderPromptTemplate('A=${a} B=${b}', { a: '1', b: 2 })).toBe('A=1 B=2')
  // 未知变量、值为 null/undefined 时原样保留：不中断任务，且残留占位符在产物里一眼可见
  expect(renderPromptTemplate('${missing}', {})).toBe('${missing}')
  expect(renderPromptTemplate('${a}', { a: null })).toBe('${a}')
  // 完全不传 vars：视为全部缺失
  expect(renderPromptTemplate('${a}')).toBe('${a}')
  // {{...}} 由 system prompt 变量解析负责（模板中禁止使用），本函数不触碰
  expect(renderPromptTemplate('{{model}}', { model: 'x' })).toBe('{{model}}')
})

it('formatStamp：YYYY-MM-DD HH:mm（本地时区补零，与技能脚本同格式）', () => {
  // 翻译层产物由模型写 frontmatter（该层无技能脚本参与），时间戳只能由宿主提供；
  // 格式必须与 skills/*/scripts/*.mjs 的 formatStamp 一致，否则四层 frontmatter 不齐。
  expect(formatStamp(new Date(2026, 8, 8, 9, 5))).toBe('2026-09-08 09:05')
  expect(formatStamp(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31 23:59')
  expect(formatStamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
})

// ---- 装配：createAgent 收到的 options 与 setup 行为 ----

it('gen-doc：cwd 固定 books/session、无 subagent 标、工具面收敛、不注入 system 段', async () => {
  const root = await newRoot('fs-gen-scope-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)
  const { handle } = handleOf(ctx)

  const out = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
  expect(out.status).toBe(200)
  await waitSettled(handle, out.json.taskId as string)

  const meta = optionsOf(captured).meta
  expect(meta.cwd).toBe(join(booksRoot(), GEN_CWD_SEG))
  expect(meta.cwd).toBe(join(testHome, 'books', 'session'))
  // 不打 subagent 标：该标记会被 GUI 导航过滤掉且普通会话 API 拒绝访问，导致会话不可见。
  expect(meta.origin).toBeUndefined()
  expect(meta.agentPreset).toBe('ptc')
  // 目录被真实创建（子 agent 的 cwd 必须存在）
  expect((await stat(meta.cwd)).isDirectory()).toBe(true)

  // 工具面收敛到 L1 白名单（2026-09-10 去技能化：只有 read/write）
  expect(restrictOf(captured)).toEqual({ allow: GEN_SCOPE_TOOLS.folder })
  expect(restrictOf(captured).allow).toEqual(['read', 'write'])
  // 任务提示词只走 user message：system 段一次都不注入（去重后不再调用 systemPrompt.section）
  expect(captured.section).toBeUndefined()
  const sec = followupText(captured)
  expect(sec).toMatch(/【模式】首次/)
  // 产物路径由宿主算好落地，不让模型按「命名规则」自行推导
  expect(sec).toMatch(/产物文档 DOC = \S+目录概览\/src\.md/)
  // 骨架由宿主渲染后注入：frontmatter 三行 + 目录树围栏（本目录为空，只有目录名一行）
  expect(sec).toMatch(/源码路径: \S+\/src/)
  expect(sec).toMatch(/层级: 目录/)
  expect(sec).toMatch(/生成时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  expect(sec).toMatch(/```\nsrc\/\n```/)
  // 去技能化：不再加载技能、不再跑脚本、不再下发脚本参数
  // （台账段的 `skill: folder-doc` 是历史能力标识，不算技能调用）
  expect(sec).not.toMatch(/tools\.skill|folder-doc\.mjs|--key|--book|--content|run_code|skillsRoot/)
  // 确定性索引由宿主负责，模型不写 index.json
  expect(sec).toMatch(/不要写 index\.json/)
})

/** 宿主下发的骨架绝对路径（提示词里的 SKELETON 变量）；L3 骨架按 taskId 命名，测试不硬编文件名。 */
function skeletonPathFrom(rec: { followup?: FollowupMessage }): string {
  const matched = /SKELETON = (\S+)/.exec(followupText(rec))
  const path = matched ? matched[1] : undefined
  if (path === undefined) throw new Error('提示词里没有 SKELETON 变量')
  return path
}

it('gen-doc：产物已存在时自动进入「更新」模式，规范段要求先读旧文档', async () => {
  const root = await newRoot('fs-gen-update-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)
  const { handle } = handleOf(ctx)
  // 预置产物：模拟该文件夹此前已生成过文档
  const docDir = join(booksRoot(), projectKey(root), '目录概览')
  await mkdir(docDir, { recursive: true })
  await writeFile(join(docDir, 'src.md'), '---\n源码路径: x\n层级: 目录\n---\n', 'utf8')

  const out = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
  expect(out.status).toBe(200)
  await waitSettled(handle, out.json.taskId as string)

  const sec = followupText(captured)
  expect(sec).toMatch(/【模式】更新/)
  // 更新模式必须提示「先读旧文档」：步骤 2 的 gen 会先把旧文档打回模板占位符，顺序不能颠倒
  expect(sec).toMatch(/先读现有文档/)
})

it('gen-doc（folder/L1）：宿主渲染骨架经 ${skeleton} 注入，含目录树子项与三处占位', async () => {
  const root = await newRoot('fs-gen-skeleton-root-')
  await mkdir(join(root, 'src', 'inner'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), 'export const a = 1\n', 'utf8')
  await writeFile(join(root, 'src', 'b.md'), '# b\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)
  const { handle } = handleOf(ctx)

  const out = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
  expect(out.status).toBe(200)
  await waitSettled(handle, out.json.taskId as string)

  const sec = followupText(captured)
  // 目录树由宿主算好（目录在前、文件在后，与 gen-tree.sh 规则一致），模型不必自己列目录；
  // 每个节点后带 `<作用>` 占位，由模型逐项替换为「是做什么的」一句话
  expect(sec).toMatch(/src\/\n├── inner\/  # <作用>\n├── a\.js  # <作用>\n└── b\.md  # <作用>/)
  // frontmatter 三行与三处语义占位都在提示词里，模型无需推导、只需填充
  expect(sec).toMatch(/源码路径: fs-gen-skeleton-root-\S+\/src/)
  expect(sec).toMatch(/层级: 目录/)
  expect(sec).toMatch(/> <一句话说明这个文件夹是干什么的>/)
  expect(sec).toMatch(/\| 文件 \| 作用 \|/)
})

it('gen-doc（file/L2）：宿主渲染骨架注入，工具面保留检索但不含技能/shell', async () => {
  const root = await newRoot('fs-gen-file-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), 'export const a = 1\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)
  const { handle } = handleOf(ctx)

  const out = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'file', path: 'src/a.js' }), 'gen-doc')
  expect(out.status).toBe(200)
  await waitSettled(handle, out.json.taskId as string)

  // L2 去技能化：无 skill/bash，但正文要写「谁用它 / 它用谁」，保留只读检索
  expect(restrictOf(captured)).toEqual({ allow: GEN_SCOPE_TOOLS.file })
  expect(restrictOf(captured).allow).toEqual(['read', 'write', 'glob', 'grep'])
  const sec = followupText(captured)
  expect(sec).toMatch(/【模式】首次/)
  // 产物路径由宿主算好落地，不让模型按「命名规则」自行推导
  expect(sec).toMatch(/产物文档 DOC = \S+文件摘要\/\S+\.md/)
  // 骨架由宿主渲染后注入：frontmatter 三行 + 四章节标题 + 导出表头
  expect(sec).toMatch(/源码路径: \S+\/src\/a\.js/)
  expect(sec).toMatch(/层级: 文件/)
  expect(sec).toMatch(/生成时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  expect(sec).toMatch(/## 导出接口（附录：速查表）/)
  expect(sec).toMatch(/\| 导出 \| 类型 \| 作用 \|/)
  // 去技能化：不再加载技能、不再跑脚本、不再下发脚本参数
  expect(sec).not.toMatch(/tools\.skill|file-doc\.mjs|--key|--book|--content|run_code|skillsRoot/)
  expect(sec).toMatch(/不要写 index\.json/)
})

it('gen-doc（src/L3）：骨架落盘不注入、工具面 read/write/edit、无技能与脚本', async () => {
  const root = await newRoot('fs-gen-src-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), '// 头注释\nexport const a = 1\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)
  const { handle } = handleOf(ctx)

  const out = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'src', path: 'src/a.js' }), 'gen-doc')
  expect(out.status).toBe(200)
  await waitSettled(handle, out.json.taskId as string)

  // L3 去技能化：无 skill/bash/检索；骨架体量大需分批 edit 填空，故白名单含 edit
  expect(restrictOf(captured)).toEqual({ allow: GEN_SCOPE_TOOLS.src })
  expect(restrictOf(captured).allow).toEqual(['read', 'write', 'edit'])

  // 骨架由宿主落盘到统一工作目录（≈源码全文×1.5，注入提示词既挤占上下文又无法分段读）
  const skeletonPath = skeletonPathFrom(captured)
  const sk = await readFile(skeletonPath, 'utf8')
  expect(sk).toMatch(/# ===== source-doc 骨架（填空题）=====/)
  expect(sk).toMatch(/@块 \[1-1\]（注释块，合并为一条注解）/)
  expect(sk).toMatch(/@行 \[2\]/)
  expect(sk).toMatch(/代码: export const a = 1/)
  expect((sk.match(/^注解: $/gm) ?? []).length).toBe(3) // @摘要 1 处 + 2 个单元各 1 处

  const sec = followupText(captured)
  expect(sec).toMatch(/【模式】首次/)
  // 提示词只给骨架路径与行数，不注入骨架全文
  // 骨架按 taskId 命名：basename 不唯一（src/a.js 与 lib/a.js 同名）会让并发任务共用同一骨架文件
  expect(sec).toMatch(/SKELETON = \S+\/session\/skeleton-fsgen-[0-9a-f-]{36}\.txt/)
  expect(sec).toMatch(/骨架行数 = \d+/)
  expect(sec).not.toMatch(/===== source-doc 骨架/)
  // 去技能化：不加载技能、不跑脚本、不下发脚本参数
  // （台账段的 `skill: source-doc` 是历史能力标识，不算技能调用）
  expect(sec).not.toMatch(/tools\.skill|source-annotate\.mjs|--rel|--book|--root|run_code|skillsRoot/)
  // 产物与索引由宿主负责，模型只填骨架
  expect(sec).toMatch(/不要写 DOC/)
  expect(sec).toMatch(/不要写 index\.json/)
})

// ---- L3 去技能化收尾（2026-09-10）：产物由宿主 finalize 构建、索引由宿主写、骨架用完即删 ----

/**
 * 模拟子 agent 行为：把「填好的骨架」写回宿主落盘的骨架文件（L3 不写 DOC）。
 * @param ctx - 已 apply 的宿主 ctx。
 * @param captured - 捕获对象；onIdle 由本函数安装。
 * @param fill - 要写回的骨架正文；null 表示子 agent 什么都不做（空转）。
 * @returns 收尾后的任务记录。
 */
async function runSrcTask(ctx: HostCtx, captured: Captured, fill: string | null): Promise<GenTask> {
  // 骨架路径由宿主按 taskId 生成并只在提示词里下发：按该会话自己的 followup 取，避免硬编文件名。
  captured.onIdle = fill === null ? undefined : async (rec) => { await writeFile(skeletonPathFrom(rec), fill, 'utf8') }
  const handle = handleOf(ctx).handle
  const out = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'src', path: 'src/a.js' }), 'gen-doc')
  expect(out.status).toBe(200)
  return await waitSettled(handle, out.json.taskId as string)
}

// 一份「已填好注解」的骨架（与宿主渲染的骨架同构）：@摘要 + 注释块 + 一个代码行单元。
const FILLED_SKELETON = [
  '@摘要（…）',
  '注解: 演示文件',
  '',
  '@块 [1-1]（注释块，合并为一条注解）',
  '代码: // 头注释',
  '注解: 文件头注释',
  '',
  '@行 [2]',
  '代码: export const a = 1',
  '注解: 导出常量 a',
  '',
].join('\n')

/** 并发用例按会话取记录（共享 captured 的字段会被后一个会话覆盖）。 */
function callsOf(captured: Captured): SessionRecord[] {
  const calls = captured.calls
  if (!calls) throw new Error('captured.calls 未初始化：并发用例需先建 { calls: [] }')
  return calls
}

/** 读一份 JSON 文件为可索引对象。 */
async function readJson(abs: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(abs, 'utf8')) as Record<string, unknown>
}

it('gen-doc（src/L3）：宿主收尾构建产物、写「源码层」索引、删除骨架', async () => {
  const root = await newRoot('fs-gen-src-finalize-')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), '// 头注释\nexport const a = 1\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  const task = await runSrcTask(ctx, captured, FILLED_SKELETON)
  expect(task.status).toBe('success')
  expect(task.error).toBeNull()

  // 产物由宿主构建：frontmatter 三行 + 标题 + 摘要 + 代码围栏 + 行号注解（块走行上方、行尾走行尾）
  const docPath = join(booksRoot(), projectKey(root), '源码注解', 'src-a.md')
  const doc = await readFile(docPath, 'utf8')
  expect(doc).toMatch(/^---\n源码路径: \S+\/src\/a\.js\n层级: 源码\n生成时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\n---/)
  expect(doc).toMatch(/# a\.js（逐行中文注解）/)
  expect(doc).toMatch(/\*\*路径\*\*：\S+\/src\/a\.js/)
  expect(doc).toMatch(/> \*\*解决什么问题\*\*：演示文件/)
  expect(doc).toMatch(/## 逐行注解（行间插入，注释已并入注解行）/)
  expect(doc).toMatch(/```javascript\n/)
  expect(doc).toMatch(/\/\/ \[1\] 文件头注释/)                   // 注释块：原注释删除，释义并入注解行（单行块标 [1]）
  expect(doc).toMatch(/export const a = 1 {2}\/\/ \[2\] 导出常量 a/) // 短行短注解 → 行尾

  // 索引由宿主写「源码层」，其它数组保留
  const idx = await readJson(join(booksRoot(), projectKey(root), 'index.json'))
  expect(idx['源码层']).toEqual([{ '源码路径': basename(root) + '/src/a.js', '文档': '源码注解/src-a.md' }])
  expect(idx['目录层']).toEqual([])
  expect(idx['文件层']).toEqual([])
  expect(idx['项目根']).toBe(root)

  // 骨架是中间产物：收尾成功后即删
  await expect(stat(skeletonPathFrom(captured))).rejects.toThrow()
})

it('gen-doc（src/L3）：子 agent 空转（骨架一条注解都没填）→ 置 error，不误报 success', async () => {
  const root = await newRoot('fs-gen-src-idle-')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), '// 头注释\nexport const a = 1\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  // DOC 由宿主写，mtime/size 判据失效——空转改为看骨架里的注解填充率
  const task = await runSrcTask(ctx, captured, null)
  expect(task.status).toBe('error')
  expect(task.error).toMatch(/未填写任何注解/)
  // 失败时不留半成品产物
  await expect(stat(join(booksRoot(), projectKey(root), '源码注解', 'src-a.md'))).rejects.toThrow()
})

it('gen-doc（src/L3）：注解占比过低（排版自检不过）→ 置 error，不写产物、不删骨架', async () => {
  const root = await newRoot('fs-gen-src-health-')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), 'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  // 4 个单元只填 1 条：填充率 25% < 50%，自检必须拦下（与技能脚本 checkHealth 同判据）
  const lowFill = [
    '@摘要（…）', '注解: 演示', '',
    '@行 [1]', '代码: const a = 1', '注解: 定义常量 a', '',
    '@行 [2]', '代码: const b = 2', '注解: ', '',
    '@行 [3]', '代码: const c = 3', '注解: ', '',
    '@行 [4]', '代码: const d = 4', '注解: ', '',
  ].join('\n')
  const task = await runSrcTask(ctx, captured, lowFill)
  expect(task.status).toBe('error')
  expect(task.error).toMatch(/产物健康自检未通过/)
  expect(task.error).toMatch(/注解占比过低/)

  // 自检不通过：半成品不落书库，骨架保留现场便于排查
  await expect(stat(join(booksRoot(), projectKey(root), '源码注解', 'src-a.md'))).rejects.toThrow()
  expect((await stat(skeletonPathFrom(captured))).isFile()).toBe(true)
})

it('gen-doc（src/L3）：basename 相同的两个 rel 并发 → 各用各的骨架，互不删除（#2 回归）', async () => {
  const root = await newRoot('fs-gen-src-collide-')
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'lib'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), '// 头注释\nexport const a = 1\n', 'utf8')
  await writeFile(join(root, 'lib', 'a.js'), '// 头注释\nexport const b = 2\n', 'utf8')
  const captured: Captured = { calls: [] }
  const ctx = createCtx(root, captured)
  apply(ctx)
  const { handle } = handleOf(ctx)

  // 两个任务并发提交：basename 同为 a.js，去重键（kind+rel）不同，不会被复用成一个任务
  captured.onIdle = async (rec) => { await writeFile(skeletonPathFrom(rec), FILLED_SKELETON, 'utf8') }
  const out1 = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'src', path: 'src/a.js' }), 'gen-doc')
  const out2 = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'src', path: 'lib/a.js' }), 'gen-doc')
  expect(out1.status).toBe(200)
  expect(out2.status).toBe(200)
  expect(out1.json.taskId).not.toBe(out2.json.taskId)

  const t1 = await waitSettled(handle, out1.json.taskId as string)
  const t2 = await waitSettled(handle, out2.json.taskId as string)
  // 共用骨架文件时，先完成者的 finalize 会删掉对方仍在用的骨架 → 后完成者 verify 报「骨架文件不存在」
  expect(t1.status).toBe('success')
  expect(t2.status).toBe('success')

  // 两次会话各自拿到不同的骨架路径（旧实现固定按 basename 命名，两者相同）
  const calls = callsOf(captured)
  expect(calls.length).toBe(2)
  const first = calls[0]
  const second = calls[1]
  if (!first || !second) throw new Error('两个会话未都被记录')
  const p1 = skeletonPathFrom(first)
  const p2 = skeletonPathFrom(second)
  expect(p1).not.toBe(p2)

  // 产物按含路径段的 stem 分别落盘，两份都在
  const book = join(booksRoot(), projectKey(root), '源码注解')
  expect((await stat(join(book, 'src-a.md'))).isFile()).toBe(true)
  expect((await stat(join(book, 'lib-a.md'))).isFile()).toBe(true)
})

it('translate：cwd 固定、无 subagent 标、工具面收敛，且提示词只走 user message', async () => {
  const root = await newRoot('fs-tr-scope-root-')
  await writeFile(join(root, 'doc.md'), '# t\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)
  const { handle } = handleOf(ctx)

  const out = await call(handle, createReq('POST', '/api/fs/translate', { path: 'doc.md' }), 'translate')
  expect(out.status).toBe(200)
  await waitSettled(handle, out.json.taskId as string)

  expect(optionsOf(captured).meta.cwd).toBe(join(booksRoot(), GEN_CWD_SEG))
  expect(optionsOf(captured).meta.origin).toBeUndefined()
  expect(restrictOf(captured)).toEqual({ allow: GEN_SCOPE_TOOLS.translate })
  // 翻译层同样走提示词模板真源（gen-translate.md），且与 L1/L2/L3 一样只注入 user message
  expect(captured.section).toBeUndefined()
  const tsec = followupText(captured)
  expect(tsec).toMatch(/翻译为简体中文/)
  expect(tsec).toMatch(/【模式】首次/)
  expect(tsec).toMatch(/译文文档 DOC = \S+文章翻译\/\S+\.md/)
  // 本层工具面只有 read+write（无 skill/bash）→ 模板内不得调用技能脚本
  expect(tsec).not.toMatch(/translate-doc\.mjs/)
  // 「生成时间」只能由宿主给：模型拿不到当前时间，硬编会与其它三层格式不一致
  expect(tsec).toMatch(/生成时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
})

it('session 目录即使带「项目根」index.json 也不被 knownBookRoots 当作书库桶', async () => {
  const root = await newRoot('fs-gen-scope-known-')
  const ctx = createCtx(root, {})
  apply(ctx)
  const { knownBookRoots, genCwdAbs } = handleOf(ctx)

  // 人为在统一工作目录下放一个「形状合法」的 index.json：显式跳过必须仍然生效
  const dir = genCwdAbs()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'index.json'), JSON.stringify({ 项目: 'session', 项目根: '/should-not-be-a-bucket' }), 'utf8')

  const roots = await knownBookRoots()
  expect(roots.some(r => r.bucket === GEN_CWD_SEG)).toBe(false)
  expect(roots.some(r => r.projectRoot === '/should-not-be-a-bucket')).toBe(false)
  // 反证：同形状的普通桶仍能被发现
  const bucket = projectKey(root)
  await mkdir(join(booksRoot(), bucket), { recursive: true })
  await writeFile(join(booksRoot(), bucket, 'index.json'), JSON.stringify({ 项目: 'x', 项目根: root }), 'utf8')
  const roots2 = await knownBookRoots()
  expect(roots2.some(r => r.projectRoot === root)).toBe(true)
})

it('子会话预设：默认 ptc（PTC 探测），FS_GEN_PRESET 可回退 standard', async () => {
  const root = await newRoot('fs-gen-preset-')
  await mkdir(join(root, 'src'), { recursive: true })

  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)
  const out = await call(handleOf(ctx).handle, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
  expect(out.status).toBe(200)
  await waitSettled(handleOf(ctx).handle, out.json.taskId as string)
  // meta 与 mount 必须一致：会话记录里的预设名不能与实际挂载的预设脱节
  expect(optionsOf(captured).meta.agentPreset).toBe('ptc')
  expect(captured.mountedPreset).toBe('ptc')

  const captured2: Captured = {}
  const ctx2 = createCtx(root, captured2)
  apply(ctx2)
  // 还原而非 delete：本用例之外若已有该变量（宿主 shell / 别的装置设过），不能被本用例抹掉。
  const previousPreset = process.env.FS_GEN_PRESET
  process.env.FS_GEN_PRESET = 'standard'
  try {
    const out2 = await call(handleOf(ctx2).handle, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
    expect(out2.status).toBe(200)
    await waitSettled(handleOf(ctx2).handle, out2.json.taskId as string)
    expect(optionsOf(captured2).meta.agentPreset).toBe('standard')
    expect(captured2.mountedPreset).toBe('standard')
  } finally {
    if (previousPreset === undefined) delete process.env.FS_GEN_PRESET
    else process.env.FS_GEN_PRESET = previousPreset
  }
})

// ---- 空转校验（2026-09-09 缺陷修复）----
// 实测事故：子 agent 把输出预算全花在推理上，一次工具调用都没发出就正常结束，
// 产物未更新却被置 success（用户以为文档已生成）。收尾必须校验产物确实落盘/有变化。
// 产物路径由宿主算好下发在任务提示词里（`产物文档 DOC = <abs>`），测试据此模拟子 agent 行为。

/** 从该会话的提示词里取宿主算好的产物绝对路径。 */
function docAbsFrom(rec: { followup?: FollowupMessage }): string {
  const matched = /产物文档 DOC = (\S+)/.exec(followupText(rec))
  const path = matched ? matched[1] : undefined
  if (path === undefined) throw new Error('提示词里没有「产物文档 DOC」变量')
  return path
}

/**
 * 跑一次 folder 生成任务：onIdle 模拟子 agent 把产物写到宿主下发的路径。
 * @param ctx - 已 apply 的宿主 ctx。
 * @param captured - 捕获对象；onIdle 由本函数安装。
 * @param docContent - 要写出的产物正文；null 表示子 agent 什么都不做（空转）。
 * @returns 收尾后的任务记录。
 */
async function runFolderTask(ctx: HostCtx, captured: Captured, docContent: string | null): Promise<GenTask> {
  captured.onIdle = docContent === null ? undefined : async () => {
    const doc = docAbsFrom(captured)
    await mkdir(dirname(doc), { recursive: true })
    await writeFile(doc, docContent, 'utf8')
  }
  const handle = handleOf(ctx).handle
  const out = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'folder', path: 'src' }), 'gen-doc')
  expect(out.status).toBe(200)
  return await waitSettled(handle, out.json.taskId as string)
}

it('gen-doc：子 agent 空转（产物未生成）→ 置 error，不误报 success', async () => {
  const root = await newRoot('fs-gen-idle-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  const task = await runFolderTask(ctx, captured, null)
  expect(task.status).toBe('error')
  expect(task.error).toMatch(/产物未生成/)
})

it('gen-doc：子 agent 写出产物 → 置 success（校验不误伤正常完成）', async () => {
  const root = await newRoot('fs-gen-ok-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  const task = await runFolderTask(ctx, captured, '---\n源码路径: src\n---\n\n# src\n')
  expect(task.status).toBe('success')
  expect(task.error).toBeNull()
})

it('gen-doc：更新模式下子 agent 未改动产物 → 置 error（旧文档原地不动也是空转）', async () => {
  const root = await newRoot('fs-gen-nochange-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  // 首次：写出产物 → success
  const first = await runFolderTask(ctx, captured, '---\n源码路径: src\n---\n\n# src\n')
  expect(first.status).toBe('success')

  // 第二次：产物已存在（更新模式），子 agent 什么都没做 → 必须报错
  const second = await runFolderTask(ctx, captured, null)
  expect(second.status).toBe('error')
  expect(second.error).toMatch(/产物未更新/)
})

// ---- L1 去技能化收尾（2026-09-10）：索引由宿主写、骨架残留由宿主拦 ----

it('gen-doc（L1）：成功后宿主写入 index.json「目录层」条目，其它数组与项目根保留', async () => {
  const root = await newRoot('fs-gen-index-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  const task = await runFolderTask(ctx, captured, '---\n源码路径: x\n---\n\n# src\n')
  expect(task.status).toBe('success')

  const idx = await readJson(join(booksRoot(), projectKey(root), 'index.json'))
  // 条目结构对齐 folder-doc.mjs：{'源码路径','文档'}，键为工作区名 + 相对路径
  expect(idx['目录层']).toEqual([{ '源码路径': basename(root) + '/src', '文档': '目录概览/src.md' }])
  // 其它数组与项目根字段保留（确定性 upsert 不改动它们）
  expect(idx['文件层']).toEqual([])
  expect(idx['源码层']).toEqual([])
  expect(idx['文章翻译']).toEqual([])
  expect(idx['项目根']).toBe(root)
})

it('gen-doc（L1）：产物仍是骨架（语义占位未填写）→ 置 error，不写索引', async () => {
  const root = await newRoot('fs-gen-placeholder-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  // 模型把骨架原样写回：产物存在且有变化，但仍是占位符 → 必须报错
  const task = await runFolderTask(ctx, captured, '> <一句话说明这个文件夹是干什么的>\n')
  expect(task.status).toBe('error')
  expect(task.error).toMatch(/仍是骨架/)

  const idx = await readJson(join(booksRoot(), projectKey(root), 'index.json'))
  expect(idx['目录层']).toEqual([])
})

it('gen-doc（L1）：产物被清空（0 字节）→ 置 error，不写索引', async () => {
  const root = await newRoot('fs-gen-l1-empty-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)
  // 子 agent 用试探性/错误的 write 把 DOC 清空成 0 字节（#15）：占位校验会漏过，非空校验必须抓住
  const task = await runFolderTask(ctx, captured, '')
  expect(task.status).toBe('error')
  expect(task.error).toMatch(/产物为空/)
  const idx = await readJson(join(booksRoot(), projectKey(root), 'index.json'))
  expect(idx['目录层']).toEqual([])
})

// L2 同构收尾：索引由宿主写、骨架残留由宿主拦（2026-09-10 去技能化）。

/**
 * 跑一次 file 生成任务（L2）：onIdle 模拟子 agent 把产物写到宿主下发的路径。
 * @param ctx - 已 apply 的宿主 ctx。
 * @param captured - 捕获对象；onIdle 由本函数安装。
 * @param docContent - 要写出的产物正文；null 表示子 agent 什么都不做（空转）。
 * @returns 收尾后的任务记录。
 */
async function runFileTask(ctx: HostCtx, captured: Captured, docContent: string | null): Promise<GenTask> {
  captured.onIdle = docContent === null ? undefined : async () => {
    const doc = docAbsFrom(captured)
    await mkdir(dirname(doc), { recursive: true })
    await writeFile(doc, docContent, 'utf8')
  }
  const handle = handleOf(ctx).handle
  const out = await call(handle, createReq('POST', '/api/fs/gen-doc', { kind: 'file', path: 'src/a.js' }), 'gen-doc')
  expect(out.status).toBe(200)
  return await waitSettled(handle, out.json.taskId as string)
}

it('gen-doc（L2）：成功后宿主写入 index.json「文件层」条目（命名沿用 computeDocStem）', async () => {
  const root = await newRoot('fs-gen-file-index-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), 'export const a = 1\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  const task = await runFileTask(ctx, captured, '---\n源码路径: x\n---\n\n# a.js\n')
  expect(task.status).toBe('success')

  const idx = await readJson(join(booksRoot(), projectKey(root), 'index.json'))
  // 条目结构对齐 file-doc.mjs：{'源码路径','文档'}；stem 由宿主 computeDocStem 算（src-a）
  expect(idx['文件层']).toEqual([{ '源码路径': basename(root) + '/src/a.js', '文档': '文件摘要/src-a.md' }])
  expect(idx['目录层']).toEqual([])
  expect(idx['源码层']).toEqual([])
  expect(idx['项目根']).toBe(root)
})

it('gen-doc（L2）：产物仍是骨架（占位未填）→ 置 error，不写索引', async () => {
  const root = await newRoot('fs-gen-file-placeholder-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), 'export const a = 1\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  const placeholder = FILE_DOC_PLACEHOLDERS[0]
  if (placeholder === undefined) throw new Error('FILE_DOC_PLACEHOLDERS 为空')
  const task = await runFileTask(ctx, captured, '> **解决什么问题**：' + placeholder + '\n')
  expect(task.status).toBe('error')
  expect(task.error).toMatch(/仍是骨架/)

  const idx = await readJson(join(booksRoot(), projectKey(root), 'index.json'))
  expect(idx['文件层']).toEqual([])
})

it('gen-doc（L2）：产物被清空（0 字节）→ 置 error，不写索引', async () => {
  const root = await newRoot('fs-gen-l2-empty-root-')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), 'export const a = 1\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)
  // 子 agent 用试探性/错误的 write 把 DOC 清空成 0 字节（#15）
  const task = await runFileTask(ctx, captured, '')
  expect(task.status).toBe('error')
  expect(task.error).toMatch(/产物为空/)
  const idx = await readJson(join(booksRoot(), projectKey(root), 'index.json'))
  expect(idx['文件层']).toEqual([])
})

// ---- P5 覆盖率补齐（**新增**，非源用例迁移）----
// `src/host/translate-executor.ts` 在本仓没有任何专属 spec；源 gen-scope 的 translate 用例
// （源 :453）只断言装配与提示词、**不断言任务状态**，子 agent 在该用例里什么都没写 → 宿主收尾
// 走 verify 的失败分支。于是执行器的成功收尾（verify 通过 → upsertBookIndex → success → dispose）
// 在全部 spec 里都不被覆盖。这里用同一套装置补一条真实集成路径，断言不弱于源用例的粒度。

/** 从该会话的提示词里取宿主算好的**译文**绝对路径（翻译层变量名为「译文文档 DOC」）。 */
function trDocAbsFrom(rec: { followup?: FollowupMessage }): string {
  const matched = /译文文档 DOC = (\S+)/.exec(followupText(rec))
  const path = matched ? matched[1] : undefined
  if (path === undefined) throw new Error('提示词里没有「译文文档 DOC」变量')
  return path
}

/**
 * 跑一次翻译任务：onIdle 模拟子 agent 把译文写到宿主下发的路径。
 * @param ctx - 已 apply 的宿主 ctx。
 * @param captured - 捕获对象；onIdle 由本函数安装。
 * @param docContent - 要写出的译文正文；null 表示子 agent 什么都不做（空转）。
 * @returns 收尾后的任务记录。
 */
async function runTranslateTask(ctx: HostCtx, captured: Captured, docContent: string | null): Promise<GenTask> {
  captured.onIdle = docContent === null ? undefined : async () => {
    const doc = trDocAbsFrom(captured)
    await mkdir(dirname(doc), { recursive: true })
    await writeFile(doc, docContent, 'utf8')
  }
  const handle = handleOf(ctx).handle
  const out = await call(handle, createReq('POST', '/api/fs/translate', { path: 'doc.md' }), 'translate')
  expect(out.status).toBe(200)
  return await waitSettled(handle, out.json.taskId as string)
}

it('translate：子 agent 写出译文 → 置 success，宿主写「文章翻译」索引条目（P5 覆盖率补齐，非源用例）', async () => {
  const root = await newRoot('fs-tr-success-root-')
  await writeFile(join(root, 'doc.md'), '# t\n', 'utf8')
  const captured: Captured = {}
  const ctx = createCtx(root, captured)
  apply(ctx)

  const task = await runTranslateTask(ctx, captured, '---\n源码路径: x\n---\n\n# t（中文译文）\n\n译文正文\n')
  expect(task.status).toBe('success')
  expect(task.error).toBeNull()

  const idx = await readJson(join(booksRoot(), projectKey(root), 'index.json'))
  expect(idx['文章翻译']).toEqual([{
    '源码路径': basename(root) + '/doc.md',
    '文档': '文章翻译/' + basename(root) + '-doc.md',
  }])
  expect(idx['项目根']).toBe(root)
})
