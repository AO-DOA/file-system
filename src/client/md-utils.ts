// dsh-plugin-fs — client 纯逻辑层（无 DOM / 无 React，vitest 可直测）。
// 文件树/查看器用到的纯函数：路径/扩展名/语言映射/frontmatter 解析/页签 label 的 key 映射。
// 产品文案不在此层出现：labLabelKey 只返回字典 key，取值为 ../shared/locale 的 t()。
// 模型/wire 数据（文件内容、frontmatter 字段值、ext、path、name）原样透传，不做文案化。

/**
 * 取路径最后一段（'a/b/c.js' -> 'c.js'）。
 * @param p - 路径；空串 / null / undefined 一律返回空串。
 * @returns 最后一段；空尾段（目录尾斜杠场景）回退原串。
 */
export function basename(p: string | null | undefined): string {
  if (!p) return ''
  const parts = String(p).split('/')
  return parts[parts.length - 1] || p
}

/**
 * 取小写扩展名：最后 '.' 之后的部分；无 '.' 或 '.' 在首字符（隐藏文件）返回 ''。
 * 防御：null/undefined 返回 ''（原逻辑直接 lastIndexOf 会抛 TypeError）。
 * @param name - 文件名（可含目录段）。
 * @returns 小写扩展名（不含点）；无扩展名空串。
 */
export function extOf(name: string | null | undefined): string {
  if (!name) return ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

// 扩展名 -> 文件树角标短文本；未知扩展名取前 3 字符大写，无扩展名返回 ''。
const EXT_BADGES: Record<string, string> = { js: 'JS', ts: 'TS', md: 'MD', json: '{}', py: 'PY', css: 'CSS', html: '<>', sh: '$', yml: 'Y', yaml: 'Y' }

/**
 * 扩展名 -> 文件树角标短文本。
 * @param name - 文件名；内部经 {@link extOf} 取扩展名。
 * @returns 已知扩展名的短角标；未知扩展名取前 3 字符大写；无扩展名空串。
 */
export function extBadge(name: string | null | undefined): string {
  const ext = extOf(name)
  return EXT_BADGES[ext] || (ext ? ext.slice(0, 3).toUpperCase() : '')
}

// 扩展名 -> shiki 语言 id；未知回退纯文本兜底。
const LANG_MAP: Record<string, string> = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
  ts: 'ts', tsx: 'ts', mts: 'ts',
  json: 'json', py: 'python', css: 'css', html: 'html', htm: 'html',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript',
  yml: 'yaml', yaml: 'yaml', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  java: 'java', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', sql: 'sql',
  xml: 'xml', svg: 'xml', toml: 'toml', ini: 'ini',
}
const MD_EXTS: Record<string, boolean> = { md: true, markdown: true }

/**
 * 是否 Markdown。
 * @param ext - extOf 结果（已小写）。
 * @returns md / markdown 为 true，其余 false。
 */
export function isMd(ext: string): boolean { return !!MD_EXTS[ext] }

/**
 * 扩展名 -> codeBlock 语言 id；默认 'text'（未命中 LANG_MAP 的纯文本兜底）。
 * @param ext - extOf 结果（已小写）。
 * @returns shiki 语言 id；未命中返回 'text'。
 */
export function langFor(ext: string): string { return LANG_MAP[ext] || 'text' }

// ---- 查看区：按扩展名分流原生渲染 / 等宽兜底 ----

/**
 * 拆 frontmatter：首行 trim 后为 '---' 视为开界，在下一个 trim 为 '---' 的行处闭合。
 * 未闭合（到文末无闭合行）视为无 frontmatter，整文回到 body（原行为）。
 * @param text - 文档全文；空输入返回无 frontmatter。
 * @returns `fm` 头字段文本（null=无 frontmatter；''=空 frontmatter），`body` 正文。
 */
export function splitFrontmatter(text: string | null | undefined): { fm: string | null; body: string } {
  if (!text) return { fm: null, body: '' }
  const lines = String(text).split('\n')
  if (lines.length === 0 || lines[0]?.trim() !== '---') return { fm: null, body: String(text) }
  const fmLines: string[] = []
  let i = 1
  for (; i < lines.length; i++) {
    const line = lines[i]
    // i < lines.length 保证 line 有值；显式判空只为让类型收窄（无运行时差异）。
    if (line === undefined || line.trim() === '---') break
    fmLines.push(line)
  }
  if (i >= lines.length) return { fm: null, body: String(text) }
  return { fm: fmLines.join('\n'), body: lines.slice(i + 1).join('\n') }
}

/**
 * 解析 fm 文本为行数组：'key: value' -> { key, value }；非键行 -> { key: null, value: 原文 }；
 * 纯空白行剔除（不影响 UI 展示的正文语义）。
 * @param fm - frontmatter 头字段文本；空输入返回空数组。
 * @returns 行数组；`key` 为 null 表示该行不是键值行。
 */
export function parseFmRows(fm: string | null | undefined): Array<{ key: string | null; value: string }> {
  if (!fm) return []
  return fm.split('\n').map((l) => {
    const m = l.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    // 正则两个捕获组必然存在（`+` 至少 1 字符，且 `:` 分隔），断言只为满足 noUncheckedIndexedAccess。
    return m ? { key: m[1] as string, value: m[2] as string } : { key: null, value: l }
  }).filter(r => r.key !== null || r.value.trim() !== '')
}

/**
 * 查看模式 -> 页签 label 的字典 key（文案取值由 locale.t 完成）。
 * 'doc' 按对象类型区分：文件夹->目录概览，文件->文件摘要；其余模式唯一；默认源码。
 * @param mode - 查看模式（doc / annot / tr / source）。
 * @param isDir - 目标是否为文件夹（仅 'doc' 模式区分）。
 * @returns 字典 key：labDocDir / labDocFile / labAnnot / labTr / labSrc。
 */
export function labLabelKey(mode: string, isDir: boolean): string {
  if (mode === 'doc') return isDir ? 'labDocDir' : 'labDocFile'
  if (mode === 'annot') return 'labAnnot'
  if (mode === 'tr') return 'labTr'
  return 'labSrc'
}
