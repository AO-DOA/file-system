// L3 源码注解 — 确定性骨架渲染（宿主内置，2026-09-10 去技能化）。
// 本文件职责：把目标源码切分成「可注解单元」并渲染成一张填空题骨架（模型只写中文语义，
// 行号、代码原文、排版、产物与自检全由宿主保证）。
// 迁自 skills/source-doc/scripts/source-annotate.mjs 的 buildUnits() + renderSkeleton()
// 与 skeleton 命令入口，逻辑与文案逐字等价，仅把 CLI 形态换成可 import 的纯函数。
// 该技能与脚本保留，仅供会话内人工调用；宿主不再依赖它。只依赖 Node 内置模块。
import { readFile } from 'node:fs/promises'

// 可注解单元（源里以注释给出 `Unit = { type, start, end, code, note }`；TS 下显式声明形状）。
interface Unit {
  type: 'block' | 'line'
  start: number
  end: number
  code: string
  note: string
}

// 单元划分（等价脚本 buildUnits）：连续 `//` 注释行合并为一个 block 单元（start/end 为首尾行号，
// code 用 \n 连接原行、保留缩进）；其余可注解代码行各成一个 line 单元；空行与「纯符号行」
// （trim 后只由 { } , ; 与空白组成）不生成单元。行号 1 起，且等于源码真实行号。
// Unit = { type: 'block'|'line', start: number, end: number, code: string, note: string }
export function buildUnits(srcLines: readonly string[]): Unit[] {
  const units: Unit[] = []
  let pending: Unit | null = null
  const flush = (): void => {
    if (pending) { units.push(pending); pending = null }
  }
  for (let i = 0; i < srcLines.length; i++) {
    // `as string` 是纯类型断言（编译后零残留）：循环边界内 i < length，取值与源实现逐字相同。
    const raw = srcLines[i] as string
    const t = raw.trim()
    const lineNo = i + 1
    if (t === '') { flush(); continue }
    if (t.startsWith('//')) {
      if (!pending) pending = { type: 'block', start: lineNo, end: lineNo, code: raw, note: '' }
      else { pending.end = lineNo; pending.code += '\n' + raw }
      continue
    }
    flush()
    if (/^[{}\s,;]*$/.test(t)) continue // 纯符号行（{ } ; ,）不注解
    units.push({ type: 'line', start: lineNo, end: lineNo, code: raw, note: '' })
  }
  flush()
  return units
}

// 渲染骨架文本（等价脚本 renderSkeleton，文案逐字不变）：
// 文件头说明 + `@摘要` 段 + 每单元 `@行 [N]`（块则 `@块 [N-M]（注释块，合并为一条注解）`）
// + `代码: <原文>` + `注解: `（空位，留给模型填）+ 空行。
export function renderSourceSkeleton(units: readonly Unit[], srcPath: string): string {
  const head = [
    '# ===== source-doc 骨架（填空题）=====',
    `# 源文件: ${srcPath}`,
    '# 说明：在每行「注解: 」后写出该行（或该块）在干什么的中文解释。',
    '# 首次出现的英文术语/名称，在解释里就地写「English（中文）」：英文后跟一对中文圆括号给中文翻译，',
    '# 这样读者顺读即懂，不再有独立术语表。只给真正的术语/名称加（中文），变量名/普通英文词不加。',
    '# 只管填「注解: 」后的内容；行号与代码原文由脚本保证，不要改动其它行。',
    '',
    '# 先在最上面的「@摘要」后填一句话（本文件解决什么问题），用于产物「> 解决什么问题」，可留空。',
    '',
  ].join('\n')
  const body = units
    .map(u =>
      (u.type === 'block' ? `@块 [${u.start}-${u.end}]（注释块，合并为一条注解）` : `@行 [${u.start}]`) +
      `\n代码: ${u.code}\n注解: \n`,
    )
    .join('')
  // 摘要字段：模型填一句话，build 会写入产物「> 解决什么问题」。不填则保留占位。
  const purpose = [
    '@摘要（这一页代码解决什么问题，一句话；build 写入产物「> 解决什么问题」，可留空）',
    '注解: ',
    '',
  ].join('\n')
  return head + '\n' + purpose + body
}

// 读目标源码文件并渲染骨架。返回 { text, unitCount, lineCount }：
// text 为骨架全文（由调用方落盘到 cwd，提示词只给路径）；unitCount 供填充率校验；
// lineCount 供提示词告知模型骨架规模（大文件分段读）。目标不可读时抛错（路由层已预检，这里是兜底）。
export async function buildSourceSkeleton(
  { abs }: { abs: string },
): Promise<{ text: string; unitCount: number; lineCount: number }> {
  const srcText = await readFile(abs, 'utf8').catch(() => null)
  if (srcText === null) throw new Error('目标不是可读文件: ' + abs)
  const srcLines = srcText.split('\n')
  const units = buildUnits(srcLines)
  return { text: renderSourceSkeleton(units, abs), unitCount: units.length, lineCount: srcLines.length }
}
