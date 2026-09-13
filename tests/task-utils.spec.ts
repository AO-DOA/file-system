// 后台生成/翻译任务通用工具（src/host/task-utils.ts）单元测试。
//
// 本模块按「file 级 行/函数/分支 100%」单独补齐：
//   · genAgentPreset 的三条取值路径（未设 / 空串 / 显式覆盖）；
//   · withTimeout 的计时器 unref 两条路径（有 unref / 无 unref）与超时、正常收尾两条竞速结果；
//   · onDisposeFailure 的三类入参（Error / 无 message 的对象 / 非对象）。
import { describe, expect, it, vi } from 'vitest'
import { ZH } from '../src/shared/locale'
import {
  TASK_TIMEOUT_MS,
  errTaskTimeout,
  genAgentPreset,
  onDisposeFailure,
  withTimeout,
} from '../src/host/task-utils'

describe('TASK_TIMEOUT_MS', () => {
  it('任务超时预算为 10 分钟（双保险的其中一保险）', () => {
    expect(TASK_TIMEOUT_MS).toBe(10 * 60 * 1000)
  })
})

describe('genAgentPreset', () => {
  it('未设 FS_GEN_PRESET 时默认 ptc（探测开关即默认值）', () => {
    vi.stubEnv('FS_GEN_PRESET', undefined)
    expect(genAgentPreset()).toBe('ptc')
  })

  it('空串等同未设，仍回退默认值', () => {
    vi.stubEnv('FS_GEN_PRESET', '')
    expect(genAgentPreset()).toBe('ptc')
  })

  it('显式设置时逐字采用覆盖值（应急回退 standard）', () => {
    vi.stubEnv('FS_GEN_PRESET', 'standard')
    expect(genAgentPreset()).toBe('standard')
  })
})

describe('errTaskTimeout', () => {
  it('message 走字典（经 gen-status 透传前端同一文案），code 标记超时分支', () => {
    const err = errTaskTimeout()
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe(ZH.errTaskTimeout)
    expect(err.code).toBe('ETASK_TIMEOUT')
  })
})

describe('withTimeout', () => {
  it('promise 先 settle 时原样透传结果，并清理计时器', async () => {
    const realClear = globalThis.clearTimeout
    const clearSpy = vi.fn(realClear)
    vi.stubGlobal('clearTimeout', clearSpy)

    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
    expect(clearSpy).toHaveBeenCalledTimes(1)
  })

  it('promise 永不 settle 时按超时预算 reject 出 errTaskTimeout', async () => {
    const err = await withTimeout(new Promise<string>(() => { /* 永不 settle */ }), 5)
      .then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe(ZH.errTaskTimeout)
    expect((err as { code?: string }).code).toBe('ETASK_TIMEOUT')
  })

  it('计时器带 unref 时调用它（防计时器拖住进程退出），并照常清理', async () => {
    const unref = vi.fn()
    const clearSpy = vi.fn()
    vi.stubGlobal('setTimeout', () => ({ unref }))
    vi.stubGlobal('clearTimeout', clearSpy)

    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
    expect(unref).toHaveBeenCalledTimes(1)
    expect(clearSpy).toHaveBeenCalledTimes(1)
  })

  it('计时器没有 unref 方法时跳过 unref（浏览器/jsdom 计时器为数字句柄）', async () => {
    const clearSpy = vi.fn()
    vi.stubGlobal('setTimeout', () => 1)
    vi.stubGlobal('clearTimeout', clearSpy)

    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
    expect(clearSpy).toHaveBeenCalledTimes(1)
  })
})

describe('onDisposeFailure', () => {
  it('Error 取其 message 上屏，只留一条 warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })
    onDisposeFailure(new Error('boom'))
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('[fs] 子 agent 句柄释放失败（任务状态不受影响）: boom')
  })

  it('抛出物没有 message 时回退到抛出物本身', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })
    onDisposeFailure({})
    expect(warnSpy).toHaveBeenCalledWith('[fs] 子 agent 句柄释放失败（任务状态不受影响）: [object Object]')
  })

  it('抛出的不是对象时同样只留 warn，不向上抛', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })
    expect(() => { onDisposeFailure('boom') }).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith('[fs] 子 agent 句柄释放失败（任务状态不受影响）: boom')
  })

  it('抛出空值时不抛，上屏 null', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })
    expect(() => { onDisposeFailure(null) }).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith('[fs] 子 agent 句柄释放失败（任务状态不受影响）: null')
  })
})
