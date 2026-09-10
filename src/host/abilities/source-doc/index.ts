// L3 源码注解 — 能力描述符（宿主内置，2026-09-10 去技能化）。
// 确定性工作（单元划分 / 骨架渲染 / 行号 / 排版 / frontmatter / 命名 / index.json「源码层」/ 产物自检）
// 全部由宿主完成，模型只写中文语义；技能 skills/source-doc 保留，仅供会话内人工调用。
// 与 L1/L2 的关键差别在骨架体量：L3 骨架 ≈ 源码全文 ×1.5（482 行源码 ≈ 40KB），注入提示词会挤占
// 上下文、模型也无法分段读——故骨架落盘到子 agent 的 cwd（skeletonFile），模型用 read 分段读、
// 用 edit 分批填空；产物不由模型写，由宿主收尾解析骨架并构建（hostBuild）。
import { dirname } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { computeDocStem } from '../../fs-utils.ts'
import { buildSourceSkeleton } from './skeleton.ts'
import { annotationStats, parseFilledSkeleton, renderAnnotatedDoc } from './doc-render.ts'
import { ZH } from '../../../shared/locale.ts'

export default {
  kind: 'src',
  dir: 'source-doc',
  sub: '源码注解',
  arr: '源码层',
  layer: '源码',
  hostIndex: true,
  skeletonFile: true,
  hostBuild: true,
  scope: 'src',
  promptFile: 'prompt.md',
  // 文档名 = computeDocStem（与 source-annotate.mjs 的 computeName 同规则，三处同步约定见 fs-utils.js）。
  docStem: (target: { key: string }): string => computeDocStem(target.key),
  // 骨架只产出文本：落盘路径与提示词变量由执行器负责（skeletonFile 契约）。
  skeleton: async ({ abs }: { abs: string }): Promise<string> => (await buildSourceSkeleton({ abs })).text,
  // 收尾校验（空转判据）：DOC 由宿主 finalize 写盘，故「产物 mtime/size 未变化」判据失效，
  // 改为看骨架里的注解填充情况——骨架不存在 = 子 agent 侧异常；无单元 = 目标文件无可注解内容；
  // 一条注解都没填 = 空转（实测过：输出预算全花在推理上，工具调用一个没发）。
  async verify({ skeletonPath }: { skeletonPath: string }): Promise<void> {
    const text = await readFile(skeletonPath, 'utf8').catch(() => null)
    if (text === null) throw new Error(ZH.errSrcSkeletonMissing + skeletonPath)
    const { units } = parseFilledSkeleton(text)
    const { filled, total } = annotationStats(units)
    if (total === 0) throw new Error(ZH.errSrcSkeletonNoUnit + skeletonPath)
    if (filled === 0) throw new Error(ZH.errSrcNoAnnotation + skeletonPath)
  },
  // 宿主构建产物（顺序固定）：读骨架 → 解析 → 按源码真实行号取码排版 → 自检 → 落盘 → 删骨架。
  // 自检不通过时**不写 DOC、不删骨架**：半成品不落书库，骨架留现场便于排查。
  async finalize({ docAbs, skeletonPath, targetKey, layer, generatedAt, abs }: {
    docAbs: string
    skeletonPath: string
    targetKey: string
    layer: string
    generatedAt: string
    abs: string
  }): Promise<void> {
    const text = await readFile(skeletonPath, 'utf8')
    const { units, summary } = parseFilledSkeleton(text)
    // 行号权威源是源码本身（骨架里的 code 仅在缺源码时兼容用）：模型改坏骨架也不至于错位。
    // split('\n') 与技能脚本一致，行号口径（1 起）不变。
    const srcLines = (await readFile(abs, 'utf8')).split('\n')
    const { doc, problems } = renderAnnotatedDoc({ units, summary, srcLines, rel: targetKey, layer, generatedAt })
    // 源写 `problems && problems.length > 0`；`problems` 运行时恒为数组（checkHealth 恒返回数组），
    // 该守卫在类型系统下恒真，故按其等价形式判定 —— 行为与源逐字相同（无可观察差异）。
    if (problems.length > 0) {
      throw new Error(ZH.errHealthCheck + problems.join('；'))
    }
    await mkdir(dirname(docAbs), { recursive: true })
    await writeFile(docAbs, doc, 'utf8')
    await rm(skeletonPath, { force: true })
  },
}
