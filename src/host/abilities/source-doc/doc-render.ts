// L3 源码注解 — 产物侧确定性逻辑（宿主内置，2026-09-10 去技能化）。
// 本文件职责：解析模型填好的骨架、按源码真实行号取码、排版成逐行注解正文、做落盘前的
// 健康自检，并拼出产物 Markdown（模型不写 DOC，产物由宿主 finalize 落盘）。
// 迁自 skills/source-doc/scripts/source-annotate.mjs 的 parseSkeleton() / langOf() /
// LANG_BY_EXT / checkHealth() 与 build 段的取码、排版、产物渲染，逻辑与文案逐字等价；
// 差异仅两处，均为宿主装配所需：① checkHealth 返回问题描述数组而不写 stderr 退出进程
// （由调用方决定失败方式）；② 产物文本渲染与落盘解耦，frontmatter 的「层级」「生成时间」
// 由调用方传入（脚本里写死为「源码」与当前时刻）。该技能与脚本保留，仅供会话内人工调用。
// 只依赖 Node 内置模块与共享文案字典（第 3 批 C 类字典化后，诊断文案取自 src/shared/locale.ts）。
import { ZH } from '../../../shared/locale.ts'

// 可注解单元（对齐 skeleton.ts 的 Unit 形状：type/start/end/code/note）。
interface Unit {
  type: 'block' | 'line'
  start: number
  end: number
  code: string
  note: string
}

// 解析填好的骨架（等价脚本 parseSkeleton，容错不变）→ { units, summary }：
// 单元代码行收集到下一个 `@行`/`@块`/`注解:` 为止；`@摘要` 段取「注解: 」后的内容。
export function parseFilledSkeleton(skeletonText: string): { units: Unit[]; summary: string } {
  const units: Unit[] = []
  let cur: Unit | null = null
  let collectingCode = false
  let summary = ''
  let inSummary = false
  const codeParts: string[] = []
  const flushCode = (): void => {
    // `cur as Unit` 是纯类型断言（编译后零残留）：collectingCode 仅在 cur 非空时置位（下方 `else if (cur && …)`）。
    if (collectingCode) { (cur as Unit).code = codeParts.join('\n'); collectingCode = false; codeParts.length = 0 }
  }
  for (const line of skeletonText.split('\n')) {
    const t = line.trim()
    if (inSummary) {
      // 摘要区：只取「注解: 」后的内容，遇到下一个 @行/@块 则退出摘要区
      if (t.startsWith('注解:')) { summary = line.slice(line.indexOf('注解:') + 3).trim(); inSummary = false; continue }
      if (t.startsWith('@行') || t.startsWith('@块')) { inSummary = false }
      else continue
    }
    if (t.startsWith('@摘要')) { inSummary = true; continue }
    if (collectingCode) {
      // 代码行收集期间：遇到注解行则终止，否则累积（含 `代码: ` 之后的余量）
      if (t.startsWith('注解:')) { flushCode() }
      else if (t.startsWith('@行') || t.startsWith('@块')) { flushCode() }
      else if (t.startsWith('代码:')) { codeParts.push(line.slice(line.indexOf('代码:') + 3).trim()); continue }
      else if (t === '') { /* 普通空行忽略 */ }
      else { codeParts.push(line) }
    }
    const blk = t.match(/^@块 \[(\d+)-(\d+)\]/)
    const one = t.match(/^@行 \[(\d+)\]/)
    if (blk) { flushCode(); cur = { type: 'block', start: +(blk[1] as string), end: +(blk[2] as string), note: '', code: '' }; units.push(cur) }
    else if (one) { flushCode(); cur = { type: 'line', start: +(one[1] as string), end: +(one[1] as string), note: '', code: '' }; units.push(cur) }
    else if (cur && t.startsWith('注解:')) { cur.note = line.slice(line.indexOf('注解:') + 3).trim() }
    else if (cur && t.startsWith('代码:')) { collectingCode = true; codeParts.push(line.slice(line.indexOf('代码:') + 3).trim()) }
  }
  flushCode()
  return { units, summary }
}

// 围栏语言标签映射（照搬脚本 LANG_BY_EXT）：按源文件扩展名推断，未知扩展名回落 'javascript'。
const LANG_BY_EXT: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', h: 'c', cpp: 'cpp',
  hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php', nix: 'nix', sh: 'bash',
  bash: 'bash', zsh: 'bash', yml: 'yaml', yaml: 'yaml', json: 'json',
  css: 'css', scss: 'scss', html: 'html', vue: 'vue', toml: 'toml',
}
export function langOf(relPath: string): string {
  // `as string` 是纯类型断言（编译后零残留）：split 恒至少一段，故 pop() 运行时非空。
  const ext = (relPath.split('.').pop() as string).toLowerCase()
  return LANG_BY_EXT[ext] || 'javascript'
}

// 注解填充统计（按单元）：filled = note 非空的单元数，total = 单元总数，ratio = filled/total
// （total 为 0 时 ratio 记 0）。宿主收尾用它判空转：total 为 0 或 filled 为 0 即失败。
// 入参放宽到 null/undefined 与「含假值元素」：源实现 `units || []` 与 `u && u.note` 都按假值兜底。
export function annotationStats(
  units: readonly (Unit | null | undefined)[] | null | undefined,
): { filled: number; total: number; ratio: number } {
  const list = units || []
  const total = list.length
  const filled = list.filter(u => u && u.note).length
  return { filled, total, ratio: total > 0 ? filled / total : 0 }
}

// 产物健康自检（等价脚本 checkHealth，四项逐字照搬），返回问题描述数组，空数组 = 健康。
// 与脚本的唯一差异：不写 stderr、不 process.exit（由调用方决定失败方式）。
//   1) 注解占比 < 50%（含 `// [` 的注解行 vs 代码行），以及正文完全为空；
//   2) 「行上方注解」前导缩进与紧随其后第一个非空代码行不一致；
//   3) 正文出现连续 2+ 空行（排版被空行割裂）；
//   4) 正文找不到任何 `// [N]` 注解标记（疑似全部漏注解）。
export function checkHealth(codeOut: readonly string[]): string[] {
  const bad: string[] = []

  // 1) 注解占比：统计含 `// [` 注解标记的单元行 vs 应注解代码行
  const annotatedLines = codeOut.filter(l => /\/\/\s*\[.*?\]/.test(l)).length
  const codeLines = codeOut.filter((l) => {
    const s = l.trim()
    return s && !s.startsWith('//') && !/<\/?$/.test(s)
  }).length
  const total = annotatedLines + codeLines
  if (total > 0) {
    const ratio = annotatedLines / total
    if (ratio < 0.5) bad.push(ZH.errHealthLowRatio + (ratio * 100).toFixed(0) + ZH.errHealthLowRatioEnd)
  }
  if (total === 0) bad.push(ZH.errHealthEmptyBody)

  // 2) 行上方注解缩进一致性：对每条「行上方注解行」<注：这里以 codeOut 已渲染的行首 `[空格]*//` 判定>
  //    取其后紧跟的第一个非空代码行，比较两者前导缩进是否一致。
  for (let i = 0; i < codeOut.length; i++) {
    const l = codeOut[i] as string
    if (!/^[\t ]*\/\/\s*\[.*?\]/.test(l)) continue // 只关心行上方注解行
    // `as RegExpMatchArray` 是纯类型断言（正则恒匹配行首，编译后零残留）
    const annIndent = (l.match(/^[\t ]*/) as RegExpMatchArray)[0]
    // 找向后第一个非空行作为目标代码行
    let j = i + 1
    while (j < codeOut.length && (codeOut[j] as string).trim() === '') j++
    if (j >= codeOut.length) continue
    const codeIndent = ((codeOut[j] as string).match(/^[\t ]*/) as RegExpMatchArray)[0]
    if (annIndent !== codeIndent) {
      bad.push(
        ZH.errHealthIndent + String(i) + ZH.errHealthIndentMid
        + JSON.stringify(annIndent) + ZH.errHealthIndentEnd + JSON.stringify(codeIndent),
      )
    }
  }

  // 3) 连续空行：正文中不应出现连续 2+ 空行（本脚本只在源码空行处插单空行）
  let run = 0
  for (const l of codeOut) {
    if (l.trim() === '') { run++; if (run >= 2) { bad.push(ZH.errHealthBlankRun); break } }
    else run = 0
  }

  // 4) 至少要有注解标记
  if (!codeOut.some(l => /\/\/\s*\[.*?\]/.test(l))) bad.push(ZH.errHealthNoMarker)

  return bad
}

// 渲染单元（取码后的中间形状，字段与 Unit 同形）。
interface RenderedUnit {
  type: 'block' | 'line'
  start: number
  end: number
  note: string
  code: string
}

// renderAnnotatedDoc 的入参：srcLines 可选——不传时回落用骨架内 code（兼容不传源码的调用）。
interface RenderInput {
  units: readonly Unit[]
  summary: string
  srcLines?: readonly string[]
  rel: string
  layer: string
  generatedAt: string
}

// 产物渲染：按真实行号取码 → 排版 → frontmatter/标题/正文，返回 { doc, problems }。
// 取码：srcLines 给出时以它为权威行号源（单元行号越界直接抛错，错误信息含单元范围与源码总行数）；
// srcLines 缺失时回落用骨架内 code（兼容不传源码的调用）。
// 排版（照搬脚本，逐字一致）：单元与前单元行号不连续先插一个空行；
//   type !== 'block' && start === end && code 长度 <= 78 && note 字符数 <= 30 && note 非空
//   → 行尾 `<code>  // [N] <note>`；否则行上方 `<缩进>// [label] <note>` + 代码行
//   （缩进取代码行前导空白；块且 note 为空时保留原代码行，避免丢内容）。
// problems 非空时调用方必须让任务失败（不得落盘半成品）。
// 类型按运行时事实标为 `string[]`（checkHealth 恒返回数组）：源里 `if (problems && problems.length > 0)`
// 的 `problems &&` 是 JS 习惯写法、在类型系统下恒真，故调用方按其等价形式 `problems.length > 0` 判定 ——
// 运行时行为与源逐字相同（无可观察差异）。
export function renderAnnotatedDoc(
  { units, summary, srcLines, rel, layer, generatedAt }: RenderInput,
): { doc: string; problems: string[] } {
  // 取权威代码：传 srcLines 用真实行号并校验越界；不传用骨架内 code
  const rendered: RenderedUnit[] = []
  for (const u of units) {
    if (srcLines) {
      if (u.start < 1 || u.end < u.start || u.end > srcLines.length)
        throw new Error(
          ZH.errUnitOutOfRange + String(u.start) + ZH.errUnitOutOfRangeMid + String(u.end)
          + ZH.errUnitOutOfRangeMid2 + String(srcLines.length) + ZH.errUnitOutOfRangeEnd,
        )
      rendered.push({
        type: u.type, start: u.start, end: u.end, note: u.note,
        code: srcLines.slice(u.start - 1, u.end).join('\n'),
      })
    } else {
      rendered.push({ type: u.type, start: u.start, end: u.end, note: u.note, code: u.code || '' })
    }
  }

  // 排版 + 渲染正文
  // 排版原则（修复「乱」的三个根因）：
  //   1) 行上方注解行继承其代码行的前导缩进，避免注解与代码左右错位；
  //   2) 空行按源码行号连续性判断：前后单元行号相邻则不空行，源码本有空行（行号不连续）才空行，贴合源码结构；
  //   3) block 注释的注解行同样带源码缩进。
  const codeOut: string[] = []
  let prevEnd = 0
  for (const r of rendered) {
    const note = r.note || ''
    const rangeLabel = r.start === r.end ? `[${r.start}]` : `[${r.start}-${r.end}]`
    const indent = ((r.code || '').match(/^[\t ]*/) as RegExpMatchArray)[0] // 代码行前导缩进
    // 源码中该单元与其前一单元之间若有空行/被跳过行（行号不连续），保留一个空行分隔
    if (prevEnd && r.start - prevEnd > 1) codeOut.push('')
    // `Array.from(note)` 与源的 `[...note]` 语义逐字等价（都按 Unicode 码点计数）；
    // 仅为避开 oxlint no-misused-spread 而换写法，判定口径不变。
    if (r.type !== 'block' && r.start === r.end && !(r.code.length > 78) && !(Array.from(note).length > 30) && note) {
      // 短行 + 短注解 → 行尾
      codeOut.push(`${r.code}  // ${rangeLabel} ${note}`)
    } else {
      // 行上方注解（注释块/长行/长注解）：注解行继承代码行缩进，紧跟代码行，无间隔
      if (note) codeOut.push(`${indent}// ${rangeLabel} ${note}`)
      // 注释块：注解已并入注解行，原注释删除（一处解释不重复）；但注解为空时保留原文以免丢失。
      if (r.type !== 'block' || !note) codeOut.push(r.code)
    }
    prevEnd = r.end
  }
  const body = codeOut.join('\n').replace(/\n{3,}/g, '\n\n') // 去多余空行

  // 防错闸门：落盘前做「内容 + 排版」健康自检，异常交由调用方让任务失败，避免产出乱排版产物
  const problems = checkHealth(codeOut)

  // frontmatter 与文件名
  const file = rel.split('/').pop() as string            // index.js
  const summaryPart = summary ? summary : '（待补充：一句话说明这页代码存在的价值）'
  const doc = `---
源码路径: ${rel}
层级: ${layer}
生成时间: ${generatedAt}
---

# ${file}（逐行中文注解）

**路径**：${rel}

> **解决什么问题**：${summaryPart}

## 逐行注解（行间插入，注释已并入注解行）

\`\`\`${langOf(rel)}
${body}
\`\`\`
`
  return { doc, problems }
}
