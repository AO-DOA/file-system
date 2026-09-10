// 生成执行器：runGenDoc —— L1/L2/L3 共用的后台生成流程。
// 2026-09-10 能力目录化重构时从 src/host/index.js 抽出：执行器只认「能力描述符」，
// 不再出现按 kind 的硬编码分支；能力的骨架、校验、提示词都在 src/host/abilities/<name>/ 内。
import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GEN_CWD_SEG, booksRoot, formatStamp, renderPromptTemplate, resolveIn,
} from './fs-utils.ts'
import { abilityOf } from './abilities/registry.ts'
import { upsertBookIndex } from './book-index.ts'
import type { BookStore } from './book-store.ts'
import { TASK_TIMEOUT_MS, genAgentPreset, onDisposeFailure, withTimeout } from './task-utils.ts'
import { ZH } from '../shared/locale.ts'

// ---- 注入面（类型层，运行时无对应物）----
// 与 src/host/index.ts 同一策略：只声明真正触达的成员，不 import 具体服务包，
// 也不对 cordis `Context` 做声明合并（见 PROGRESS.md D-6）。

/** 宿主上下文最小面：执行器只用 ctx.get(name) 取服务。 */
interface HostContextSurface {
  get(name: string): unknown
}

/** 子 agent 句柄：可补一条 user message、可等空闲、可释放。 */
interface GenAgentHandle {
  agent: {
    followup(message: unknown): void
    whenIdle(): Promise<void>
  }
  dispose(): Promise<void>
}

/** agentLoop 服务：创建免 parent 的后台子 agent（选项形状与源逐字一致）。 */
interface AgentLoopSurface {
  createAgent(ctx: unknown, options: GenAgentCreateOptions): Promise<GenAgentHandle>
}

/** createAgent 入参：会话 id、cwd/预设等 meta、模型路由、挂预设与收敛工具面的 setup。 */
interface GenAgentCreateOptions {
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
  loadAbilityPrompt: (ability: GenAbility) => Promise<string | null>
}

/** 问题台账面：目录、下一个序号、收尾补索引行。 */
interface IssuesSurface {
  issuesDir: () => string
  nextIssueNoFromDisk: () => Promise<string>
  syncIssueIndex: () => Promise<void>
}

/**
 * 执行器触达的能力描述符字段面。
 *
 * `abilities/registry.ts` 的 `AbilityDescriptor` 未导出，故这里按执行器真正用到的字段声明结构面。
 * 各字段语义与 `abilities/README.md` 一致；可选钩子用方法语法声明，以便各能力用更窄的入参类型实现
 * （TS 方法参数双变，与 registry.ts 的登记方式同效）。
 */
interface GenAbility {
  kind: string
  dir: string
  sub: string
  arr: string
  layer: string
  scope: string
  promptFile: string
  hostIndex?: boolean
  skeletonFile?: boolean
  hostBuild?: boolean
  // 去技能化后各能力描述符都不再有该字段（模板亦不再引用）；变量仍渲染，值为 undefined 时
  // renderPromptTemplate 原样保留占位符——与源 `ability.skill` 的取值逐字一致。
  skill?: string
  docStem(target: { key: string; abs: string }): string
  skeleton?(ctx: SkeletonInput): string | Promise<string>
  verify?(ctx: VerifyInput): void | Promise<void>
  finalize?(ctx: FinalizeInput): void | Promise<void>
}

/** 骨架渲染入参：执行器下发的目标参数（各能力只取自己需要的字段）。 */
interface SkeletonInput {
  abs: string
  targetKey: string
  docStem: string
  layer: string
  generatedAt: string
}

/** 收尾校验入参：产物路径、派发前的 stat、目标与骨架路径（各能力只取自己需要的字段）。 */
interface VerifyInput {
  docAbs: string
  prevStat: { mtimeMs: number; size: number } | null
  abs: string
  rel: string
  skeletonPath?: string
  targetKey?: string
  layer?: string
  generatedAt?: string
}

/** 宿主构建产物入参：L3 finalize 解析骨架 → 排版 → 自检 → 写 DOC → 删骨架。 */
interface FinalizeInput {
  docAbs: string
  skeletonPath: string
  targetKey: string
  layer: string
  generatedAt: string
  abs: string
}

/** 内联回退提示词的变量面（提示词模板缺失时用；字段与派发点下发的变量同名）。 */
interface FallbackVars {
  abs: string
  docAbs: string
  docStem: string
  skeleton: string
  skeletonPath: string
  skeletonLines: number
  targetKey: string
  bookDir: string
  projectRoot: string
}

/** 后台生成任务的状态（与 index.ts 的状态机同四态）。 */
type GenTaskStatus = 'pending' | 'running' | 'success' | 'error'

/** 执行器装配入参：全部由 index.ts 的 apply 闭包提供（无默认值、无全局状态）。 */
export interface GenExecutorDeps {
  ctx: HostContextSurface
  bookStore: Pick<BookStore, 'bookTargetFor' | 'ensureBookDirAt' | 'invalidateDocCache'>
  promptLoader: PromptLoaderSurface
  issues: IssuesSurface
  applyGenScope: (agentCtx: AgentCtxSurface | undefined, kind: string) => void
  resolveAgentOptions: () => unknown
  setGenTaskStatus: (id: string, status: GenTaskStatus, error?: unknown) => void
}

/** runGenDoc 的形状：rel 为工作区相对路径、kind 为能力 kind、taskId 为任务状态机里的 id。 */
export type RunGenDoc = (rel: string, kind: string, taskId: string) => Promise<void>

// 技能根 <插件根>/skills：四层模板均已不引用（L1/L2/L3 已去技能化，翻译层本就无技能），
// 变量仍渲染，仅为兼容旧模板与「技能保留供人工调用」的场景。
// 两个候选覆盖源码直载（src/host → 插件根）与打包后（dsh/ → 插件根）。
const HERE: string = dirname(fileURLToPath(import.meta.url))
const SKILLS_ROOT: string = existsSync(join(HERE, '..', '..', 'skills'))
  ? resolve(HERE, '..', '..', 'skills')
  : resolve(HERE, '..', 'skills')

/**
 * 生成执行器工厂。
 * @param deps - 宿主上下文与服务面（ctx、书库定位、提示词加载、台账、工具面收敛、模型路由、任务状态）。
 * @returns runGenDoc：一次 L1/L2/L3 后台生成任务的完整编排。
 */
export function createGenExecutor(deps: GenExecutorDeps): RunGenDoc {
  const {
    ctx, bookStore, promptLoader, issues, applyGenScope, resolveAgentOptions, setGenTaskStatus,
  } = deps
  const { bookTargetFor, ensureBookDirAt, invalidateDocCache } = bookStore
  const { loadAbilityPrompt } = promptLoader
  const { issuesDir, nextIssueNoFromDisk, syncIssueIndex } = issues

  // 统一工作目录 $DSH_HOME/books/session：既是子 agent 的 cwd，也是 gen-src 模板里临时骨架的
  // 落地位（骨架必须落在书库/源码之外，避免污染被分析的项目）。
  async function ensureGenCwd(): Promise<string> {
    const dir = join(booksRoot(), GEN_CWD_SEG)
    await fsp.mkdir(dir, { recursive: true })
    return dir
  }

  // 未迁移提示词时的内联回退：四层均已去技能化，均不含技能/shell 调用（与各自工具面一致）。
  function fallbackPrompt(ability: GenAbility, v: FallbackVars): string {
    if (ability.kind === 'folder') {
      return [
        '任务：为【' + v.abs + '】这一个文件夹写目录层（L1）说明，产物写入【' + v.docAbs + '】。',
        '严格要求：只生成这一篇；不递归子文件夹；不为其它文件夹生成第二篇。',
        '骨架（frontmatter 三行、标题、路径、目录树均为宿主算好的确定值，必须逐字保留）：',
        v.skeleton,
        '步骤：1) 通读骨架；2) 更新模式先读现有文档 ' + v.docAbs + ' 作基线；3) 只读 TARGET 的直接子文件前 30 行判断职责（不递归、不列目录）；',
        '4) 用写文件工具把「骨架 + 三处语义填充」整篇写入 ' + v.docAbs + '（UTF-8）：标题后一句话职责 + 2-4 句补充、子目录表写一行「无」、文件表每个文件一行职责；',
        '5) 验收：frontmatter 三行与目录树与骨架逐字一致、无 <...> 占位残留、只产出这一篇。',
        '不要手写 frontmatter 或「生成时间」，不要写 index.json（宿主负责）；本层没有技能与 shell 工具，不要尝试调用技能或脚本。',
      ].join('\n')
    }
    if (ability.kind === 'file') {
      return [
        '任务：为【' + v.abs + '】这一个文件写文件层（L2）文档，产物写入【' + v.docAbs + '】。',
        '严格要求：只生成这一篇；不为其它文件/文件夹生成第二篇。',
        '骨架（frontmatter 三行、标题、路径、四个章节标题、导出表头均为宿主算好的确定值，必须逐字保留）：',
        v.skeleton,
        '步骤：1) 通读骨架；2) 更新模式先读现有文档 ' + v.docAbs + ' 作基线；3) 通读目标文件（>800 行分段读）；4) 用 glob/grep 查引用关系（谁引用本文件的导出、本文件 import 了谁）；',
        '5) 用写文件工具把「骨架 + 五段正文」整篇写入 ' + v.docAbs + '（UTF-8）：解决什么问题 / 核心概念 / 主线走查 / 在整体中的位置 / 导出接口速查表；',
        '6) 验收：frontmatter 三行与骨架逐字一致、五段齐备、无 <...> 占位残留、只产出这一篇。',
        '不要手写 frontmatter 或「生成时间」，不要写 index.json（宿主负责）；本层没有技能与 shell 工具。',
      ].join('\n')
    }
    // L3（2026-09-10 去技能化）：无技能、无脚本、无 shell；骨架已落盘，模型分批 edit 填空，
    // 产物由宿主构建——故这里只交代骨架路径、分批纪律与「不要写产物」。
    return [
      '任务：为【' + v.abs + '】这一个文件写源码层（L3）逐行注解。产物文档 DOC 由宿主构建并写入，你只填骨架、不要写 DOC。',
      '严格要求：只注解这一个文件；绝不为其它文件/文件夹生成第二篇。',
      '骨架已由宿主落盘（填空题）：' + v.skeletonPath + '（共 ' + String(v.skeletonLines) + ' 行），每处「注解: 」后就是你要填的中文释义。',
      '步骤：1) 用 read 读骨架（太长就用 offset/limit 分段读）；2) 更新模式先读现有文档 ' + v.docAbs + ' 作基线；',
      '3) 用 edit 分批填空：每批只改「注解: 」之后的内容，行号与「代码: 」行不动；批大小按自身输出预算自选，单批不得逼近输出上限，禁止用 write 整篇重写骨架；',
      '4) 填最上面的「@摘要」；5) 验收：骨架里每个「注解: 」后都有中文，行号与代码行与你读到的一致。',
      '不要手写产物 DOC、frontmatter 或 index.json（全部由宿主负责）；本层没有技能与 shell 工具，不要尝试调用技能或脚本。',
    ].join('\n')
  }

  return async function runGenDoc(rel: string, kind: string, taskId: string): Promise<void> {
    const ability: GenAbility | undefined = abilityOf(kind)
    if (!ability) throw new Error(ZH.errUnknownGenKindWith + kind)
    const agentLoop = ctx.get('agentLoop') as AgentLoopSurface | undefined
    if (!agentLoop) throw new Error(ZH.errAgentLoopUnavailable)
    // 写定向：目标归属「包含它的最深已知项目根」的桶（跨工作区共享，单一事实源）；
    // stem/「源码路径」键/docRel 全部用归属根视角，与 /tree 判定同一规则。
    const target = await bookTargetFor(rel)
    const abs = target.abs
    const targetKey = target.key
    const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
    const sessionId = 'fs-' + randomUUID()
    // 继承当前 initiator agent 的模型路由（provider/model/reasoningEffort），否则子 agent 的
    // system-prompt 中 {{model}}/{{provider}} 变量为空导致 assembly 报错（standard 预设的
    // persona 同样使用 {{model}}/{{cwd}} 模板，因此必须提供有效的模型路由）。
    const agentOptions = resolveAgentOptions()
    // 桶先于 agent 建好：setup 闭包内要读 bookDir 组规范段，晚建会命中 TDZ。
    await ensureBookDirAt(target.bookRoot)
    const bookDir = target.bookRoot.dir
    // cwd 固定为统一工作目录（会话集中）；不设 meta.origin='subagent'——该标记语义是
    // 导航过滤（GUI 会话列表不显示）+ 普通会话路由拒绝访问（session/agent-busy），
    // 会让生成会话既找不到也打不开。本插件要的是「后台执行」，不是子 agent 身份。
    const cwd = await ensureGenCwd()
    const docStem = ability.docStem(target)
    const docAbs = resolveIn(bookDir, ability.sub + '/' + docStem + '.md')
    const prevStat = await fsp.stat(docAbs).catch((): null => null)
    const isUpdate = !!(prevStat && !prevStat.isDirectory())
    // 生成时间：骨架与提示词共用同一时间戳（L1/L2/L3 的 frontmatter 由宿主渲染/构建时写入，
    // 翻译层无技能脚本参与，frontmatter 由模型照抄宿主给的这个值）。
    const generatedAt = formatStamp(new Date())
    // 骨架（L1/L2）：由能力自己渲染后作为 ${skeleton} 注入提示词，模型只填内容并整篇写回。
    // 骨架不落盘、不预先写 docAbs：更新模式仍能读到旧文档作基线，空转校验也继续有效。
    const skeleton = ability.skeleton
      ? await ability.skeleton({ abs, targetKey, docStem, layer: ability.layer, generatedAt })
      : ''
    // L3（skeletonFile）：骨架 ≈ 源码全文×1.5（482 行源码 ≈ 40KB），注入提示词既挤占上下文，
    // 又让模型无法按需分段读——改为落盘到子 agent 的 cwd（书库与源码之外，不污染被分析的项目），
    // 提示词只给绝对路径，模型用 read 分段读、edit 分批填空。
    // 文件名带 taskId：cwd 是进程级唯一目录（$DSH_HOME/books/session），而 basename 与 docStem
    // 都不足以区分并发的两个任务（src/a.js 与 lib/a.js 的 basename 同为 a.js、跨项目同名文件的
    // docStem 也相同）。共用骨架会让先完成者的 finalize 删掉对方仍在用的骨架，后完成者 verify
    // 读不到骨架而报「骨架文件不存在」——按任务唯一命名才不会互相踩。
    const skeletonPath = ability.skeletonFile && skeleton
      ? join(cwd, 'skeleton-' + taskId + '.txt')
      : ''
    if (skeletonPath) await fsp.writeFile(skeletonPath, skeleton, 'utf8')
    // 骨架行数下发给提示词：模型据此决定要不要分段读（未落盘的层为 0）。
    const skeletonLines = skeletonPath ? String(skeleton).split('\n').length : 0
    // 提示词真源：abilities/<能力目录>/prompt.md（每次派发读盘，改提示词免 build/免重启）。
    const tpl = await loadAbilityPrompt(ability)
    const spec = tpl ? renderPromptTemplate(tpl, {
      skill: ability.skill,
      target: abs,
      bookDir,
      projectRoot: target.bookRoot.projectRoot,
      targetKey,
      docPath: docAbs,
      docStem,
      srcName: basename(abs),
      cwd,
      generatedAt,
      skeleton,
      skeletonPath,
      skeletonLines,
      layer: ability.layer,
      arr: ability.arr,
      mode: isUpdate ? '更新' : '首次',
      // 更新模式的提示随层不同：
      //   · hostBuild（L3）：产物由宿主构建，旧文档只作基线，读它不受任何写操作影响；
      //   · hostIndex（L1/L2）：宿主渲染骨架、模型整篇写回，只需在写产物之前读旧文档作基线；
      //   · 其余（翻译）：模型自己先写骨架再分段追加，旧文档必须在写骨架之前读（步骤 2 会把它冲掉）。
      modeHint: isUpdate
        ? (ability.hostBuild
          ? '更新前先读现有文档 ' + docAbs + '，记下已写明的职责与措辞作基线（必须在填注解之前完成）；只改与当前实际内容不符的部分，保留仍正确的措辞。'
          : (ability.hostIndex
            ? '更新前先读现有文档 ' + docAbs + '，记下已写明的职责与措辞作基线（必须在写产物之前完成）；只改与当前实际内容不符的部分，保留仍正确的措辞。'
            : '更新前先读现有文档 ' + docAbs + '，记下已写明的职责、子项与措辞（必须在步骤 2 之前完成——步骤 2 会把它打回模板占位符）；以旧文档为基线，只改与当前实际内容不符的部分，保留仍正确的措辞。'))
        : '从零读目标自身建立语义。',
      skillsRoot: SKILLS_ROOT,
      // 问题台账：由执行任务的子 agent 本人写（它才知道现场出了什么错）；宿主只下发
      // 目录/日期/序号，并在收尾时把索引表补一行。
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
        // 工具面由能力描述符的 scope 决定（L1 read/write、L2 read/write/glob/grep、L3 read/write/edit）。
        applyGenScope(agentCtx, ability.scope)
      },
    })
    setGenTaskStatus(taskId, 'running')
    try {
      const agent = handle.agent
      // 任务提示词只注入 user message（2026-09-10 去重）：与 system 段注入相比少一份逐字
      // 重复（两条通道都计费），且 system prompt 保持跨任务稳定、对前缀缓存友好。
      const prompt = spec || fallbackPrompt(ability, {
        abs, docAbs, docStem, skeleton, skeletonPath, skeletonLines, targetKey, bookDir,
        projectRoot: target.bookRoot.projectRoot,
      })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
      // whenIdle 加超时竞速：子 agent 挂死时 10min 后置任务 error 并释放句柄，不再无限等待。
      await withTimeout(agent.whenIdle(), TASK_TIMEOUT_MS)
      // 子 agent 若已自记问题台账，宿主把索引表补齐（文件是权威、索引是视图）；
      // 失败不影响任务状态判定，仅告警。
      await syncIssueIndex().catch((err: unknown) => {
        console.warn('[fs] 问题台账索引补齐失败: ' + String((err as Error | null | undefined)?.message || (err as string)))
      })
      // 空转校验：子 agent 可能正常结束却一次工具调用都没发出（实测：把输出预算全花在推理上），
      // 此时产物不存在或与派发前完全一致。不校验就置 success，用户会以为文档已生成（实测发生过）。
      // 例外：hostBuild 能力（L3）的产物由宿主 finalize 写盘，DOC 在派发前后都不是模型写的，
      // mtime/size 判据对「模型是否真的干活」完全失效——改由能力 verify 校验骨架的注解填充率。
      if (!ability.hostBuild) {
        const postStat = await fsp.stat(docAbs).catch((): null => null)
        if (!postStat || postStat.isDirectory()) {
          throw new Error(ZH.errGenNoArtifact + docAbs)
        }
        if (prevStat && postStat.mtimeMs === prevStat.mtimeMs && postStat.size === prevStat.size) {
          throw new Error(ZH.errGenArtifactStale + docAbs)
        }
      }
      // 宿主负责确定性收尾的能力：先做能力自带校验（L1/L2 占位残留、L3 注解填充率），
      // 再让能力构建产物（L3 的 finalize：解析骨架 → 排版 → 自检 → 写 DOC → 删骨架），
      // 最后写 index.json 对应数组——顺序固定，索引条目始终指向真实落盘的文档；
      // 任一步失败即置任务 error，不产生半成品索引（L3 自检失败时连 DOC 都不写）。
      if (ability.hostIndex) {
        if (typeof ability.verify === 'function') {
          await ability.verify({ docAbs, prevStat, abs, rel, skeletonPath, targetKey, layer: ability.layer, generatedAt })
        }
        if (ability.hostBuild && typeof ability.finalize === 'function') {
          await ability.finalize({ docAbs, skeletonPath, targetKey, layer: ability.layer, generatedAt, abs })
        }
        await upsertBookIndex(target.bookRoot, ability.arr, { '源码路径': targetKey, '文档': ability.sub + '/' + docStem + '.md' })
      }
      setGenTaskStatus(taskId, 'success')
      // 子 agent 完成后释放句柄；释放失败仅记录：任务状态已落盘（success），
      // 前端轮询收尾不依赖 dispose；子 agent 侧资源泄漏由 agentLoop 兜底回收。
      await handle.dispose().catch(onDisposeFailure)
    } catch (err) {
      setGenTaskStatus(taskId, 'error', err)
      // 失败/超时后同样释放句柄（超时意味着子 agent 可能仍在生成，尽早终止防烧 token）；
      // 释放失败仅记录：任务状态已置错，前端轮询收尾不依赖 dispose。
      await handle.dispose().catch(onDisposeFailure)
    } finally {
      // 惰性方案 + 短缓存：主动失效文档集合缓存，下一次 /tree 即见到新落盘文档的圆点。
      invalidateDocCache()
    }
  }
}
