// 翻译执行器：runTranslate —— 项目内 md 文档 → 简体中文译文。
// 2026-09-10 能力目录化重构时从 src/host/index.js 抽出；能力专属的前置校验（源文存在/大小/
// 语种）与收尾校验（译文落盘/未更新）在 abilities/translate-doc/index.js，执行器只编排。
import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { GEN_CWD_SEG, booksRoot, formatStamp, renderPromptTemplate, resolveIn } from './fs-utils.ts'
import { TRANSLATE_ABILITY } from './abilities/registry.ts'
import { upsertBookIndex } from './book-index.ts'
import type { BookStore } from './book-store.ts'
import { TASK_TIMEOUT_MS, genAgentPreset, onDisposeFailure, withTimeout } from './task-utils.ts'

// ---- 注入面（类型层，运行时无对应物）----
// 与 gen-executor.ts 同一策略：只声明真正触达的成员，不 import 具体服务包。

/** 宿主上下文最小面：执行器只用 ctx.get(name) 取服务。 */
interface HostContextSurface {
  get(name: string): unknown
}

/** 子 agent 句柄：可补一条 user message、可等空闲、可释放。 */
interface TranslateAgentHandle {
  agent: {
    followup(message: unknown): void
    whenIdle(): Promise<void>
  }
  dispose(): Promise<void>
}

/** agentLoop 服务：创建免 parent 的后台子 agent（选项形状与源逐字一致）。 */
interface AgentLoopSurface {
  createAgent(ctx: unknown, options: TranslateAgentCreateOptions): Promise<TranslateAgentHandle>
}

/** createAgent 入参：会话 id、cwd/预设等 meta、模型路由、挂预设与收敛工具面的 setup。 */
interface TranslateAgentCreateOptions {
  sessionId: string
  meta: { cwd: string; agentPreset: string }
  agentOptions: unknown
  setup(agentCtx: AgentCtxSurface | undefined): Promise<void>
}

/** 子 agent 上下文：applyGenScope 只触达 tools.restrict（与 index.ts 的声明同形）。 */
interface AgentCtxSurface {
  tools?: { restrict?: (options: { allow: string[] }) => void }
}

/** agentPresets 服务：把预设挂到子 agent 的上下文上。 */
interface AgentPresetsSurface {
  mount(agentCtx: unknown, preset: string): Promise<void>
}

/** 提示词加载器：按能力目录读模板；读不到返回 null（调用方回退内联文本）。 */
interface PromptLoaderSurface {
  loadAbilityPrompt: (ability: TranslateAbility) => Promise<string | null>
}

/** 问题台账面：目录、下一个序号、收尾补索引行。 */
interface IssuesSurface {
  issuesDir: () => string
  nextIssueNoFromDisk: () => Promise<string>
  syncIssueIndex: () => Promise<void>
}

/**
 * 执行器触达的翻译能力字段面。
 *
 * `abilities/registry.ts` 的 `AbilityDescriptor` 未导出，故这里按执行器真正用到的字段声明结构面；
 * 可选钩子用方法语法声明，以便能力用更窄的入参类型实现（TS 方法参数双变）。
 */
interface TranslateAbility {
  kind: string
  dir: string
  sub: string
  arr: string
  layer: string
  scope: string
  promptFile: string
  docStem(target: { key: string; abs: string }): string
  precheck?(ctx: PrecheckInput): void | Promise<void>
  // 收尾校验是翻译能力的必需钩子（源为无条件 `await ability.verify(...)`）：
  // registry.ts 把 verify 记成可选（L1/L2/L3 各有各的校验），此处按翻译能力的实际契约收紧。
  verify(ctx: VerifyInput): void | Promise<void>
}

/** 派发前校验入参：源文绝对路径与工作区相对路径。 */
interface PrecheckInput {
  abs: string
  rel: string
}

/** 收尾校输入参：译文路径、派发前的 stat、源文与相对路径（能力只取自己需要的字段）。 */
interface VerifyInput {
  docAbs: string
  prevStat: { mtimeMs: number; size: number } | null
  abs: string
  rel: string
}

/** 后台翻译任务的状态（与 index.ts 的状态机同四态）。 */
type GenTaskStatus = 'pending' | 'running' | 'success' | 'error'

/** 执行器装配入参：全部由 index.ts 的 apply 闭包提供（无默认值、无全局状态）。 */
export interface TranslateExecutorDeps {
  ctx: HostContextSurface
  bookStore: Pick<BookStore, 'bookTargetFor' | 'ensureBookDirAt' | 'invalidateDocCache'>
  promptLoader: PromptLoaderSurface
  issues: IssuesSurface
  applyGenScope: (agentCtx: AgentCtxSurface | undefined, kind: string) => void
  resolveAgentOptions: () => unknown
  setGenTaskStatus: (id: string, status: GenTaskStatus, error?: unknown) => void
}

/** runTranslate 的形状：rel 为工作区相对路径、taskId 为任务状态机里的 id。 */
export type RunTranslate = (rel: string, taskId: string) => Promise<void>

/**
 * 翻译执行器工厂。
 * @param deps - 宿主上下文与服务面（ctx、书库定位、提示词加载、台账、工具面收敛、模型路由、任务状态）。
 * @returns runTranslate：一次「项目内 md → 简体中文译文」后台翻译任务的完整编排。
 */
export function createTranslateExecutor(deps: TranslateExecutorDeps): RunTranslate {
  const {
    ctx, bookStore, promptLoader, issues, applyGenScope, resolveAgentOptions, setGenTaskStatus,
  } = deps
  const { bookTargetFor, ensureBookDirAt, invalidateDocCache } = bookStore
  const { loadAbilityPrompt } = promptLoader
  const { issuesDir, nextIssueNoFromDisk, syncIssueIndex } = issues
  // 断言而非标注：registry 把 verify 记成可选（L1/L2/L3 各有各的校验），翻译能力的契约是必需，
  // 源实现同样是无条件 `await ability.verify(...)`——这里只收紧类型、不改运行时。
  const ability = TRANSLATE_ABILITY as TranslateAbility

  // 统一工作目录 $DSH_HOME/books/session（与生成任务同一 cwd，理由见 gen-executor.js）。
  async function ensureGenCwd(): Promise<string> {
    const dir = join(booksRoot(), GEN_CWD_SEG)
    await fsp.mkdir(dir, { recursive: true })
    return dir
  }

  return async function runTranslate(rel: string, taskId: string): Promise<void> {
    const agentLoop = ctx.get('agentLoop') as AgentLoopSurface | undefined
    if (!agentLoop) throw new Error('agentLoop 服务不可用')
    // 写定向：目标归属「包含它的最深已知项目根」的桶（与 /tree、runGenDoc 同一规则）。
    const target = await bookTargetFor(rel)
    const abs = target.abs
    // 启动前校验（能力自带）：源文存在且为文件、不超读上限、不是简体中文。目标缺失时立即失败，
    // 避免子 agent 自由发挥找到别的 md 翻译（实测风险：子 agent glob 后多翻译了无关文件）。
    if (typeof ability.precheck === 'function') await ability.precheck({ abs, rel })
    const targetKey = target.key
    const docStem = ability.docStem(target)
    // 写永远只写目标归属的新桶：先幂等确保该桶；resolveIn 在桶根下做语义等价校验
    // （书库在白名单根下），防 ../ 越权。
    await ensureBookDirAt(target.bookRoot)
    const dstAbs = resolveIn(target.bookRoot.dir, ability.sub + '/' + docStem + '.md')
    const fileName = basename(rel)
    const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
    const sessionId = 'fs-' + randomUUID()
    const agentOptions = resolveAgentOptions()
    // cwd 固定为统一工作目录（会话集中）；同样不打 subagent 标（理由见 gen-executor.js）；
    // 工具面由能力描述符的 scope 收敛到「读源 + 写骨架 + 编辑追加」。
    const cwd = await ensureGenCwd()
    // 提示词真源 abilities/translate-doc/prompt.md：本层工具面无 skill/bash，模板内不调用技能
    // 脚本；确定性部分由宿主兜底（校验译文落盘 + 宿主自己 upsert index.json）。
    // frontmatter 的「生成时间」只能由宿主给：模型拿不到当前时间，硬编会与其它层格式不一致。
    const tpl = await loadAbilityPrompt(ability)
    const prevStat = await fsp.stat(dstAbs).catch((): null => null)
    const isUpdate = !!(prevStat && !prevStat.isDirectory())
    const generatedAt = formatStamp(new Date())
    const spec = tpl ? renderPromptTemplate(tpl, {
      target: abs,
      docPath: dstAbs,
      targetKey,
      srcName: fileName,
      layer: ability.layer,
      arr: ability.arr,
      mode: isUpdate ? '更新' : '首次',
      modeHint: isUpdate
        ? '目标译文已存在，本次整体覆盖重译：开始前先读现有译文，沿用其中已定稿的术语译法，避免同一术语前后不一致。'
        : '从零翻译源文档。',
      generatedAt,
      // 问题台账：由执行任务的子 agent 自己写（它才知道本轮出了什么错）。宿主只负责
      // 算好目录/日期/序号三个确定性变量，并在收尾时把索引表补一行。
      issueDir: issuesDir(),
      issueDate: generatedAt.slice(0, 10),
      issueNo: await nextIssueNoFromDisk(),
    }) : null
    const handle = await agentLoop.createAgent(ctx, {
      sessionId,
      meta: { cwd, agentPreset: genAgentPreset() },
      agentOptions,
      setup: async (agentCtx: AgentCtxSurface | undefined): Promise<void> => {
        const presets = ctx.get('agentPresets') as AgentPresetsSurface | undefined
        if (presets) await presets.mount(agentCtx, genAgentPreset())
        applyGenScope(agentCtx, ability.scope)
      },
    })
    setGenTaskStatus(taskId, 'running')
    try {
      const agent = handle.agent
      // 任务提示词只注入 user message（理由同 gen-executor.js）；模板缺失时回退内联文本。
      const prompt = spec || [
        '任务：把 Markdown 文档【' + abs + '】翻译为简体中文，并把译文写入【' + dstAbs + '】。',
        '严格要求：只处理以上这一篇文档，只写以上这一个目标文件，绝不翻译/修改任何其它文件（不要搜索目录、不要 glob、不要批量）。',
        '步骤：1) 用读文件工具读取 ' + abs + ' 全文（若读不到，直接报告失败并停止）；',
        '2) 忠实翻译为简体中文：不增删内容、不改义，标题/列表/表格/引用/链接等结构一一对应；',
        '3) 特殊名词（专有名词、技术术语、产品名、API/命令/包名等）首次出现保留原文，就地写「原文（中文解释）」，如 CRLF（回车换行）、WebSocket（全双工通信协议）；同篇再次出现直接用原文，不重复解释；普通英文词按含义翻译，不给变量名/普通英文词加（中文）括号；',
        '4) 代码块、行内代码、文件路径、URL 保留原文不翻译；代码块内注释可翻译，代码本身不变；frontmatter 键名不翻译；',
        '5) 用写文件工具把以下完整内容写入 ' + dstAbs + '（UTF-8），其中 <译文正文> 处替换为你实际翻译的全文（即从文档第一个标题开始到结尾的 markdown 正文，原样翻译、结构对应；不得保留 <译文正文> 占位字样）：',
        '---',
        '源码路径: ' + targetKey,
        '层级: ' + ability.layer,
        '生成时间: ' + generatedAt,
        '---',
        '',
        '# ' + fileName + '（中文译文）',
        '',
        '**路径**：' + targetKey,
        '',
        '<译文正文>',
      ].join('\n')
      agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
      // whenIdle 加超时竞速：翻译子 agent 挂死时 10min 后置任务 error 并释放句柄。
      await withTimeout(agent.whenIdle(), TASK_TIMEOUT_MS)
      // 子 agent 若已自记问题台账，宿主把索引表补齐（文件是权威、索引是视图）；失败仅告警。
      await syncIssueIndex().catch((err: unknown) => {
        console.warn('[fs] 问题台账索引补齐失败: ' + String((err as Error | null | undefined)?.message || (err as string)))
      })
      // 收尾校验（能力自带）：译文确实落盘；更新模式下还要确认内容真的变了。
      await ability.verify({ docAbs: dstAbs, prevStat, abs, rel })
      // 索引由宿主写（不交给模型）。
      await upsertBookIndex(target.bookRoot, ability.arr, { '源码路径': targetKey, '文档': ability.sub + '/' + docStem + '.md' })
      setGenTaskStatus(taskId, 'success')
      // 子 agent 完成后释放句柄；释放失败仅记录：任务状态已落盘（success），
      // 前端轮询收尾不依赖 dispose；子 agent 侧资源泄漏由 agentLoop 兜底回收。
      await handle.dispose().catch(onDisposeFailure)
    } catch (err) {
      setGenTaskStatus(taskId, 'error', err)
      // 失败/超时后同样释放句柄（超时意味着子 agent 可能仍在翻译，尽早终止防烧 token）。
      await handle.dispose().catch(onDisposeFailure)
    } finally {
      invalidateDocCache()
    }
  }
}
