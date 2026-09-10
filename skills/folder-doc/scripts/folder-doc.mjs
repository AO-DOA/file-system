#!/usr/bin/env node
// folder-doc 生成器（folder-doc 技能的确定性配套）
//
// 契约（来自宿主 dsh-plugin-file-system-zc/lib/index.js）：
//   书库根 = $DSH_HOME/books/<projectKey(项目根绝对路径)>/（集中模型，见 docs/feature-baseline.md §2.2 与 docs/baseline/host.md §D）。
//   显式 --book <path> 兼容保留（传了就用它，旧/手工调用不破坏）；未传时自动推导新桶。
//   目标 = 一个文件夹（宿主已给出，不递归）。源码路径键 = 工作区名 + '/' + 相对工作区根路径（根=工作区名）。
//
// 职责：
//   gen <目标文件夹绝对路径> --book <书库根> --key <源码路径键> [--name <文档名>]
//     - 用 templates/folder.md 渲染 frontmatter + 目录树（gen-tree.sh 取第一层子项），
//       模型负责的语义（一句话职责/子项职责/目录树行尾简介）由模型生成后在占位处填写
//       或直接重写文档正文 —— 本脚本只兜「frontmatter 源码路径/层级/生成时间」与「目录树」两类确定值。
//     - 把该文档写入 <书库根>/目录概览/<文档名>.md，并 upsert index.json「目录层」一条
//       （保留「文件层」「源码层」等其它数组不动）。
//
//   gen 之后，模型若已把语义填进正文（表/目录树行尾），可直接用本脚本生成最终文档。
//   若先要空模板，用 --emit-template 仅打印渲染后的骨架（供模型填写后回填）。
//
// 用法：
//   node scripts/folder-doc.mjs gen <目标文件夹> --book <书库根> --key <源码路径键> [--name <文档名>]
//   --book 未传时自动 = $DSH_HOME/books/<projectKey(项目根绝对路径)>/；项目根取 --root（无 --book 时推荐显式传）
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, resolve, basename, dirname } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TPL = join(__dirname, '..', 'templates')

function err(msg) { process.stderr.write(`\n[folder-doc] 错误: ${msg}\n`); process.exit(1) }
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

// 取第一层目录树（gen-tree.sh 已实现：目录在前、文件在后、子文件夹不展开）
function firstLevelTree(dir) {
  try {
    return execFileSync('bash', [join(__dirname, 'gen-tree.sh'), dir], { encoding: 'utf8' }).trim()
  // gen-tree.sh 起不来（bash 不可用）或目标目录不可读 → 目录树留空；骨架里少一段树，
  // 调用方（渲染骨架的模型）一眼可见，没有别的通道会读到这个失败。
  } catch { /* gen-tree.sh 失败 → 空树 */ return '' }
}

// 生成时间：每次 gen 都写当前时间（重生成即刷新）。读者据此判断这份解析
// 是不是已经跟目标文件夹的实际内容脱节 —— 首次创建时间做不到这件事（它永不变化）。
function formatStamp(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 用模板渲染 frontmatter + 目录树；语义占位留给模型
function renderDoc(name, srcKey, book, target) {
  const tplPath = join(TPL, 'folder.md')
  if (!existsSync(tplPath)) err(`模板不存在: ${tplPath}`)
  const tpl = readFileSync(tplPath, 'utf8')
  const tree = firstLevelTree(target)
  return tpl
    .replaceAll('${relPath}', srcKey)  // 源码路径键（frontmatter + 路径）
    .replaceAll('${name}', name)       // 标题/文档名
    .replace('${generatedAt}', formatStamp(new Date()))  // 生成时间（本次生成时刻）
    .replace('${tree}', tree)          // 目录树（gen-tree.sh 输出）
}

// upsert index.json「目录层」一条（保留其它数组不动）
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
  const arr = idx['目录层']
  const i = arr.findIndex((x) => x['源码路径'] === entry['源码路径'])
  if (i >= 0) arr[i] = entry
  else arr.push(entry)
  writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n', 'utf8')
}

const mode = process.argv[2]
const target = process.argv[3]

if (mode === 'gen') {
  if (!target) err('gen 需要 <目标文件夹绝对路径>')
  const bookOpt = argOf('--book')
  const rootOpt = argOf('--root')
  const book = resolveBook(bookOpt, rootOpt)
  const projectRoot = inferProjectRoot(rootOpt, bookOpt)
  const srcKey = argOf('--key')
  if (!srcKey) err('gen 需要 --key <源码路径键>')
  const name = argOf('--name') || basename(target.replace(/[\\/]+$/, ''))
  const outDir = join(book, '目录概览')
  mkdirSync(outDir, { recursive: true })
  const docPath = join(outDir, `${name}.md`)
  const md = renderDoc(name, srcKey, book, target)
  // 模型填语义：若已在模板占位处填了职责，--content 传入覆盖正文。
  // --content 契约：接收正文字符串本身；若以 .md 结尾且是存在的文件路径，则读该文件
  // 内容（兼容「先 write 落盘正文再传路径」的用法，防止把路径字符串本身覆盖进文档，
  // 见 issues/2026-09-03-08）。
  let override = argOf('--content')
  if (override != null && /\.md$/i.test(override) && existsSync(override) && statSync(override).isFile()) {
    override = readFileSync(override, 'utf8')
  }
  writeFileSync(docPath, override != null ? override : md, 'utf8')
  upsertIndex(book, { '源码路径': srcKey, '文档': `目录概览/${name}.md` }, projectRoot)
  process.stdout.write(`\n已生成目录概览 → ${join(outDir, name + '.md')}\n已 upsert index.json「目录层」: ${srcKey}\n`)
} else {
  err('用法: folder-doc <gen> ...')
}
