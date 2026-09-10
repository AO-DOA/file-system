#!/usr/bin/env node
// file-doc 生成器（file-doc 技能的确定性配套）
//
// 契约（来自宿主 dsh-plugin-file-system-zc/lib/index.js）：
//   书库根 = $DSH_HOME/books/<projectKey(项目根绝对路径)>/（集中模型，见 docs/feature-baseline.md §2.2 与 docs/baseline/host.md §D）。
//   显式 --book <path> 兼容保留（传了就用它，旧/手工调用不破坏）；未传时自动推导新桶。
//   源码路径键 = 工作区名 + '/' + 相对工作区根路径（根=工作区名）。md/markdown 不生成 L2（宿主 isMdPath 拒绝）。
//
// 职责：模型写好正文（微型文章：核心概念一句话/主线走查/导出速查），本脚本只兜确定性——frontmatter（源码路径/层级/生成时间）、自动命名（完整相对路径前缀，绝对唯一）、index.json「文件层」upsert。
//   --content 只收正文：脚本负责前置拼 frontmatter（并剥掉正文里可能自带的旧头），模型不要手写 frontmatter。
//
// 命名规则（必然不重复）：文件名前缀 = 文件相对工作区根的完整父目录路径（原样保留全部层级，用 - 连）。
//   相对路径唯一 → 文件名必然唯一，无需跳过/去重/逐级追加。顶层文件（无父目录）用 <工作区名> 做前缀。
//   例：dsh/index.js → dsh-index.md；src/client/index.js → src-client-index.md；顶层 README.md → <工作区名>-README.md。
//
// 用法：
//   node scripts/file-doc.mjs gen <文件绝对路径> --book <书库根> --key <源码路径键> [--name <名字>] [--content <正文>]
//   --book 未传时自动 = $DSH_HOME/books/<projectKey(项目根绝对路径)>/；项目根取 --root（无 --book 时推荐显式传）
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, basename, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TPL = join(__dirname, '..', 'templates')

function err(msg) { process.stderr.write(`\n[file-doc] 错误: ${msg}\n`); process.exit(1) }

// frontmatter 三字段一律由脚本写（模型不手写）：源码路径 = 源码路径键；层级 = 本层名；
// 生成时间 = 本次生成时刻（重生成即刷新——读者据此判断这份摘要是否已与源码脱节）。
function formatStamp(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function buildFrontmatter(srcKey, layer) {
  return `---\n源码路径: ${srcKey}\n层级: ${layer}\n生成时间: ${formatStamp(new Date())}\n---\n`
}

// 剥掉正文里可能自带的 frontmatter（旧绕过写法），避免与脚本生成的头重复。
function stripFrontmatter(text) {
  const lines = String(text).split('\n')
  if (lines[0]?.trim() !== '---') return text
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return lines.slice(i + 1).join('\n').replace(/^\n+/, '')
  }
  return text
}
function argOf(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

// ---------------------------------------------------------------------------
// 书库集中化：桶名 + 书库根推导
// projectKey 与 DSH session format.ts projectKey 及 src/host/fs-utils.ts 同步：
//   逐字复刻 packages/session/session-persistence-jsonl/src/format.ts 的 projectKey()，
//   可读编码（非哈希）：'/' '\\' ':' 连段转 '-'，其余非安全字符转 ~XXXX（十六进制大写 4 位）。
//   对拍：/home/<user>/DSH → --home-<user>-DSH--；/home/<user>/源码志 → --home-<user>-~6E90~7801~5FD7--
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
//   ③ 均无 → undefined
function inferProjectRoot(rootOpt, bookOpt) {
  if (rootOpt) return resolve(rootOpt)
  if (bookOpt) {
    const b = resolve(bookOpt)
    if (basename(dirname(b)) === '.book' && basename(b).endsWith('-book')) return dirname(dirname(b))
  }
  return undefined
}

// 书库根：显式 --book 优先（兼容旧调用，传了就用它）；
//   未传 = $DSH_HOME/books/<projectKey(项目根绝对路径)>/，项目根取 --root（或由 --book 旧路径反推）。
function resolveBook(bookOpt, rootOpt) {
  if (bookOpt) return resolve(bookOpt)
  const pr = inferProjectRoot(rootOpt, bookOpt)
  if (!pr) err('需要 --book <书库根>（显式兼容），或 --root <项目根绝对路径>（自动推导 $DSH_HOME/books/<projectKey>/ 桶）')
  return join(booksRoot(), projectKey(pr))
}

// 必然不重复的命名：文件名前缀 = 文件相对工作区根的完整父目录路径（原样保留全部层级，用 - 连）。
// 相对路径唯一 → 文件名必然唯一，无需跳过/去重/逐级追加。顶层文件（无父目录）用工作区名做前缀。
// 返回【不含 .md】的文件名主体（stem），由调用方拼 .md。
// 如：dsh/index.js → dsh-index；src/client/index.js → src-client-index；顶层 README.md → <工作区名>-README。
// ⚠ 命名规则三处实现，改动必须三处同步，否则宿主 hasDoc 判定与技能落盘文件名漂移：
//   ① src/host/fs-utils.ts computeDocStem
//   ② 本函数（skills/file-doc/scripts/file-doc.mjs computeName）
//   ③ skills/source-doc/scripts/source-annotate.mjs computeName
function computeName(key, fileName) {
  const parts = key.split('/').filter(Boolean)   // [工作区名, ...父目录, 文件名]
  const relParents = parts.slice(1, -1)          // 相对路径的父目录段（原样，含系统目录）
  const stem = fileName.replace(/\.(md|markdown|js|ts|jsx|tsx|py|go|rs|json|yml|yaml|c|cpp|h|java|rb|php|sh|sql|mjs|d\.ts)$/i, '')
  if (relParents.length === 0) return `${parts[0]}-${stem}`   // 顶层/工作区根直接文件
  return `${relParents.join('-')}-${stem}`                    // 完整相对路径前缀，绝对唯一
}

function upsertIndex(book, entry, projectRoot) {
  const idxPath = join(book, 'index.json')
  let idx = null
  if (existsSync(idxPath)) {
    try { idx = JSON.parse(readFileSync(idxPath, 'utf8')) } catch { /* 损坏/不可读 → idx 留 null，下一行按空对象重建 */ }
  }
  if (!idx || typeof idx !== 'object') idx = {}
  if (projectRoot) {
    // 集中模型：「项目根」= 项目根绝对路径（旧值为 basename，读取仅展示不做转换）；「项目」= 项目名
    idx['项目'] = basename(projectRoot)
    idx['项目根'] = projectRoot
  } else if (idx['项目'] === undefined) {
    // 无项目根信息时的退化初始化（旧行为：从书库名取项目名，保持 history 兼容）
    const projName = basename(book).replace(/-book$/, '')
    idx['项目'] = projName
    idx['项目根'] = projName
  }
  for (const k of ['目录层', '文件层', '源码层']) if (!Array.isArray(idx[k])) idx[k] = []
  const arr = idx['文件层']
  const i = arr.findIndex((x) => x['源码路径'] === entry['源码路径'])
  if (i >= 0) arr[i] = entry
  else arr.push(entry)
  writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n', 'utf8')
}

const mode = process.argv[2]
const target = process.argv[3]

if (mode === 'gen') {
  if (!target) err('gen 需要 <文件绝对路径>')
  const bookOpt = argOf('--book')
  const rootOpt = argOf('--root')
  const book = resolveBook(bookOpt, rootOpt)
  const projectRoot = inferProjectRoot(rootOpt, bookOpt)
  const srcKey = argOf('--key')
  if (!srcKey) err('gen 需要 --key <源码路径键>')
  const fileName = basename(target)
  const outDir = join(book, '文件摘要')
  mkdirSync(outDir, { recursive: true })
  const name = argOf('--name') || computeName(srcKey, fileName)
  const outFile = `${name}.md`
  const override = argOf('--content')
  const outPath = join(outDir, outFile)
  if (override != null) {
    // 模型只给正文：脚本前置拼 frontmatter（含生成时间），并剥掉正文里可能自带的旧头
    writeFileSync(outPath, buildFrontmatter(srcKey, '文件') + stripFrontmatter(override), 'utf8')
  } else {
    const tplPath = join(TPL, 'file.md')
    if (!existsSync(tplPath)) err(`模板不存在: ${tplPath}`)
    const tpl = readFileSync(tplPath, 'utf8')
    const md = tpl
      .replaceAll('${srcKey}', srcKey)
      .replaceAll('${fileName}', fileName)
      .replace('${generatedAt}', formatStamp(new Date()))
    writeFileSync(outPath, md, 'utf8')
  }
  upsertIndex(book, { '源码路径': srcKey, '文档': `文件摘要/${outFile}` }, projectRoot)
  process.stdout.write(`\n已生成文件摘要 → ${join(outDir, name)}\n已 upsert index.json「文件层」: ${srcKey}\n`)
} else {
  err('用法: file-doc <gen> ...')
}
