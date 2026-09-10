/**
 * @vitest-environment node
 *
 * translate-executor（src/host/translate-executor.ts）单元测试。
 *
 * 迁移自迁移源的同名执行器（`src/host/translate-executor.js`，冻结于 3a3f89e），并按
 * PROGRESS.md D-2 把分支口径补到 100%：每条早退、每个三元与每条告警取值路径都有真实用例。
 *
 * 装置要点：
 *   · `@deepseek-ai/dsh-llm` 是 peerDependency（本仓 node_modules 里没有），用 vi.mock 提供
 *     `createUserMessage` 桩，成功路径才可达。
 *   · 前置校验（源文存在/大小/语种）与收尾校验（译文落盘/未更新）都在能力
 *     `abilities/translate-doc/index.ts` 里，本 spec 让它们**真实执行**（不 mock 能力），
 *     只有「能力没有 precheck 钩子」这一支用 doMock 注入假描述符触达。
 *   · 本文件用 `// @vitest-environment node`：host 面本就是 Node 代码，仓级 jsdom 对 host 语义
 *     无用（node:fs 相关 mock 在 jsdom 下还会整体失效，见 gen-executor.spec.ts 文件头）。
 *   · 书库桶与源文都落在 mkdtemp 临时目录（DSH_HOME 被 stub），真实 upsertBookIndex 写的是
 *     临时 index.json。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { computeDocStem } from '../src/host/fs-utils.ts'
import type { TranslateExecutorDeps } from '../src/host/translate-executor.ts'

// 未安装的 peer 依赖：记录每次 createUserMessage 的入参（提示词只注入 user message）。
const LLM = vi.hoisted((): { messages: unknown[] } => ({ messages: [] }))
vi.mock('@deepseek-ai/dsh-llm', () => ({
  createUserMessage: (message: unknown): unknown => {
    LLM.messages.push(message)
    return message
  },
}))

/** 注入面桩的可选项。 */
interface HarnessOptions {
  promptTemplate?: string | null
  withAgentLoop?: boolean
  withPresets?: boolean
  /** 子 agent 空闲时的动作（通常用来写译文）。 */
  onIdle?: (h: Harness) => Promise<void> | void
  disposeFails?: boolean
  syncFails?: boolean
  /** 抛出的原样值：非 Error（如字符串）时走告警里的第二条取值路径。 */
  syncError?: unknown
}

/** 一次性测试装置。 */
interface Harness {
  tmpRoot: string
  bucketDir: string
  abs: string
  dstAbs: string
  cwd: string
  status: Array<{ id: string; status: string; error: unknown }>
  scopes: Array<{ kind: string }>
  mounts: string[]
  created: Array<{ sessionId: string; meta: Record<string, unknown>; agentOptions: unknown }>
  ensured: string[]
  presetsSeen: unknown[]
  disposed: number
  invalidated: number
  followedUp: number
  run: (rel: string, taskId: string) => Promise<void>
}

// 提示词模板：把执行器下发的每个变量都渲染进文本，一条模板即可断言整张变量表。
const TEMPLATE = [
  'target=${target}',
  'docPath=${docPath}',
  'targetKey=${targetKey}',
  'srcName=${srcName}',
  'layer=${layer}',
  'arr=${arr}',
  'mode=${mode}',
  'modeHint=${modeHint}',
  'generatedAt=${generatedAt}',
  'issueDir=${issueDir}',
  'issueDate=${issueDate}',
  'issueNo=${issueNo}',
].join('\n')

const REL = 'docs/guide.md'
const KEY = 'docs/guide.md'
const SUB = '文章翻译'

let tmpRoot = ''

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'dsh-fs-transexec-'))
  vi.stubEnv('DSH_HOME', tmpRoot)
  vi.stubEnv('FS_GEN_PRESET', undefined)
  LLM.messages.length = 0
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.doUnmock('../src/host/abilities/registry.ts')
  vi.resetModules()
})

/**
 * 建装置：临时项目根 + 书库桶 + 英文源文（不会被语种预检拒绝）。
 * @param options - 覆盖项。
 * @returns 装置句柄；`run` 就是被测的 runTranslate。
 */
async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const projectRoot = join(tmpRoot, 'proj')
  const abs = join(projectRoot, REL)
  const bucketDir = join(tmpRoot, 'books', 'proj-key')
  const dstAbs = join(bucketDir, SUB, computeDocStem(KEY) + '.md')
  const cwd = join(tmpRoot, 'books', 'session')
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, '# Guide\n\nHello world, this is a short English document.\n', 'utf8')

  const { createTranslateExecutor } = await import('../src/host/translate-executor.ts')

  const status: Harness['status'] = []
  const scopes: Harness['scopes'] = []
  const mounts: string[] = []
  const created: Harness['created'] = []
  const ensured: string[] = []
  const presetsSeen: unknown[] = []
  const state = { disposed: 0, invalidated: 0, followedUp: 0 }

  const handle: Harness = {
    tmpRoot, bucketDir, abs, dstAbs, cwd, status, scopes, mounts, created, ensured, presetsSeen,
    get followedUp(): number { return state.followedUp },
    get disposed(): number { return state.disposed },
    get invalidated(): number { return state.invalidated },
    run: async (): Promise<void> => undefined,
  }

  const agentLoop = {
    createAgent: async (_ctx: unknown, opts: {
      sessionId: string
      meta: Record<string, unknown>
      agentOptions: unknown
      setup(agentCtx: unknown): Promise<void>
    }): Promise<unknown> => {
      created.push({ sessionId: opts.sessionId, meta: opts.meta, agentOptions: opts.agentOptions })
      await opts.setup({ tools: { restrict: (): void => undefined } })
      return {
        agent: {
          followup: (): void => { state.followedUp += 1 },
          whenIdle: async (): Promise<void> => {
            if (options.onIdle) await options.onIdle(handle)
          },
        },
        dispose: async (): Promise<void> => {
          state.disposed += 1
          if (options.disposeFails) throw new Error('dispose boom')
        },
      }
    },
  }

  const deps: TranslateExecutorDeps = {
    ctx: {
      get(name: string): unknown {
        if (name === 'agentLoop') return options.withAgentLoop === false ? undefined : agentLoop
        if (name === 'agentPresets') {
          if (options.withPresets === false) return undefined
          return {
            mount: async (agentCtx: unknown, preset: string): Promise<void> => {
              presetsSeen.push(agentCtx)
              mounts.push(preset)
            },
          }
        }
        return undefined
      },
    },
    bookStore: {
      // 按传入 rel 定向（源实现同样用 rel 解析绝对路径）：前置校验的「源文不存在」用例
      // 要靠它把执行器指向一个并不存在的路径。
      bookTargetFor: async (rel: string) => ({
        abs: join(projectRoot, rel),
        bookRoot: { projectRoot, bucket: 'proj-key', dir: bucketDir },
        relP: rel,
        key: rel,
      }),
      ensureBookDirAt: async (entry) => {
        ensured.push(entry.dir)
        await mkdir(entry.dir, { recursive: true })
      },
      invalidateDocCache: (): void => { state.invalidated += 1 },
    },
    promptLoader: { loadAbilityPrompt: async (): Promise<string | null> => options.promptTemplate ?? null },
    issues: {
      issuesDir: (): string => join(tmpRoot, 'issues'),
      nextIssueNoFromDisk: async (): Promise<string> => '03',
      syncIssueIndex: async (): Promise<void> => {
        if (options.syncError !== undefined) throw options.syncError
        if (options.syncFails) throw new Error('sync boom')
      },
    },
    applyGenScope: (_agentCtx, kind: string): void => { scopes.push({ kind }) },
    resolveAgentOptions: (): unknown => ({ provider: 'p', model: 'm' }),
    setGenTaskStatus: (id: string, taskStatus: string, error?: unknown): void => {
      status.push({ id, status: taskStatus, error })
    },
  }

  handle.run = createTranslateExecutor(deps)
  return handle
}

/** 写一份能被能力 verify 接受的译文。 */
async function writeTranslation(h: Harness, body = '# 指南（中文译文）\n\n你好，世界。\n'): Promise<void> {
  await mkdir(dirname(h.dstAbs), { recursive: true })
  await writeFile(h.dstAbs, body, 'utf8')
}

/** 读提示词文本（最后一条 user message）。 */
function promptOf(): string {
  const message = LLM.messages[LLM.messages.length - 1] as { content: Array<{ text: string }> }
  return message.content[0]?.text ?? ''
}

/** 任务状态序列。 */
function statuses(h: Harness): string[] {
  return h.status.map(s => s.status)
}

/** 任务被置 error 时的错误消息。 */
function errorMessage(h: Harness): string {
  const last = h.status[h.status.length - 1]
  return String((last?.error as Error | undefined)?.message ?? last?.error)
}

describe('runTranslate 前置校验', () => {
  it('agentLoop 服务不可用：抛错', async () => {
    const h = await harness({ withAgentLoop: false })
    await expect(h.run(REL, 't1')).rejects.toThrow('agentLoop 服务不可用')
    expect(h.created).toHaveLength(0)
  })

  it('源文已是简体中文：能力 precheck 拦下，不建子会话', async () => {
    const h = await harness()
    await writeFile(h.abs, '# 指南\n\n这是一段简体中文文档，不需要翻译。\n', 'utf8')
    await expect(h.run(REL, 't2')).rejects.toThrow('源文档已是简体中文，无需翻译')
    expect(h.created).toHaveLength(0)
  })

  it('源文不存在：能力 precheck 拦下', async () => {
    const h = await harness()
    await expect(h.run('docs/missing.md', 't3')).rejects.toThrow('源文档不存在')
  })

  it('源文是目录：同样判为不存在', async () => {
    const h = await harness()
    await rm(h.abs, { force: true })
    await mkdir(h.abs, { recursive: true })
    await expect(h.run(REL, 't4')).rejects.toThrow('源文档不存在')
  })

  it('源文超读上限：能力 precheck 拦下', async () => {
    const h = await harness()
    await writeFile(h.abs, 'x'.repeat(2 * 1024 * 1024 + 1), 'utf8')
    await expect(h.run(REL, 't5')).rejects.toThrow('源文档过大')
  })
})

describe('首次翻译成功路径', () => {
  it('变量表逐项下发、只注入 user message、收尾写索引并失效缓存', async () => {
    const h = await harness({
      promptTemplate: TEMPLATE,
      onIdle: async (hh): Promise<void> => { await writeTranslation(hh) },
    })
    await h.run(REL, 't6')

    expect(statuses(h)).toEqual(['running', 'success'])
    const text = promptOf()
    expect(text).toContain('target=' + h.abs)
    expect(text).toContain('docPath=' + h.dstAbs)
    expect(text).toContain('targetKey=' + KEY)
    expect(text).toContain('srcName=guide.md')
    expect(text).toContain('layer=' + SUB)
    expect(text).toContain('arr=' + SUB)
    expect(text).toContain('mode=首次')
    expect(text).toContain('modeHint=从零翻译源文档。')
    expect(text).toContain('issueNo=03')
    expect(text).toContain('issueDir=' + join(h.tmpRoot, 'issues'))
    expect(text).toMatch(/generatedAt=\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)

    // 子会话配置：预设默认 ptc、不打 origin:subagent 标、工具面收敛到 translate。
    expect(h.created).toHaveLength(1)
    expect(h.created[0]?.meta['agentPreset']).toBe('ptc')
    expect('origin' in (h.created[0]?.meta ?? {})).toBe(false)
    expect(h.created[0]?.sessionId.startsWith('fs-')).toBe(true)
    expect(h.followedUp).toBe(1)
    expect(h.mounts).toEqual(['ptc'])
    expect(h.presetsSeen).toHaveLength(1)
    expect(h.scopes).toEqual([{ kind: 'translate' }])
    expect(h.ensured).toEqual([h.bucketDir])
    expect(h.disposed).toBe(1)
    expect(h.invalidated).toBe(1)

    // index.json 的「文章翻译」条目指向真实落盘的译文。
    const idx = JSON.parse(await readFile(join(h.bucketDir, 'index.json'), 'utf8')) as {
      文章翻译: Array<Record<string, string>>
    }
    expect(idx.文章翻译).toEqual([{ 源码路径: KEY, 文档: SUB + '/' + computeDocStem(KEY) + '.md' }])
  })

  it('无 agentPresets 服务：跳过挂载，工具面仍收敛', async () => {
    const h = await harness({
      promptTemplate: TEMPLATE,
      withPresets: false,
      onIdle: async (hh): Promise<void> => { await writeTranslation(hh) },
    })
    await h.run(REL, 't7')
    expect(h.mounts).toEqual([])
    expect(h.scopes).toEqual([{ kind: 'translate' }])
    expect(statuses(h)).toEqual(['running', 'success'])
  })
})

describe('更新模式', () => {
  it('译文已存在：mode=更新 且 modeHint 走「整体覆盖重译」分支', async () => {
    const h = await harness({
      promptTemplate: TEMPLATE,
      onIdle: async (hh): Promise<void> => { await writeTranslation(hh, '# 指南（中文译文）\n\n覆盖重译后的正文。\n') },
    })
    await writeTranslation(h)
    await h.run(REL, 't8')
    const text = promptOf()
    expect(text).toContain('mode=更新')
    expect(text).toContain('modeHint=目标译文已存在，本次整体覆盖重译：开始前先读现有译文，沿用其中已定稿的术语译法，避免同一术语前后不一致。')
    expect(statuses(h)).toEqual(['running', 'success'])
  })

  it('译文目标已是目录：不算「更新模式」，收尾判为未写入', async () => {
    const h = await harness({ promptTemplate: TEMPLATE, onIdle: (): void => undefined })
    await mkdir(h.dstAbs, { recursive: true })
    await h.run(REL, 't9')
    expect(promptOf()).toContain('mode=首次')
    expect(errorMessage(h)).toBe('译文未写入目标文件: ' + h.dstAbs)
    expect(h.invalidated).toBe(1)
  })
})

describe('收尾校验的失败路径（能力 verify 真实执行）', () => {
  it('译文未落盘 → 任务置 error，句柄仍被释放', async () => {
    const h = await harness({ promptTemplate: TEMPLATE, onIdle: (): void => undefined })
    await h.run(REL, 't10')
    expect(statuses(h)).toEqual(['running', 'error'])
    expect(errorMessage(h)).toBe('译文未写入目标文件: ' + h.dstAbs)
    expect(h.disposed).toBe(1)
    expect(h.invalidated).toBe(1)
  })

  it('更新模式但译文一字未改 → 判为未更新', async () => {
    const h = await harness({ promptTemplate: TEMPLATE, onIdle: (): void => undefined })
    await writeTranslation(h)
    await h.run(REL, 't11')
    expect(errorMessage(h)).toBe('子 agent 已结束但译文未更新: ' + h.dstAbs)
  })
})

describe('模板缺失时的内联回退', () => {
  it('首次：回退文本逐字含源文、目标与术语纪律', async () => {
    const h = await harness({
      promptTemplate: null,
      onIdle: async (hh): Promise<void> => { await writeTranslation(hh) },
    })
    await h.run(REL, 't12')
    const text = promptOf()
    expect(text).toContain('任务：把 Markdown 文档【' + h.abs + '】翻译为简体中文，并把译文写入【' + h.dstAbs + '】。')
    expect(text).toContain('严格要求：只处理以上这一篇文档，只写以上这一个目标文件，绝不翻译/修改任何其它文件（不要搜索目录、不要 glob、不要批量）。')
    expect(text).toContain('CRLF（回车换行）、WebSocket（全双工通信协议）')
    expect(text).toContain('源码路径: ' + KEY)
    expect(text).toContain('层级: ' + SUB)
    expect(text).toContain('# guide.md（中文译文）')
    expect(statuses(h)).toEqual(['running', 'success'])
  })
})

describe('收尾告警与句柄释放', () => {
  it('台账索引补齐失败（Error）：仅告警，任务仍 success', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined)
    const h = await harness({
      promptTemplate: TEMPLATE,
      syncFails: true,
      onIdle: async (hh): Promise<void> => { await writeTranslation(hh) },
    })
    await h.run(REL, 't13')
    expect(statuses(h)).toEqual(['running', 'success'])
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('问题台账索引补齐失败: sync boom')
  })

  it('台账失败抛出的是非 Error（字符串）：告警回落到原值', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined)
    const h = await harness({
      promptTemplate: TEMPLATE,
      syncError: 'plain failure',
      onIdle: async (hh): Promise<void> => { await writeTranslation(hh) },
    })
    await h.run(REL, 't14')
    expect(statuses(h)).toEqual(['running', 'success'])
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('问题台账索引补齐失败: plain failure')
  })

  it('句柄释放失败：成功路径仅告警，任务仍 success', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined)
    const h = await harness({
      promptTemplate: TEMPLATE,
      disposeFails: true,
      onIdle: async (hh): Promise<void> => { await writeTranslation(hh) },
    })
    await h.run(REL, 't15')
    expect(statuses(h)).toEqual(['running', 'success'])
    expect(warn.mock.calls.map(c => String(c[0])).join('\n'))
      .toContain('子 agent 句柄释放失败（任务状态不受影响）: dispose boom')
  })

  it('句柄释放失败：失败路径同样只告警，任务停在 error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined)
    const h = await harness({
      promptTemplate: TEMPLATE,
      disposeFails: true,
      onIdle: (): void => undefined,
    })
    await h.run(REL, 't16')
    expect(statuses(h)).toEqual(['running', 'error'])
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('dispose boom')
    expect(h.invalidated).toBe(1)
  })
})

describe('能力没有 precheck 钩子时（注入假描述符触达）', () => {
  it('precheck 缺席：跳过前置校验，其余编排不变', async () => {
    vi.doMock('../src/host/abilities/registry.ts', () => ({
      TRANSLATE_ABILITY: {
        kind: 'translate',
        dir: 'translate-doc',
        sub: SUB,
        arr: SUB,
        layer: SUB,
        scope: 'translate',
        promptFile: 'prompt.md',
        docStem: (target: { key: string }): string => computeDocStem(target.key),
        verify: (): void => undefined,
      },
    }))
    vi.resetModules()
    const h = await harness({
      promptTemplate: TEMPLATE,
      onIdle: (): void => undefined,
    })
    // 源文故意留成简体中文：若 precheck 真被执行，这里会 reject；跳过校验则一路走到 success。
    await writeFile(h.abs, '# 指南\n\n这是简体中文，precheck 本该拒绝翻译。\n', 'utf8')
    await h.run(REL, 't17')
    expect(statuses(h)).toEqual(['running', 'success'])
    await expect(readFile(join(h.bucketDir, 'index.json'), 'utf8')).resolves.toContain('文章翻译')
  })
})
