// 程序化验收：把主代理每段手工做的那套「改动范围守卫 + 四道门禁」固化成一条命令。
//
// 为什么需要它
// ────────────
// 四段 UI 改造期间，每段收尾都是手工敲同一串命令、手工核对改动面有没有越界，
// 结果有两类问题：门禁数字靠人眼抄（会抄错），越界改动靠人眼比（会漏）。
// 本脚本把这两件事变成 exit code。
//
// 用法
// ────
//   node scripts/verify-stage.mjs --allow src/client/index.tsx,tests/client-view.spec.ts
//   node scripts/verify-stage.mjs --allow 'docs/agent/,tools/ui-probe/' --skip-coverage
//   node scripts/verify-stage.mjs --allow '*'          # 显式全量放行（自测/收尾用）
//
// 白名单语义
// ──────────
//   --allow a.ts,b.ts    逗号分隔；精确路径必须逐字相同
//   --allow 'dir/'       以 / 结尾 = 目录前缀，匹配其下所有文件
//   --allow '*'          显式全量放行（不是「不传」，不传会报错退出）
//   --allow ''           空白名单：任何改动都算越界（干净工作树下的严格自测）
//
// 退出码：0 = 守卫通过且所有门禁通过；1 = 有失败项；2 = 用法错误。
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根（本脚本位于 <root>/scripts/ 下）。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** 子进程输出的缓冲上限：vitest 的失败输出可能很大，但不需要无限大。 */
const MAX_BUFFER = 64 * 1024 * 1024

/**
 * 打印错误并以指定码退出。
 * @param {string} message 给读者的中文说明
 * @param {number} code 退出码
 */
function fail(message, code = 2) {
  process.stderr.write(`verify-stage: ${message}\n`)
  process.exit(code)
}

/** 一行帮助文本。 */
const USAGE = `用法：node scripts/verify-stage.mjs --allow <白名单> [--skip-coverage] [--tail=<行数>] [--out=<文件>]

  --allow <白名单>    逗号分隔的授权改动面；'dir/' 为目录前缀，'*' 为显式全量放行，'' 为空白名单
  --skip-coverage     跳过覆盖率门禁（默认跑）
  --tail=<行数>       失败项回显的原始输出尾部行数（默认 40）
  --out=<文件>        同时把这次运行的完整输出写到文件（给人贴进报告用）
  --help              显示本帮助

门禁顺序：范围守卫 → typecheck → lint → test → coverage。
范围守卫失败不会中断后续门禁（越界时更需要看到门禁结论），但最终一定非 0 退出。`

/**
 * 解析命令行。位置参数一律报错——这个脚本静默忽略参数的代价是「以为给了白名单其实没给」。
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{allow: string|null, skipCoverage: boolean, tailLines: number, out: string|null, help: boolean}}
 */
function parseArgs(argv) {
  const opts = { allow: null, skipCoverage: false, tailLines: 40, out: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') { opts.help = true; continue }
    if (arg === '--skip-coverage') { opts.skipCoverage = true; continue }
    if (arg === '--allow') { opts.allow = argv[++i] ?? null; continue }
    if (arg.startsWith('--allow=')) { opts.allow = arg.slice('--allow='.length); continue }
    if (arg === '--out') { opts.out = argv[++i] ?? null; continue }
    if (arg.startsWith('--out=')) { opts.out = arg.slice('--out='.length); continue }
    if (arg === '--tail') { opts.tailLines = Number(argv[++i]); continue }
    if (arg.startsWith('--tail=')) { opts.tailLines = Number(arg.slice('--tail='.length)); continue }
    fail(`未知参数：${arg}（只支持 --allow / --skip-coverage / --tail / --out / --help）\n\n${USAGE}`)
  }
  if (!opts.help && opts.allow === null) {
    fail(`缺少 --allow。守卫需要一个明确的授权面：\n`
      + `  --allow src/client/index.tsx,tests/client-view.spec.ts\n`
      + `  --allow '*' （显式全量放行）  --allow '' （空白名单，只允许干净工作树）\n\n${USAGE}`)
  }
  return opts
}

/**
 * 把白名单字符串编成匹配器。
 * @param {string} spec 逗号分隔的白名单
 * @returns {{all: boolean, items: string[]}}
 */
function compileAllow(spec) {
  const items = spec.split(',').map(s => s.trim()).filter(Boolean)
  if (items.includes('*')) return { all: true, items: [] }
  return { all: false, items }
}

/**
 * 判断一个仓库相对路径是否在授权面内。
 * @param {string} p 仓库相对路径（POSIX 分隔符）
 * @param {{all: boolean, items: string[]}} allow 白名单匹配器
 * @returns {boolean} 是否授权
 */
function isAllowed(p, allow) {
  if (allow.all) return true
  return allow.items.some(it => (it.endsWith('/') ? p.startsWith(it) : p === it))
}

/**
 * 读 `git status --porcelain -z -uall`。两个开关都是必要的：
 *   -z     默认格式会把非 ASCII 路径转义成 `"..."` 并加引号，中文文件名会被切坏；
 *   -uall  **不加**的话未跟踪的目录会被折叠成一条 `?? dir/`，于是「白名单给了精确文件路径」
 *          会被误判成越界——守卫必须看到真实文件粒度。
 * @returns {{xy: string, path: string}[]} 变更条目
 */
function readGitStatus() {
  const res = spawnSync('git', ['status', '--porcelain', '-z', '-uall'], { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX_BUFFER })
  if (res.status !== 0) fail(`git status 失败：${res.stderr || res.error?.message || '未知原因'}`, 1)
  const entries = []
  for (const rec of res.stdout.split('\0')) {
    if (!rec) continue
    // 正常条目形如「XY <path>」；rename/copy 的**旧路径**是紧随其后的裸路径条目，没有 XY 前缀。
    const m = /^([ MARCUD?!]{2}) (.*)$/s.exec(rec)
    if (m) entries.push({ xy: m[1], path: m[2] })
    else entries.push({ xy: '  ', path: rec })
  }
  return entries
}

/**
 * 跑一条命令并计时。
 * @param {string} cmd 可执行文件
 * @param {string[]} args 参数
 * @returns {{ok: boolean, code: number|null, ms: number, out: string}} 运行结果
 */
function run(cmd, args) {
  const started = Date.now()
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX_BUFFER })
  const ms = Date.now() - started
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}${res.error ? `\n[spawn error] ${res.error.message}` : ''}`
  return { ok: res.status === 0, code: res.status, ms, out }
}

/** 格式化耗时。 */
const secs = ms => `${(ms / 1000).toFixed(1)}s`

/** 取文本尾部若干行。 */
function tail(text, n) {
  const lines = text.replace(/\s+$/, '').split('\n')
  return lines.slice(Math.max(0, lines.length - n)).join('\n')
}

/** 计算字符串的显示宽度（中日韩全角按 2 列算），用于对齐表格。 */
function displayWidth(s) {
  let w = 0
  for (const ch of s) w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1
  return w
}

/**
 * 按显示宽度补空格。
 * @param {string} s 原文
 * @param {number} n 目标显示宽度
 * @returns {string} 补齐后的文本
 */
function pad(s, n) {
  return s + ' '.repeat(Math.max(0, n - displayWidth(s)))
}

/**
 * 覆盖率门禁：vitest 写到**唯一**临时目录，再把同一目录指给分母守卫脚本。
 * 共用 coverage/.tmp 会让生成崩溃（实测 4 次跑崩 3 次），所以这里强制隔离。
 * @returns {{ok: boolean, code: number|null, ms: number, out: string}} 运行结果
 */
function runCoverage() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-verify-coverage-'))
  const started = Date.now()
  const vitest = spawnSync('npx', ['vitest', 'run', '--coverage', '--coverage.reportOnFailure=true',
    `--coverage.reportsDirectory=${dir}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX_BUFFER })
  let out = `[覆盖率目录] ${dir}\n${vitest.stdout ?? ''}${vitest.stderr ?? ''}`
  if (vitest.error) out += `\n[spawn error] ${vitest.error.message}`
  let ok = vitest.status === 0
  if (ok) {
    const scope = spawnSync('node', ['scripts/verify-coverage-scope.mjs', `--reports-dir=${dir}`],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX_BUFFER })
    out += `\n[分母守卫] node scripts/verify-coverage-scope.mjs --reports-dir=${dir}\n${scope.stdout ?? ''}${scope.stderr ?? ''}`
    ok = scope.status === 0
  }
  const ms = Date.now() - started
  // 失败时保留目录（报告是诊断材料），成功时清掉，避免临时目录堆积。
  if (ok) rmSync(dir, { recursive: true, force: true })
  return { ok, code: vitest.status, ms, out }
}

const opts = parseArgs(process.argv.slice(2))
if (opts.help) {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}

const allow = compileAllow(opts.allow)
const lines = []
/**
 * 同时写 stdout 与内存缓冲（--out 用）。
 * @param {string} text 一行
 */
function say(text = '') {
  lines.push(text)
  process.stdout.write(`${text}\n`)
}

say(`verify-stage — 仓库根 ${ROOT}`)
say(`白名单：${allow.all ? '*（显式全量放行）' : allow.items.length ? allow.items.join(' , ') : '（空：任何改动都越界）'}`)
say()

// ── 1. 范围守卫 ────────────────────────────────────────────────────────────
say('=== 1. 改动范围守卫 ===')
const entries = readGitStatus()
const diffStat = spawnSync('git', ['diff', '--stat'], { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX_BUFFER })
if (entries.length === 0) {
  say('git status --porcelain：工作树干净（无改动、无新增）。')
} else {
  say(`git status --porcelain（${entries.length} 项）：`)
  for (const e of entries) say(`  ${e.xy} ${e.path}${isAllowed(e.path, allow) ? '' : '   <<< 越界'}`)
}
say('git diff --stat（已跟踪文件的改动行数；新增/未跟踪文件不在此列，见上）：')
say((diffStat.stdout || '(无输出)').replace(/\s+$/, '').split('\n').map(l => `  ${l}`).join('\n'))
const violations = entries.filter(e => !isAllowed(e.path, allow))
say(violations.length === 0
  ? '守卫结论：PASS — 没有超出授权面的改动。'
  : `守卫结论：FAIL — ${violations.length} 项越界：${violations.map(v => `${v.xy} ${v.path}`).join(' / ')}`)
say()

// ── 2. 门禁 ────────────────────────────────────────────────────────────────
/** 逐项执行的 gate 清单；coverage 由 --skip-coverage 决定是否入场。 */
const gates = [
  { id: 'typecheck', label: 'typecheck（npm run typecheck）', exec: () => run('npm', ['run', 'typecheck']) },
  { id: 'lint', label: 'lint（npm run lint）', exec: () => run('npm', ['run', 'lint']) },
  { id: 'test', label: 'test（npm test）', exec: () => run('npm', ['test']) },
]
if (!opts.skipCoverage) {
  gates.push({ id: 'coverage', label: 'coverage（npx vitest run --coverage + 分母守卫）', exec: runCoverage })
}

say('=== 2. 门禁（逐项实跑） ===')
const results = []
for (const [i, gate] of gates.entries()) {
  say(`[${i + 1}/${gates.length}] ${gate.label} …`)
  const r = gate.exec()
  results.push({ id: gate.id, label: gate.label, ...r })
  say(`      → ${r.ok ? 'PASS' : 'FAIL'}（exit ${r.code}，${secs(r.ms)}）`)
}
say()

// ── 3. 结论表 ──────────────────────────────────────────────────────────────
say('=== 3. 结论表 ===')
const rows = [
  { id: '守卫', ok: violations.length === 0, ms: null, code: null, note: violations.length ? `${violations.length} 项越界` : (entries.length ? `${entries.length} 项全在授权面内` : '工作树干净') },
  ...results.map(r => ({
    id: r.id, ok: r.ok, ms: r.ms, code: r.code,
    note: r.out.trim().replace(/\s+/g, ' ').slice(0, 48),
  })),
]
if (opts.skipCoverage) rows.push({ id: 'coverage', ok: null, ms: null, code: null, note: '--skip-coverage 跳过' })
const w = { id: Math.max(6, ...rows.map(r => displayWidth(r.id))), note: 50 }
say(`| ${pad('项', w.id)} | 结论 | ${pad('耗时', 8)} | exit | 摘要 |`)
say(`|${'-'.repeat(w.id + 2)}|------|${'-'.repeat(10)}|------|------|`)
for (const r of rows) {
  const verdict = r.ok === null ? 'SKIP' : (r.ok ? 'PASS' : 'FAIL')
  say(`| ${pad(r.id, w.id)} | ${verdict} | ${pad(r.ms === null ? '-' : secs(r.ms), 8)} | ${pad(String(r.code ?? '-'), 4)} | ${r.note} |`)
}
const failed = rows.filter(r => r.ok === false)
say()
say(failed.length === 0 && !opts.skipCoverage
  ? '总判定：全绿。'
  : `总判定：${failed.length ? `${failed.length} 项未过（${failed.map(f => f.id).join(' / ')}）` : '门禁全绿，但覆盖率被跳过（--skip-coverage）'}。`)

// ── 4. 失败项的原始输出尾部 ────────────────────────────────────────────────
if (failed.length) {
  say()
  say(`=== 4. 失败项原始输出（各取末 ${opts.tailLines} 行） ===`)
  for (const f of failed) {
    if (f.id === '守卫') {
      say(`--- 守卫：越界清单 ---`)
      for (const v of violations) say(`  ${v.xy} ${v.path}`)
      continue
    }
    const r = results.find(x => x.id === f.id)
    say(`--- ${f.id} ---`)
    say(tail(r.out, opts.tailLines))
  }
}

if (opts.out) {
  // 落盘的是**完整记录**：结论表 + 每道门禁的原始输出。报告里要引用「19 spec / 582 例」
  // 这类数字时，从这份文件取，不要从终端回滚里抄。
  const body = [lines.join('\n'), '', `=== 5. 各门禁原始输出（完整，共 ${results.length} 项） ===`]
  for (const r of results) body.push('', `--- ${r.id}（exit ${r.code}，${secs(r.ms)}） ---`, r.out.replace(/\s+$/, ''))
  writeFileSync(opts.out, `${body.join('\n')}\n`, 'utf8')
  process.stdout.write(`\n完整输出（结论表 + 各门禁原始输出）已写入 ${opts.out}\n`)
}
process.exit(failed.length ? 1 : 0)
