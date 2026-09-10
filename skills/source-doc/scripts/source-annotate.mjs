#!/usr/bin/env node
// source-annotate — 源码注解「骨架填充」生成器（source-doc 技能的确定性配套）
//
// 职责：
//   skeleton：按源码真实行号逐行切分可注解单元（连续注释行合并为块、代码行逐行、
//             纯符号行/空行跳过），输出一张「填空题」——模型只需在每行「注解: 」后
//             写中文，行号/排版/索引/校验全部由本脚本保证。
//   build：读取填好的骨架，按源码真实行号取回代码，按「代码行>78 或 注解>30 字」
//          决定行尾/行上方排版，产出 <书库根>/源码注解/<包名>-<文件名>.md，
//          更新 index.json 的「源码层」，自校验行号，最后删骨架（中间产物用完即删）。
//
// 契约（书库集中模型，见 docs/book-store-decisions.md 与 docs/book-store-spec.md）：
//   书库根 = $DSH_HOME/books/<projectKey(项目根绝对路径)>/；显式 --book <path> 兼容保留
//   （传了就用它，旧/手工调用不破坏）；未传时自动推导新桶（--root 或从 --src/--rel、layout 目标推导）。
//
// 术语：本脚本不生成集中术语表。术语/名称的中文翻译直接内联在注解里（English（中文）），
//       模型在首次出现的术语/名称后就地写中文，读者顺读即懂，不再有独立「术语表」章节。
//
// 防错（本脚本的设计目标：让"乱"在产出前就被拦住，而不是产出后再人工发现）：
//   1) 排版自检 checkHealth()：落盘前检查注解占比、行上方注解缩进是否与代码一致、
//      正文是否被空行割裂、是否连一个 `// [N]` 注解标记都没有——任一异常直接 build 失败。
//   2) 行上方注解继承代码行前导缩进 + 空行按源码行号连续性判断（相邻不空行、源码空行才空行）。
//   —— 以上两点是本脚本问题台账 2026-08-31 排版本次修复的根因（排版乱、需人工返工）。
//
// 用法：
//   node scripts/source-annotate.mjs skeleton <源文件> --skeleton <骨架文件>
//   node scripts/source-annotate.mjs build <骨架文件> --src <真实源码路径> --rel <记录的源码路径> --book <书库根> [--doc-name <stem>] [--no-index]
//   node scripts/source-annotate.mjs layout <项目根> [--out <书库根>]
//
// 说明：--rel 是写入 frontmatter「源码路径」与 index.json 的值（工作区名/相对路径，如 DSHworkPace/plugins/x/src/y.js）；
//       --src 是实际读文件的系统路径。文档命名按统一规则（完整相对路径前缀，与 file-doc 一致）；
//       --book 未传时自动 = $DSH_HOME/books/<projectKey(项目根绝对路径)>/（项目根取 --root/--src+--rel 推导）。
//       仅依赖 Node 内置模块。

import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { homedir } from 'node:os'

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const mode = argv[0]
const argOf = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const has = (name) => argv.includes(name)

// 生成时间：本次注解生成时刻（重生成即刷新——读者据此判断这份注解是否已与源码脱节）。
function formatStamp(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const err = (msg) => {
  process.stderr.write(`\n[source-annotate] ${msg}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 书库集中化：桶名 + 书库根推导
// projectKey 与 DSH session format.ts projectKey 及 src/host/fs-utils.js 同步：
//   逐字复刻 packages/session/session-persistence-jsonl/src/format.ts 的 projectKey()，
//   可读编码（非哈希）：'/' '\\' ':' 连段转 '-'，其余非安全字符转 ~XXXX（十六进制大写 4 位）。
//   对拍：/home/xuepeng/DSH → --home-xuepeng-DSH--；/home/xuepeng/源码志 → --home-xuepeng-~6E90~7801~5FD7--
// ---------------------------------------------------------------------------
function projectKey(p) {
  if (p.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < p.length; i++) {
    const code = p.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

// 书库根 = $DSH_HOME/books（process.env.DSH_HOME 优先；缺省 ~/.dsh/books）
function booksRoot() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'books')
}

// 项目根绝对路径推导（供 index.json「项目根」字段与自动桶推导共用）：
//   ① --root <项目根绝对路径> 显式给定（推荐）
//   ② --book 旧模型路径反推：<root>/.book/<basename(root)>-book/ → root = dirname(dirname(book))
//   ③ build 模式从 --src 与 --rel 推导（rel 去掉工作区名后 = src 的项目根相对路径尾巴）
//   ④ 均无 → undefined
function inferProjectRoot(rootOpt, bookOpt, src, rel) {
  if (rootOpt) return resolve(rootOpt)
  if (bookOpt) {
    const b = resolve(bookOpt)
    if (basename(dirname(b)) === '.book' && basename(b).endsWith('-book')) return dirname(dirname(b))
  }
  if (src && rel) {
    const relPath = String(rel).split('/').filter(Boolean).slice(1).join('/') // 去掉工作区名后的相对路径
    const tail = '/' + relPath
    const srcNorm = resolve(src)
    if (relPath && srcNorm.endsWith(tail)) return srcNorm.slice(0, srcNorm.length - tail.length)
  }
  return undefined
}

// 书库根：显式 --book 优先（兼容旧调用，传了就用它）；
//   未传 = $DSH_HOME/books/<projectKey(项目根绝对路径)>/，项目根取 --root / --src+--rel 推导。
function resolveBook(bookOpt, rootOpt, src, rel) {
  if (bookOpt) return resolve(bookOpt)
  const pr = inferProjectRoot(rootOpt, bookOpt, src, rel)
  if (!pr) err('需要 --book <书库根>（显式兼容），或 --root <项目根绝对路径>（自动推导 $DSH_HOME/books/<projectKey>/ 桶；build 也可经 --src/--rel 推导）')
  return join(booksRoot(), projectKey(pr))
}

// ---------------------------------------------------------------------------
// 单元划分
// block：连续注释行合并为一个单元（文件头/块注释），标 [起-止]
// line ：单个可注解代码行，标 [N]
// 空行 / 纯符号行：不生成单元
// ---------------------------------------------------------------------------
function buildUnits(srcLines) {
  const units = []
  let pending = null
  const flush = () => {
    if (pending) { units.push(pending); pending = null }
  }
  for (let i = 0; i < srcLines.length; i++) {
    const raw = srcLines[i]
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

// ---------------------------------------------------------------------------
// 骨架渲染
// ---------------------------------------------------------------------------
function renderSkeleton(units, srcPath, srcLines) {
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
    .map((u) =>
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

// ---------------------------------------------------------------------------
// build：解析骨架 → 权威行号取码 → 排版 → 落盘 → 索引 → 校验 → 删骨架
// ---------------------------------------------------------------------------
function parseSkeleton(skText) {
  const units = []
  let cur = null
  let collectingCode = false
  let summary = ''
  let inSummary = false
  const codeParts = []
  const flushCode = () => {
    if (collectingCode) { cur.code = codeParts.join('\n'); collectingCode = false; codeParts.length = 0 }
  }
  for (const line of skText.split('\n')) {
    const t = line.trim()
    if (inSummary) {
      // 摘要区：只取「注解: » 后的内容，遇到下一个 @行/@块 则退出摘要区
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
    if (blk) { flushCode(); cur = { type: 'block', start: +blk[1], end: +blk[2], note: '', code: '' }; units.push(cur) }
    else if (one) { flushCode(); cur = { type: 'line', start: +one[1], end: +one[1], note: '', code: '' }; units.push(cur) }
    else if (cur && t.startsWith('注解:')) { cur.note = line.slice(line.indexOf('注解:') + 3).trim() }
    else if (cur && t.startsWith('代码:')) { collectingCode = true; codeParts.push(line.slice(line.indexOf('代码:') + 3).trim()) }
  }
  flushCode()
  return { units, summary }
}

// ---------------------------------------------------------------------------
// 语言推断（按源文件扩展名）：不再硬编码 javascript，产物代码块正确高亮。
// ---------------------------------------------------------------------------
const LANG_BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', h: 'c', cpp: 'cpp',
  hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php', nix: 'nix', sh: 'bash',
  bash: 'bash', zsh: 'bash', yml: 'yaml', yaml: 'yaml', json: 'json',
  css: 'css', scss: 'scss', html: 'html', vue: 'vue', toml: 'toml',
}
function langOf(path) {
  const ext = path.split('.').pop().toLowerCase()
  return LANG_BY_EXT[ext] || 'javascript'
}

// ---------------------------------------------------------------------------
// 统一命名（与 file-doc 一致）：文件名前缀 = 文件相对工作区根的完整父目录路径
// （原样保留全部层级，用 - 连）。相对路径唯一 → 文件名必然唯一。
// rel 格式 = 工作区名 + '/' + 相对工作区根路径（宿主契约）。返回【不含 .md】的文件名主体。
// 如 rel=ws/dsh/index.js → dsh-index；rel=ws/src/client/index.js → src-client-index。
// 顶层文件（无父目录）用工作区名做前缀，如 ws/README.md → ws-README。
// ⚠ 命名规则三处实现，改动必须三处同步，否则宿主 hasDoc 判定与技能落盘文件名漂移：
//   ① src/host/fs-utils.js computeDocStem
//   ② skills/file-doc/scripts/file-doc.mjs computeName
//   ③ 本函数（skills/source-doc/scripts/source-annotate.mjs computeName）
// ---------------------------------------------------------------------------
function computeName(rel) {
  const parts = String(rel || '').split('/').filter(Boolean)   // [工作区名, ...父目录, 文件名]
  const relParents = parts.slice(1, -1)                         // 相对路径的父目录段（原样，含系统目录）
  const fileName = parts[parts.length - 1] || ''
  const stem = fileName.replace(/\.(md|markdown|js|ts|jsx|tsx|py|go|rs|json|yml|yaml|c|cpp|h|java|rb|php|sh|sql|mjs|d\.ts)$/i, '')
  if (relParents.length === 0) return `${parts[0]}-${stem}`     // 顶层/工作区根直接文件
  return `${relParents.join('-')}-${stem}`                      // 完整相对路径前缀，绝对唯一
}

// ---------------------------------------------------------------------------
// 产物健康自检（防错闸门）：build 落盘前检查「内容 + 排版」是否健康。
// 设计初衷：之前的脚本只查了行号越界/无单元，从不查排版是否合理，
// 导致「行上方注解与代码错位、单元间被空行割裂」这类乱排版能悄悄产出。
// 这里的检查在任何内容异常时直接 err() 让 build 失败，而不是产出后再人工发现。
// 检查项：
//   1) 注解占比：非 block 行单元里「无注解」的比例过高（模型漏填/没填）→ 报错；
//   2) 行上方注解缩进：注解行前导缩进必须等于其目标代码行缩进（新增排版规则的本意），
//      不一致说明渲染逻辑被改坏 → 报错；
//   3) 空行割裂：正文里出现连续 2+ 个空行（本脚本只在源码行号不连续处插入单空行，
//      多连空行说明排版逻辑或骨架注解异常）→ 报错；
//   4) 代码行标签：注解正文里至少要有 `// [` 注解标记，防止整页全是裸代码（漏注解）。
// ---------------------------------------------------------------------------
function checkHealth(codeOut) {
  const bad = []

  // 1) 注解占比：统计含 `// [` 注解标记的单元行 vs 应注解代码行
  const annotatedLines = codeOut.filter((l) => /\/\/\s*\[.*?\]/.test(l)).length
  const codeLines = codeOut.filter((l) => {
    const s = l.trim()
    return s && !s.startsWith('//') && !/<\/?$/.test(s)
  }).length
  const total = annotatedLines + codeLines
  if (total > 0) {
    const ratio = annotatedLines / total
    if (ratio < 0.5) bad.push(`注解占比过低（${(ratio * 100).toFixed(0)}%<50%）：疑似大量代码行未填注解`)
  }
  if (total === 0) bad.push('正文没有任何可注解或代码行，产物为空')

  // 2) 行上方注解缩进一致性：对每条「行上方注解行」<注：这里以 codeOut 已渲染的行首 `[空格]*//` 判定>
  //    取其后紧跟的第一个非空代码行，比较两者前导缩进是否一致。
  for (let i = 0; i < codeOut.length; i++) {
    const l = codeOut[i]
    if (!/^[\t ]*\/\/\s*\[.*?\]/.test(l)) continue // 只关心行上方注解行
    const annIndent = l.match(/^[\t ]*/)[0]
    // 找向后第一个非空行作为目标代码行
    let j = i + 1
    while (j < codeOut.length && codeOut[j].trim() === '') j++
    if (j >= codeOut.length) continue
    const codeIndent = codeOut[j].match(/^[\t ]*/)[0]
    if (annIndent !== codeIndent) {
      bad.push(`行上方注解缩进与代码不一致（第 ${i} 行）. 注解缩进=${JSON.stringify(annIndent)} 代码缩进=${JSON.stringify(codeIndent)}`)
    }
  }

  // 3) 连续空行：正文中不应出现连续 2+ 空行（本脚本只在源码空行处插单空行）
  let run = 0
  for (const l of codeOut) {
    if (l.trim() === '') { run++; if (run >= 2) { bad.push('正文出现连续空行（>1），排版被空行割裂'); break } }
    else run = 0
  }

  // 4) 至少要有注解标记
  if (!codeOut.some((l) => /\/\/\s*\[.*?\]/.test(l))) bad.push('正文找不到任何 `// [N]` 注解标记（疑似全部漏注解）')

  if (bad.length) {
    process.stderr.write('\n[source-annotate] 产物健康自检未通过：\n')
    for (const b of bad) process.stderr.write(`  ✗ ${b}\n`)
    process.stderr.write('请修正后重跑 build（或确认 --src 与骨架注解均已正确填写）。\n')
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// layout：推导并打印目标书库布局（书库根/源码注解目录/index.json），
// 让模型不用手工算 `$DSH_HOME/books/<projectKey(项目根)>/` 这类路径。
// 用法：node scripts/source-annotate.mjs layout <项目根> [--out <书库根>]
// ---------------------------------------------------------------------------
if (mode === 'layout') {
  const target = argv[1]
  if (!target) err('layout 需要 <项目根>')
  // [03] 修正：对 target 做 resolve 归一化，使 `.` / `..` 能解析成真实目录名后再取 basename
  const absTarget = resolve(target)
  const proj = absTarget.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
  const override = argOf('--out')
  const book = override || join(booksRoot(), projectKey(absTarget))
  const outDir = join(book, '源码注解')
  process.stdout.write([
    `项目名: ${proj}`,
    `书库根: ${book}`,
    `源码注解目录: ${outDir}`,
    `中央索引: ${join(book, 'index.json')}`,
    `--out 未传时书库根 = $DSH_HOME/books/<projectKey(项目根绝对路径)>/（目标目录即项目根）`,
  ].join('\n') + '\n')
} else if (mode === 'skeleton') {
  const src = argv[1]
  if (!src) err('skeleton 需要 <源文件>')
  const srcLines = readFileSync(src, 'utf8').split('\n')
  const units = buildUnits(srcLines)
  if (units.length === 0) {
    process.stderr.write(`\n[source-annotate] 警告: ${src} 无任何可注解单元（空文件/仅注释说明？），产物将为空。\n`)
  }
  const sk = renderSkeleton(units, src, srcLines)
  const out = argOf('--skeleton')
  if (out) {
    writeFileSync(out, sk)
    process.stdout.write(`\nskeleton 已生成: ${out}（${units.length} 个可注解单元）\n`)
  } else {
    process.stdout.write(sk)
  }
} else if (mode === 'build') {
  const skeleton = argv[1]
  const src = argOf('--src')          // 实际读文件的路径（可选；缺省用骨架内 code）
  const rel = argOf('--rel')          // 写入 frontmatter/index 的源码路径
  const bookOpt = argOf('--book')
  const rootOpt = argOf('--root')
  const book = resolveBook(bookOpt, rootOpt, src, rel)
  const projectRoot = inferProjectRoot(rootOpt, bookOpt, src, rel)
  const docName = argOf('--doc-name') // 可选：显式文档文件名（不带 .md），用于同名消歧
  if (!skeleton || !rel) err('build 需要 <骨架> --rel [--book <书库根> | --root <项目根绝对路径>] [--src] [--doc-name]')

  const parsed = parseSkeleton(readFileSync(skeleton, 'utf8'))
  const units = parsed.units
  const summary = parsed.summary
  if (units.length === 0) err('骨架无任何可注解单元（@行/@块），请确认源文件非空且 skeleton 阶段未漏切分')
  const authority = src ? readFileSync(src, 'utf8').split('\n') : null

  // 取权威代码（传 --src 用真实行号并校验越界；不传用骨架内 code）
  const rendered = []
  for (const u of units) {
    if (authority) {
      if (u.start < 1 || u.end < u.start || u.end > authority.length)
        err(`单元 [${u.start}-${u.end}] 越界（源码共 ${authority.length} 行）`)
      rendered.push({
        type: u.type, start: u.start, end: u.end, note: u.note,
        code: authority.slice(u.start - 1, u.end).join('\n'),
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
  const codeOut = []
  let prevEnd = 0
  for (const r of rendered) {
    const note = r.note || ''
    const rangeLabel = r.start === r.end ? `[${r.start}]` : `[${r.start}-${r.end}]`
    const indent = (r.code || '').match(/^[\t ]*/)[0] // 代码行前导缩进
    // 源码中该单元与其前一单元之间若有空行/被跳过行（行号不连续），保留一个空行分隔
    if (prevEnd && r.start - prevEnd > 1) codeOut.push('')
    if (r.type !== 'block' && r.start === r.end && !(r.code.length > 78) && !([...note].length > 30) && note) {
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

  // 防错闸门：落盘前做「内容 + 排版」健康自检，异常直接 build 失败，避免产出乱排版产物
  checkHealth(codeOut)

  // frontmatter 与文件名
  const file = rel.split('/').pop()                 // index.js
  const summaryPart = summary ? summary : '（待补充：一句话说明这页代码存在的价值）'
  const doc = `---
源码路径: ${rel}
层级: 源码
生成时间: ${formatStamp(new Date())}
---

# ${file}（逐行中文注解）

**路径**：${rel}

> **解决什么问题**：${summaryPart}

## 逐行注解（行间插入，注释已并入注解行）

\`\`\`${langOf(rel)}
${body}
\`\`\`
`
  const outDir = join(book, '源码注解')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const docStem = docName || computeName(rel)  // 统一命名（完整相对路径前缀）；--doc-name 可显式覆盖
  const outFile = join(outDir, `${docStem}.md`)
  writeFileSync(outFile, doc)
  process.stdout.write(`\n已生成: ${outFile}\n`)

  // 更新 index.json「源码层」
  if (!has('--no-index')) {
    const indexFile = join(book, 'index.json')
    // index.json 不存在则自动初始化（全新书库零报错），结构对齐既有书库
    if (!existsSync(indexFile)) {
      // 集中模型：「项目根」= 项目根绝对路径（旧值为 basename）；「项目」= 项目名
      const projName = projectRoot ? basename(projectRoot) : basename(book).replace(/-book$/, '')
      const init = { '项目': projName, '项目根': projectRoot || projName, '目录层': [], '文件层': [], '源码层': [] }
      writeFileSync(indexFile, JSON.stringify(init, null, 2) + '\n')
      process.stdout.write(`index.json 不存在，已自动初始化: ${indexFile}\n`)
    }
    const idx = JSON.parse(readFileSync(indexFile, 'utf8'))
    // 顶层「项目根」按新约定归一为绝对路径（旧值为 basename，读取仅展示不做转换）
    if (projectRoot) {
      idx['项目'] = basename(projectRoot)
      idx['项目根'] = projectRoot
    }
    if (!Array.isArray(idx['源码层'])) idx['源码层'] = []
    const exists = idx['源码层'].some((e) => e['源码路径'] === rel)
    if (!exists) {
      idx['源码层'].push({ '源码路径': rel, '文档': `源码注解/${docStem}.md` })
      writeFileSync(indexFile, JSON.stringify(idx, null, 2) + '\n')
      process.stdout.write(`index.json 已更新（源码层追加 ${rel}）\n`)
    } else {
      process.stdout.write(`index.json 源码层已含 ${rel}，跳过\n`)
    }
  }

  rmSync(skeleton, { force: true }) // 中间产物用完即删
  process.stdout.write(`skeleton 已删除（中间产物用完即删）\n`)
} else {
  err(`未知模式: ${mode}（仅支持 skeleton | build）`)
}
