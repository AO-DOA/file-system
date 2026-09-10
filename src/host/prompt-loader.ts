// 提示词加载（能力目录化）：真源是 `abilities/<name>/prompt.md`。
//
// 为什么每次派发任务都读盘、不在启动时缓存全文：改提示词即改行为，免 build、免重启——
// 提示词是调优最频繁的资产，走构建产物会让每次措辞微调都付出一次构建+重启代价；
// 单个模板只有几 KB，一次生成任务里这点 I/O 相对模型开销可忽略。
//
// 两个候选目录的由来（覆盖两种加载形态，按顺序探测）：
//   1. `join(HERE, 'abilities', dir)`——源码直载/测试形态：本文件在 src/host/，
//      能力目录与它同级；
//   2. `resolve(HERE, '../../src/host/abilities', dir)`——产物形态：rootDir 上提后
//      本文件被编译到插件根/lib/host/，需回退两级再进源码树 src/host/abilities/ 取提示词。
//
// 为什么按「目标 promptFile 是否存在」而不是「目录是否存在」判定候选：产物形态下 tsc
// 会把 abilities 下的 .ts 逐个编译进 lib/host/abilities/<dir>/（已实测），于是候选 1 会
// 命中一个**只有 index.js、没有 prompt.md** 的目录，读文件必 ENOENT 并静默回退内联文本——
// 「改 prompt.md 免 build 免重启」这条核心契约随之失效。判据收紧到 promptFile 本身，
// 候选 1 在产物形态自然落空、候选 2 命中源码树，两种形态行为一致。
//
// 为什么不写 `new URL('./abilities/', import.meta.url)`：打包器会把这种写法当作资源
// 引用处理（尝试把目录纳入产物/改写路径），故改用 fileURLToPath + join 得到纯字符串路径。
import { promises as fsp } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE: string = dirname(fileURLToPath(import.meta.url))

// 按能力目录名缓存探测结果：未探测 = 无键；null = 两个候选都不存在（提示词未迁移）。
const dirCache: Map<string, string | null> = new Map<string, string | null>()

async function resolveAbilityDir(dirName: string, promptFile: string): Promise<string | null> {
  if (dirCache.has(dirName)) return dirCache.get(dirName) as string | null
  const candidates: string[] = [
    join(HERE, 'abilities', dirName),
    resolve(HERE, '../../src/host/abilities', dirName),
  ]
  for (const dir of candidates) {
    const st = await fsp.stat(join(dir, promptFile)).catch(() => null)
    if (st) { dirCache.set(dirName, dir); return dir }
  }
  dirCache.set(dirName, null)
  return null
}

// 读取能力提示词全文。读不到（模板缺失）返回 null，由调用方回退内联文本；读盘异常同样
// 回退并告警——提示词不可用不应让整次生成任务失败。
export async function loadAbilityPrompt(
  ability: { dir?: string | null; promptFile?: string | null } | null | undefined,
): Promise<string | null> {
  if (!ability || !ability.dir) return null
  const promptFile: string = ability.promptFile || 'prompt.md'
  const dir: string | null = await resolveAbilityDir(ability.dir, promptFile)
  if (!dir) return null
  try {
    return await fsp.readFile(join(dir, promptFile), 'utf8')
  } catch (err) {
    const source = err as { code?: unknown; message?: unknown } | null | undefined
    if (!source || source.code !== 'ENOENT') {
      const detail: unknown = (source && source.message) || err
      console.warn('[fs] 提示词读取失败（回退内联文本）: ' + String(detail))
    }
    return null
  }
}
