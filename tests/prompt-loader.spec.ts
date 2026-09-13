// 提示词加载（src/host/prompt-loader.ts）单元测试。
//
// 本模块按「file 级 行/函数/分支 100%」单独补齐：
//   · 双候选探测的两条路径（源码直载 <HERE>/abilities/<dir>、产物回退 <HERE>/../../src/host/abilities/<dir>）；
//   · 候选判据是「目标 promptFile 存在」而非「目录存在」——产物形态下 lib/host/abilities/<dir>/
//     只有 index.js、没有 prompt.md，按目录判定会误命中并静默回退内联文本；
//   · 小目录缓存的三态（未探测 / 命中 / 记为空）；
//   · 读盘异常的两条路径（ENOENT 静默、其它错误告警）。
//
// Vitest resolves `import.meta.url` to a non-file URL in the spec files, so the repository
// root comes from process.cwd() (the same device real-composition.spec.ts uses); the module
// under test keeps the real file: URL.
import { describe, expect, it, vi } from 'vitest'
import { promises as fsp } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { loadAbilityPrompt } from '../src/host/prompt-loader'

const REPO_ROOT = process.cwd()

// 源码直载形态的首个候选：join(<HERE>, 'abilities', dir)（<HERE> = src/host）。
const SRC_ABILITIES = join(REPO_ROOT, 'src', 'host', 'abilities')

// 产物形态回退候选的解析基址：resolve(<HERE>, '../../src/host/abilities', dir)（<HERE> = src/host）
// = <pkg>/src/src/host/abilities。下面用它构造相对目录名，把第二个候选指到临时目录上；
// 同一个相对名从首个候选取会多退一层（两者基址差一级 src/），于是首个候选自然落空。
const BUNDLE_CANDIDATE_BASE = join(REPO_ROOT, 'src', 'src', 'host', 'abilities')

interface TempAbility {
  /** 能让第二个候选命中的相对目录名。 */
  dir: string
  /** 该临时能力目录的绝对路径（用于事后改动目录内容）。 */
  abilityDir: string
}

/** 造一个临时能力目录，返回相对目录名与绝对路径。 */
async function makeAbilityDir(files: Record<string, string>): Promise<TempAbility> {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-fs-prompt-'))
  const abilityDir = join(tmp, 'ability')
  await mkdir(abilityDir, { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(abilityDir, name), body, 'utf8')
  }
  return { dir: relative(BUNDLE_CANDIDATE_BASE, abilityDir), abilityDir }
}

describe('loadAbilityPrompt', () => {
  it('按描述符 dir 读取源码直载形态的 prompt.md（首个候选）', async () => {
    const text = await loadAbilityPrompt({ dir: 'folder-doc' })
    expect(text).toBe(await readFile(join(SRC_ABILITIES, 'folder-doc', 'prompt.md'), 'utf8'))
    expect(text).not.toBeNull()
  })

  it('同一能力二次调用命中小目录缓存，结果逐字相同', async () => {
    const first = await loadAbilityPrompt({ dir: 'translate-doc' })
    const second = await loadAbilityPrompt({ dir: 'translate-doc' })
    expect(first).not.toBeNull()
    expect(second).toBe(first)
  })

  it('promptFile 缺省为 prompt.md，空串同样回退缺省', async () => {
    const byDefault = await loadAbilityPrompt({ dir: 'file-doc' })
    expect(byDefault).toBe(await readFile(join(SRC_ABILITIES, 'file-doc', 'prompt.md'), 'utf8'))
    expect(await loadAbilityPrompt({ dir: 'file-doc', promptFile: '' })).toBe(byDefault)
  })

  it('promptFile 显式指定时按名读取，名字不存在即视为该能力无模板', async () => {
    expect(await loadAbilityPrompt({ dir: 'source-doc', promptFile: 'no-such-template.md' })).toBeNull()
  })

  it('描述符缺失或 dir 为空时直接返回 null（调用方回退内联文本）', async () => {
    expect(await loadAbilityPrompt(null)).toBeNull()
    expect(await loadAbilityPrompt(undefined)).toBeNull()
    expect(await loadAbilityPrompt({})).toBeNull()
    expect(await loadAbilityPrompt({ dir: '' })).toBeNull()
  })

  it('两个候选都没有该能力目录时返回 null（并把空结果记入缓存）', async () => {
    expect(await loadAbilityPrompt({ dir: 'no-such-ability' })).toBeNull()
    expect(await loadAbilityPrompt({ dir: 'no-such-ability' })).toBeNull()
  })

  it('首个候选落空时回退到源码树候选（产物 lib/host/ 形态的入口）', async () => {
    const { dir } = await makeAbilityDir({ 'prompt.md': '来自源码树候选的模板\n' })
    expect(await loadAbilityPrompt({ dir })).toBe('来自源码树候选的模板\n')
  })

  it('模板在探测之后消失时静默回退（ENOENT 不告警）', async () => {
    const { dir, abilityDir } = await makeAbilityDir({ 'prompt.md': '稍后被删掉的模板\n' })
    expect(await loadAbilityPrompt({ dir })).toBe('稍后被删掉的模板\n')
    // 目录已进缓存 → 这次直接读盘 → ENOENT，静默返回 null。
    await rm(join(abilityDir, 'prompt.md'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })
    expect(await loadAbilityPrompt({ dir })).toBeNull()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('读盘失败且不是 ENOENT（拿到的是目录）时告警并回退 null', async () => {
    const { dir, abilityDir } = await makeAbilityDir({})
    // promptFile 指向一个存在的**目录**：候选判据「存在」成立 → readFile 抛 EISDIR。
    await mkdir(join(abilityDir, 'sub'), { recursive: true })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })
    expect(await loadAbilityPrompt({ dir, promptFile: 'sub' })).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[fs] 提示词读取失败（回退内联文本）: '))
  })

  it('读盘抛出的不是带 message 的错误时，告警详情回退到抛出物本身', async () => {
    const { dir } = await makeAbilityDir({ 'prompt.md': '模板\n' })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })
    const readSpy = vi.spyOn(fsp, 'readFile')
    // 目录已在首次调用时进缓存，这两次都直接读盘，异常形状完全由测试给定。
    expect(await loadAbilityPrompt({ dir })).toBe('模板\n')

    readSpy.mockRejectedValue('boom')
    expect(await loadAbilityPrompt({ dir })).toBeNull()
    expect(warnSpy).toHaveBeenLastCalledWith(expect.stringContaining('回退内联文本）: boom'))

    readSpy.mockRejectedValue(null)
    expect(await loadAbilityPrompt({ dir })).toBeNull()
    expect(warnSpy).toHaveBeenLastCalledWith(expect.stringContaining('回退内联文本）: null'))
  })
})
