// 后台生成/翻译任务的通用工具：超时竞速、超时错误、子会话预设。
// 2026-09-10 能力目录化重构时从 src/host/index.js 抽出，供入口与执行器共用。
import { ZH } from '../shared/locale.ts'

// 子 agent 生成/翻译任务超时预算：whenIdle 挂起超过该值时视为任务超时，
// 置任务 error 并释放子 agent 句柄（前端轮询随之停止）。
export const TASK_TIMEOUT_MS: number = 10 * 60 * 1000

// 生成/翻译子会话挂载的 agent 预设：探测 PTC 模式期间默认 ptc。该模式下工具以生成的
// SDK 呈现，模型写一段 TypeScript 组合多步操作，中间工具结果不再逐条回到上下文——
// 正是实测出的成本主因（L1 一次 38 个工具结果全部重放进上下文）。
// 回退原生呈现：启动进程时设 FS_GEN_PRESET=standard（重启链路不传该变量，故默认值即探测开关）。
const GEN_PRESET_DEFAULT: string = 'ptc'

export function genAgentPreset(): string {
  const override: string | undefined = process.env.FS_GEN_PRESET
  return typeof override === 'string' && override.length > 0 ? override : GEN_PRESET_DEFAULT
}

// 构造任务超时错误：message 走字典（经 gen-status 透传前端同一文案），
// code 供内部识别超时分支（与普通生成失败区分）。
// `code` 是源实现动态挂上的自有属性，TS 下需在返回类型上显式声明。
export function errTaskTimeout(): Error & { code: string } {
  const err = new Error(ZH.errTaskTimeout) as Error & { code: string }
  err.code = 'ETASK_TIMEOUT'
  return err
}

// withTimeout：给可能永不 settle 的 Promise 加超时预算。
// 竞速的计时器在任一分支 settle 后必被 clearTimeout 清理（timer.unref 防计时器
// 拖住进程退出），超时分支只 reject 一个 error 对象、不留其它句柄。
// 计时器句柄由 Promise executor 同步赋值，TS 的控制流分析看不到这一点，
// 故用 definite assignment assertion 声明（不是 `!` 非空断言表达式）。
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(errTaskTimeout()) }, ms)
  })
  if (typeof timer.unref === 'function') timer.unref()
  return Promise.race([promise, timeout]).finally(() => { clearTimeout(timer) })
}

// 子 agent 句柄释放失败的处理器：吞掉该错误，只留一条 warn。此刻任务状态已落盘
// （success/error 都已写入 genTasks），前端轮询收尾读的是任务状态、不是这次释放；
// 子 agent 侧资源泄漏由 agentLoop 兜底回收——没有任何调用方依赖这个失败。
export function onDisposeFailure(err: unknown): void {
  const source = err as { message?: unknown } | null | undefined
  const detail: unknown = (source && source.message) || err
  console.warn('[fs] 子 agent 句柄释放失败（任务状态不受影响）: ' + String(detail))
}
