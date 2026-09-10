/**
 * @vitest-environment node
 *
 * gen-executor（src/host/gen-executor.ts）单元测试。
 *
 * 迁移自迁移源的同名执行器（`src/host/gen-executor.js`，冻结于 3a3f89e），并按 PROGRESS.md D-2
 * 把分支口径补到 100%：执行器的每条早退、每个可选钩子与每个三元分支都必须有一个真实用例。
 *
 * 装置说明（三处客观约束决定写法）：
 *   1. `@deepseek-ai/dsh-llm` 是 peerDependency，本仓 node_modules 里没有——用 vi.mock 提供
 *      `createUserMessage` 桩，成功路径才可达；mock 未安装模块已实测可行。
 *   2. `SKILLS_ROOT` 是**模块顶层**三元（源码直载形态恒走第一支），要覆盖第二支只能把
 *      `existsSync` 虚拟成 false 再让模块重新求值。实测出两条硬约束（否则「钩子设了却没用」）：
 *      ① 必须**用例内** `vi.doMock` + `vi.resetModules()`——顶层 `vi.mock` 的模块实例会被缓存，
 *      表现为「单跑绿、全量跑红」；② 工厂返回的对象**只能**覆盖 `existsSync`，一并覆盖 `promises`
 *      会让 vitest 整体放弃该 mock、被测模块拿回真实 node:fs。故 prevStat/postStat 的 mtime/size
 *      组合改由**真实文件系统**构造（`utimes` 把 mtime 固定到整秒，回读逐位相等）。
 *   3. 各能力描述符（folder/file/src）都带 skeleton 与 hostIndex，故「无 skeleton」「无 hostIndex」
 *      「无 verify」「hostBuild 但无 finalize」这些分支在真实能力下不可达——用 `vi.doMock` 注入
 *      假描述符来触达，注入的只是描述符，执行器代码一字未改。
 *
 * 书库与工作目录全部落在 mkdtemp 临时目录（DSH_HOME 被 stub），真实 upsertBookIndex 因此
 * 写的是临时 index.json，不碰工作树。
 *
 * 注意：runGenDoc 的失败路径**不 rethrow**（源在 catch 里置任务 error 并释放句柄后静默返回），
 * 故失败断言一律读 setGenTaskStatus 的记录，而不是 rejects。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { computeDocStem } from '../src/host/fs-utils.ts'
import type { GenExecutorDeps } from '../src/host/gen-executor.ts'

// ---- 全局 mock ①：未安装的 peer 依赖 ----
// 记录每次 createUserMessage 的入参，供「提示词只注入 user message」与变量表断言使用。
const LLM = vi.hoisted((): { messages: unknown[] } => ({ messages: [] }))
vi.mock('@deepseek-ai/dsh-llm', () => ({
  createUserMessage: (message: unknown): unknown => {
    LLM.messages.push(message)
    return message
  },
}))

// ---- 装置 ----

/** 目标描述（bookTargetFor 返回形状里测试关心的部分）。 */
interface TargetSpec {
  kind: 'folder' | 'file' | 'src'
  rel: string
  key: string
  sub: string
  stem: string
}

/** 注入面桩的可选项。 */
interface HarnessOptions {
  promptTemplate?: string | null
  withAgentLoop?: boolean
  withPresets?: boolean
  onIdle?: (h: Harness) => Promise<void> | void
  disposeFails?: boolean
  syncFails?: boolean
  /** 抛出的原样值：非 Error（如字符串）时走告警里的第二条取值路径。 */
  syncError?: unknown
}

/** 一次性测试装置：临时书库桶 + 注入面桩 + 调用记录。 */
interface Harness {
  tmpRoot: string
  bucketDir: string
  abs: string
  docAbs: string
  cwd: string
  status: Array<{ id: string; status: string; error: unknown }>
  scopes: Array<{ kind: string }>
  mounts: string[]
  created: Array<{ sessionId: string; meta: Record<string, unknown>; agentOptions: unknown }>
  followedUp: number
  ensured: string[]
  presetsSeen: unknown[]
  disposed: number
  invalidated: number
  run: (rel: string, kind: string, taskId: string) => Promise<void>
}

// 提示词模板：把执行器下发的每个变量都渲染进产物，一条模板即可断言整张变量表。
const TEMPLATE = [
  'target=${target}',
  'docPath=${docPath}',
  'docStem=${docStem}',
  'srcName=${srcName}',
  'cwd=${cwd}',
  'generatedAt=${generatedAt}',
  'mode=${mode}',
  'modeHint=${modeHint}',
  'skeleton=${skeleton}',
  'skeletonPath=${skeletonPath}',
  'skeletonLines=${skeletonLines}',
  'layer=${layer}',
  'arr=${arr}',
  'skill=${skill}',
  'skillsRoot=${skillsRoot}',
  'issueDir=${issueDir}',
  'issueDate=${issueDate}',
  'issueNo=${issueNo}',
  'targetKey=${targetKey}',
  'bookDir=${bookDir}',
  'projectRoot=${projectRoot}',
].join('\n')

/** 三个真实目标的描述（sub/stem 与各自能力描述符逐字一致）。 */
const TARGETS: Record<'folder' | 'file' | 'src', TargetSpec> = {
  folder: { kind: 'folder', rel: 'src', key: 'src', sub: '目录概览', stem: 'src' },
  file: { kind: 'file', rel: 'src/a.js', key: 'src/a.js', sub: '文件摘要', stem: computeDocStem('src/a.js') },
  src: { kind: 'src', rel: 'src/a.js', key: 'src/a.js', sub: '源码注解', stem: computeDocStem('src/a.js') },
}

let tmpRoot = ''

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'dsh-fs-genexec-'))
  vi.stubEnv('DSH_HOME', tmpRoot)
  // 预设探测开关不参与本 spec：显式清掉，保证 genAgentPreset() 走默认值 ptc。
  vi.stubEnv('FS_GEN_PRESET', undefined)
  LLM.messages.length = 0
  // 每个用例都重新求值模块顶层（SKILLS_ROOT 因此按本用例的 existsSync 钩子取值）。
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.doUnmock('node:fs')
  vi.doUnmock('node:fs')
  vi.doUnmock('../src/host/abilities/registry.ts')
  vi.resetModules()
})

/**
 * 建装置：临时项目根 + 书库桶 + 真实目标文件，并装配一份注入面桩。
 * @param spec - 目标描述（kind/rel/key/sub/stem）。
 * @param options - 覆盖项（提示词模板、agentLoop 有无、whenIdle 行为等）。
 * @returns 装置句柄；`run` 就是被测的 runGenDoc。
 */
async function harness(spec: TargetSpec, options: HarnessOptions = {}): Promise<Harness> {
  const projectRoot = join(tmpRoot, 'proj')
  const abs = join(projectRoot, spec.rel)
  const bucketDir = join(tmpRoot, 'books', 'proj-key')
  const docAbs = join(bucketDir, spec.sub, spec.stem + '.md')
  const cwd = join(tmpRoot, 'books', 'session')
  if (spec.kind === 'folder') {
    await mkdir(abs, { recursive: true })
    await writeFile(join(abs, 'a.js'), 'const a = 1\n', 'utf8')
  } else {
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, 'const a = 1\nconst b = 2\n', 'utf8')
  }

  const { createGenExecutor } = await import('../src/host/gen-executor.ts')

  const status: Harness['status'] = []
  const scopes: Harness['scopes'] = []
  const mounts: string[] = []
  const created: Harness['created'] = []
  const ensured: string[] = []
  const presetsSeen: unknown[] = []
  const state = { disposed: 0, invalidated: 0, followedUp: 0 }

  const handle: Harness = {
    tmpRoot, bucketDir, abs, docAbs, cwd, status, scopes, mounts, created, ensured, presetsSeen,
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

  const deps: GenExecutorDeps = {
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
      bookTargetFor: async () => ({
        abs,
        bookRoot: { projectRoot, bucket: 'proj-key', dir: bucketDir },
        relP: spec.rel,
        key: spec.key,
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
      nextIssueNoFromDisk: async (): Promise<string> => '07',
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

  handle.run = createGenExecutor(deps)
  return handle
}

/** 写一篇能被 L1/L2 verify 接受的产物（非空、无占位残留）。 */
async function writeDoc(h: Harness): Promise<void> {
  await mkdir(dirname(h.docAbs), { recursive: true })
  await writeFile(h.docAbs, '# 标题\n\n正文说明。\n', 'utf8')
}

/** 把骨架里每处「注解: 」填成短中文（行尾注解格式，能过 checkHealth 四项）。 */
async function fillSkeleton(path: string): Promise<void> {
  const text = await readFile(path, 'utf8')
  const filled = text
    .split('\n')
    .map(line => (line.trim().startsWith('注解:') ? line.replace('注解: ', '注解: 计数常量') : line))
    .join('\n')
  await writeFile(path, filled, 'utf8')
}

/** 读提示词文本（runGenDoc 只注入 user message，取最后一条）。 */
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

describe('runGenDoc 前置校验', () => {
  it('未知 kind：立即抛错，不建子会话', async () => {
    const h = await harness(TARGETS.folder)
    await expect(h.run('src', 'nope', 't1')).rejects.toThrow('unknown gen kind: nope')
    expect(h.created).toHaveLength(0)
    expect(h.status).toHaveLength(0)
  })

  it('agentLoop 服务不可用：抛错且不动书库', async () => {
    const h = await harness(TARGETS.folder, { withAgentLoop: false })
    await expect(h.run('src', 'folder', 't1')).rejects.toThrow('agentLoop 服务不可用')
    expect(h.ensured).toHaveLength(0)
  })
})

describe('L1（folder）成功路径', () => {
  it('派发变量表逐项下发、只注入 user message、收尾写索引并失效缓存', async () => {
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src', 'folder', 't1')

    // 状态机：running → success（错误分支未触达）。
    expect(statuses(h)).toEqual(['running', 'success'])

    const text = promptOf()
    expect(text).toContain('target=' + h.abs)
    expect(text).toContain('docPath=' + h.docAbs)
    expect(text).toContain('docStem=src')
    expect(text).toContain('srcName=src')
    expect(text).toContain('cwd=' + h.cwd)
    expect(text).toContain('mode=首次')
    expect(text).toContain('modeHint=从零读目标自身建立语义。')
    expect(text).toContain('skeletonLines=0')
    expect(text).toContain('skeletonPath=\n')
    expect(text).toContain('layer=目录')
    expect(text).toContain('arr=目录层')
    expect(text).toContain('targetKey=src')
    expect(text).toContain('bookDir=' + h.bucketDir)
    expect(text).toContain('projectRoot=' + join(h.tmpRoot, 'proj'))
    expect(text).toContain('issueNo=07')
    expect(text).toContain('issueDir=' + join(h.tmpRoot, 'issues'))
    // 描述符里没有 skill 字段（去技能化后不再有），渲染时未知值原样保留——与源取值逐字一致。
    expect(text).toContain('skill=${skill}')
    expect(text).toContain('skillsRoot=' + join(process.cwd(), 'skills'))
    // 骨架整篇注入（L1 骨架不落盘，由模型整篇写回）。
    expect(text).toContain('生成时间')
    expect(text.length).toBeGreaterThan(200)

    // 子会话配置：预设 = genAgentPreset()（默认 ptc）；不打 meta.origin='subagent'。
    expect(h.created).toHaveLength(1)
    expect(h.created[0]?.meta['agentPreset']).toBe('ptc')
    expect('origin' in (h.created[0]?.meta ?? {})).toBe(false)
    expect(h.created[0]?.sessionId.startsWith('fs-')).toBe(true)
    expect(h.followedUp).toBe(1)
    // 预设挂载 + 工具面按能力 scope 收敛。
    expect(h.mounts).toEqual(['ptc'])
    expect(h.presetsSeen).toHaveLength(1)
    expect(h.scopes).toEqual([{ kind: 'folder' }])
    // 桶先建好（ensureBookDirAt 在 createAgent 之前）。
    expect(h.ensured).toEqual([h.bucketDir])
    // 句柄释放与缓存失效。
    expect(h.disposed).toBe(1)
    expect(h.invalidated).toBe(1)

    // index.json 的「目录层」条目指向真实落盘文档。
    const idx = JSON.parse(await readFile(join(h.bucketDir, 'index.json'), 'utf8')) as {
      目录层: Array<Record<string, string>>
    }
    expect(idx.目录层).toEqual([{ 源码路径: 'src', 文档: '目录概览/src.md' }])
  })

  it('更新模式：产物已存在时 mode=更新，且 modeHint 走 hostIndex 分支', async () => {
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await writeDoc(h)
    await h.run('src', 'folder', 't1')
    expect(promptOf()).toContain('mode=更新')
    expect(promptOf()).toContain('modeHint=更新前先读现有文档 ' + h.docAbs + '，记下已写明的职责与措辞作基线（必须在写产物之前完成）')
  })

  it('无 agentPresets 服务：跳过挂载，工具面仍收敛', async () => {
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      withPresets: false,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src', 'folder', 't1')
    expect(h.mounts).toEqual([])
    expect(h.scopes).toEqual([{ kind: 'folder' }])
    expect(statuses(h)).toEqual(['running', 'success'])
  })
})

describe('L2（file）：模板缺失时的内联回退', () => {
  it('回退文本逐字含目标、骨架与 L2 纪律', async () => {
    const h = await harness(TARGETS.file, {
      promptTemplate: null,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src/a.js', 'file', 't2')
    const text = promptOf()
    expect(text).toContain('任务：为【' + h.abs + '】这一个文件写文件层（L2）文档，产物写入【' + h.docAbs + '】。')
    expect(text).toContain('骨架（frontmatter 三行、标题、路径、四个章节标题、导出表头均为宿主算好的确定值，必须逐字保留）：')
    expect(text).toContain('不要手写 frontmatter 或「生成时间」，不要写 index.json（宿主负责）；本层没有技能与 shell 工具。')
    expect(statuses(h)).toEqual(['running', 'success'])
  })

  it('L1 模板缺失：回退文本逐字含目标与「不做第二篇」纪律', async () => {
    const h = await harness(TARGETS.folder, {
      promptTemplate: null,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src', 'folder', 't15')
    const text = promptOf()
    expect(text).toContain('任务：为【' + h.abs + '】这一个文件夹写目录层（L1）说明，产物写入【' + h.docAbs + '】。')
    expect(text).toContain('严格要求：只生成这一篇；不递归子文件夹；不为其它文件夹生成第二篇。')
    expect(text).toContain('本层没有技能与 shell 工具，不要尝试调用技能或脚本。')
    expect(statuses(h)).toEqual(['running', 'success'])
  })

  it('L3 模板缺失：回退文本给出骨架绝对路径、行数与分批纪律', async () => {
    const h = await harness(TARGETS.src, {
      promptTemplate: null,
      onIdle: async (hh: Harness): Promise<void> => {
        await fillSkeleton(join(hh.cwd, 'skeleton-t16.txt'))
      },
    })
    await h.run('src/a.js', 'src', 't16')
    const text = promptOf()
    expect(text).toContain('产物文档 DOC 由宿主构建并写入，你只填骨架、不要写 DOC。')
    expect(text).toContain('骨架已由宿主落盘（填空题）：' + join(h.cwd, 'skeleton-t16.txt') + '（共 ')
    expect(text).toContain('禁止用 write 整篇重写骨架；')
    expect(statuses(h)).toEqual(['running', 'success'])
  })

  it('更新 + 模板缺失：仍走回退，空转校验按 mtime/size 判定', async () => {
    const h = await harness(TARGETS.file, {
      promptTemplate: null,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await writeDoc(h)
    await h.run('src/a.js', 'file', 't2')
    expect(promptOf()).toContain('文件层（L2）')
    expect(statuses(h)).toEqual(['running', 'success'])
  })
})

describe('L3（src）：骨架按 taskId 落盘、产物由宿主 finalize 构建', () => {
  it('骨架落盘到 <cwd>/skeleton-<taskId>.txt，finalize 写 DOC 并删骨架', async () => {
    const h = await harness(TARGETS.src, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh: Harness): Promise<void> => {
        // whenIdle 时刻骨架必须已落盘（writeFile 在派发前完成）。
        expect((await readdir(hh.cwd)).includes('skeleton-t3.txt')).toBe(true)
        await fillSkeleton(join(hh.cwd, 'skeleton-t3.txt'))
      },
    })
    await h.run('src/a.js', 'src', 't3')

    expect(statuses(h)).toEqual(['running', 'success'])
    const text = promptOf()
    // 提示词给出骨架绝对路径与行数（模板只引用这两个变量，骨架全文不进上下文）。
    expect(text).toContain('skeletonPath=' + join(h.cwd, 'skeleton-t3.txt'))
    expect(text).toContain('skeletonLines=')
    const lines = Number(/skeletonLines=(\d+)/.exec(text)?.[1])
    expect(lines).toBeGreaterThan(0)
    // 收尾：宿主构建产物落盘、骨架删除、索引写入「源码层」。
    const doc = await readFile(h.docAbs, 'utf8')
    expect(doc).toContain('计数常量')
    expect(doc).toContain('层级: 源码')
    await expect(stat(join(h.cwd, 'skeleton-t3.txt'))).rejects.toThrow()
    const idx = JSON.parse(await readFile(join(h.bucketDir, 'index.json'), 'utf8')) as {
      源码层: Array<Record<string, string>>
    }
    expect(idx.源码层).toEqual([{ 源码路径: 'src/a.js', 文档: '源码注解/' + TARGETS.src.stem + '.md' }])
  })

  it('并发两个任务：骨架名按 taskId 唯一，互不踩对方骨架', async () => {
    const seen: string[] = []
    const h = await harness(TARGETS.src, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh: Harness): Promise<void> => {
        const names = (await readdir(hh.cwd)).filter(n => n.startsWith('skeleton-'))
        const mine = names.find(n => !seen.includes(n))
        if (!mine) throw new Error('no skeleton for this task: ' + names.join(','))
        seen.push(mine)
        await fillSkeleton(join(hh.cwd, mine))
      },
    })
    await Promise.all([h.run('src/a.js', 'src', 'task-a'), h.run('src/a.js', 'src', 'task-b')])
    expect([...seen].sort()).toEqual(['skeleton-task-a.txt', 'skeleton-task-b.txt'])
    // 两个任务的骨架都被各自的 finalize 删掉（不共用文件 → 不会删掉对方仍在用的骨架）。
    const left = await readdir(h.cwd)
    expect(left.filter(n => n.startsWith('skeleton-'))).toEqual([])
    expect(h.status.filter(s => s.status === 'success')).toHaveLength(2)
  })

  it('L3 更新模式：modeHint 走 hostBuild 分支', async () => {
    const h = await harness(TARGETS.src, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh: Harness): Promise<void> => {
        await fillSkeleton(join(hh.cwd, 'skeleton-t4.txt'))
      },
    })
    await mkdir(dirname(h.docAbs), { recursive: true })
    await writeFile(h.docAbs, '# 旧文档\n', 'utf8')
    await h.run('src/a.js', 'src', 't4')
    expect(promptOf()).toContain('mode=更新')
    expect(promptOf()).toContain('记下已写明的职责与措辞作基线（必须在填注解之前完成）')
  })
})

describe('空转校验（L1/L2 按产物 mtime/size）', () => {
  it('产物未生成 → 任务置 error（不 rethrow）', async () => {
    const h = await harness(TARGETS.folder, { promptTemplate: TEMPLATE, onIdle: (): void => undefined })
    await h.run('src', 'folder', 't5')
    expect(statuses(h)).toEqual(['running', 'error'])
    expect(errorMessage(h)).toBe('子 agent 已结束但产物未生成: ' + h.docAbs)
    expect(h.disposed).toBe(1)
    expect(h.invalidated).toBe(1)
  })

  it('产物是目录 → 同样判为未生成', async () => {
    const h = await harness(TARGETS.folder, { promptTemplate: TEMPLATE, onIdle: (): void => undefined })
    await mkdir(h.docAbs, { recursive: true })
    await h.run('src', 'folder', 't5')
    expect(errorMessage(h)).toBe('子 agent 已结束但产物未生成: ' + h.docAbs)
  })

  it('更新模式但产物一字未改 → 判为未更新', async () => {
    const h = await harness(TARGETS.folder, { promptTemplate: TEMPLATE, onIdle: (): void => undefined })
    await writeDoc(h)
    await h.run('src', 'folder', 't5')
    expect(errorMessage(h)).toBe('子 agent 已结束但产物未更新: ' + h.docAbs)
  })

  it('更新模式且 mtime 变化 → 通过（mtime 判据单独成立）', async () => {
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await writeDoc(h)
    await new Promise(r => setTimeout(r, 10))
    await h.run('src', 'folder', 't5')
    expect(statuses(h)).toEqual(['running', 'success'])
  })

  it('更新模式且 mtime 相同、size 变化 → 通过（size 判据单独成立）', async () => {
    // 三支判据（prevStat 非空 → mtime 相同 → size 相同）里，只有「mtime 相同且 size 不同」这一种
    // 组合能让第三支单独求值为 false；mtime 不同会短路在第二支，测不到 size 判据。
    // 用真实文件系统构造：utimes 把 mtime 固定到整秒（秒级精度无损，回读 mtimeMs 逐位相等）。
    const mtimeSec = Math.floor(Date.now() / 1000) - 100
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh: Harness): Promise<void> => {
        // 派发后：换一段更长的正文（size 变了），再把 mtime 拨回派发前的整秒。
        await writeFile(hh.docAbs, '# 标题\n\n正文说明，这一段明显更长，用来改变 size。\n', 'utf8')
        await utimes(hh.docAbs, mtimeSec, mtimeSec)
      },
    })
    await writeDoc(h)
    await utimes(h.docAbs, mtimeSec, mtimeSec)
    const before = await stat(h.docAbs)
    await h.run('src', 'folder', 't5')
    const after = await stat(h.docAbs)
    expect(statuses(h)).toEqual(['running', 'success'])
    // 复核判据的两半确实分别成立：mtime 逐位相同、size 不同。
    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(after.size).not.toBe(before.size)
  })

  it('hostBuild 能力（L3）：mtime/size 判据让位给能力 verify', async () => {
    const h = await harness(TARGETS.src, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh: Harness): Promise<void> => {
        await fillSkeleton(join(hh.cwd, 'skeleton-t6.txt'))
      },
    })
    await mkdir(dirname(h.docAbs), { recursive: true })
    await writeFile(h.docAbs, '# 旧文档\n', 'utf8')
    await h.run('src/a.js', 'src', 't6')
    expect(statuses(h)).toEqual(['running', 'success'])
  })
})

describe('收尾告警与句柄释放', () => {
  it('台账索引补齐失败：仅告警，任务仍 success', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined)
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      syncFails: true,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src', 'folder', 't7')
    expect(statuses(h)).toEqual(['running', 'success'])
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('问题台账索引补齐失败: sync boom')
  })

  it('台账失败抛出的是非 Error（字符串）：告警回落到原值，任务仍 success', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined)
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      syncError: 'plain failure',
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src', 'folder', 't17')
    expect(statuses(h)).toEqual(['running', 'success'])
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('问题台账索引补齐失败: plain failure')
  })

  it('句柄释放失败：成功路径仅告警，任务仍 success', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined)
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      disposeFails: true,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src', 'folder', 't8')
    expect(statuses(h)).toEqual(['running', 'success'])
    expect(warn.mock.calls.map(c => String(c[0])).join('\n'))
      .toContain('子 agent 句柄释放失败（任务状态不受影响）: dispose boom')
  })

  it('句柄释放失败：失败路径同样只告警，任务停在 error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined)
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      disposeFails: true,
      onIdle: (): void => undefined,
    })
    await h.run('src', 'folder', 't9')
    expect(statuses(h)).toEqual(['running', 'error'])
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('dispose boom')
    expect(h.invalidated).toBe(1)
  })
})

describe('能力自带钩子的缺席路径（注入假描述符触达）', () => {
  /**
   * 注入一个假描述符（只替换注册表，执行器代码不动）。
   * @param ability - 假描述符。
   */
  function useAbility(ability: Record<string, unknown>): void {
    // registry 是项目内模块：doMock + 清缓存后，下一次动态 import 才拿到假描述符。
    vi.doMock('../src/host/abilities/registry.ts', () => ({ abilityOf: (): unknown => ability }))
    vi.resetModules()
  }

  const FAKE_BASE = {
    kind: 'folder',
    dir: 'folder-doc',
    sub: '目录概览',
    arr: '目录层',
    layer: '目录',
    scope: 'folder',
    promptFile: 'prompt.md',
    docStem: (target: { abs: string }): string => basename(target.abs),
  }

  it('无 skeleton / 无 skeletonFile / 无 hostIndex：跳过骨架、校验与索引，modeHint 走末支', async () => {
    useAbility({ ...FAKE_BASE })
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await writeDoc(h)
    await h.run('src', 'folder', 't10')
    const text = promptOf()
    // skeleton 三元走 else：骨架为空串、不落盘、行数记 0。
    expect(text).toContain('skeleton=\n')
    expect(text).toContain('skeletonPath=\n')
    expect(text).toContain('skeletonLines=0')
    // modeHint 三分支的末支（无 hostBuild 也无 hostIndex）。
    expect(text).toContain('modeHint=更新前先读现有文档 ' + h.docAbs + '，记下已写明的职责、子项与措辞（必须在步骤 2 之前完成')
    // hostIndex 缺席 → 不写 index.json。
    await expect(stat(join(h.bucketDir, 'index.json'))).rejects.toThrow()
    expect(statuses(h)).toEqual(['running', 'success'])
  })

  it('hostIndex 但无 verify：跳过校验，仍写索引', async () => {
    useAbility({ ...FAKE_BASE, hostIndex: true })
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src', 'folder', 't11')
    expect(statuses(h)).toEqual(['running', 'success'])
    await expect(readFile(join(h.bucketDir, 'index.json'), 'utf8')).resolves.toContain('目录层')
  })

  it('hostBuild 但无 finalize：verify 照跑、产物不由宿主构建', async () => {
    const verified: Array<Record<string, unknown>> = []
    useAbility({
      ...FAKE_BASE,
      hostIndex: true,
      hostBuild: true,
      verify: (ctx: Record<string, unknown>): void => { verified.push(ctx) },
    })
    const h = await harness(TARGETS.folder, {
      promptTemplate: TEMPLATE,
      onIdle: (): void => undefined,
    })
    await h.run('src', 'folder', 't12')
    expect(verified).toHaveLength(1)
    expect(verified[0]?.['docAbs']).toBe(h.docAbs)
    expect(statuses(h)).toEqual(['running', 'success'])
  })
})

describe('SKILLS_ROOT 的两个候选目录', () => {
  it('源码直载形态：<插件根>/skills', async () => {
    const h = await harness(TARGETS.folder, {
      promptTemplate: 'skillsRoot=${skillsRoot}',
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src', 'folder', 't13')
    expect(promptOf()).toBe('skillsRoot=' + join(process.cwd(), 'skills'))
  })

  it('插件根下无 skills 时回落 <插件根>/src/skills（虚拟化 existsSync）', async () => {
    // 模块顶层三元的第二支：源码形态下 <插件根>/skills 真实存在，只能把 existsSync 虚拟成 false
    // 再让模块重新求值。doMock 与 resetModules 都必须在本用例内（见文件头第 2 条）。
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>()
      return { ...actual, existsSync: (): boolean => false }
    })
    vi.resetModules()
    const h = await harness(TARGETS.folder, {
      promptTemplate: 'skillsRoot=${skillsRoot}',
      onIdle: async (hh): Promise<void> => { await writeDoc(hh) },
    })
    await h.run('src', 'folder', 't14')
    expect(promptOf()).toBe('skillsRoot=' + join(process.cwd(), 'src', 'skills'))
  })
})
