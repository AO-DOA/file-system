// 覆盖率分母口径校验：把「静默排除」变成「显式失败」。
//
// 为什么需要它
// ────────────
// `@vitest/coverage-v8` 对「本次运行中没有任何 spec 加载过」的源文件会走
// `provider.js` 的 `remapCoverage()`：拿 transform 产物做一次
// `parseAstAsync(result.code)`（**不传 lang**）。当 `environment: 'jsdom'` 时，
// 未被任何 spec 加载过的文件 transform 出来仍是 TS 源码形态，rolldown 按 JS
// 解析必然失败，catch 分支只打一行
// `Failed to parse <file>. Excluding it from coverage.` 就 `return {}`。
// 该文件于是**既不在覆盖率分母里，也不会让 per-file 100% 门槛变红**——
// 「没覆盖」被伪装成「这个文件不存在」，门禁是绿的。
//
// 本脚本把这条静默通道摆到台面上：
//   期望分母 = vitest.config.ts 的 coverage.include 匹配到的文件，减去 coverage.exclude；
//   实际分母 = 覆盖率报告（json-summary reporter 的 coverage-summary.json）里出现的文件；
//   两者不一致 → exit 1，并逐条列出差异。
//
// 用法
// ────
//   node scripts/verify-coverage-scope.mjs [--reports-dir <dir>]
// 正常由 `npm run test:coverage` 在 vitest 之后自动调用，无需手工执行。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件根（本脚本位于 <root>/scripts/ 下）。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** 唯一的口径真源：分母集合只从这里推导，不复制一份到脚本里。 */
const CONFIG_FILE = 'vitest.config.ts'
/** json-summary reporter 的产物，键即「真正进了分母」的文件集。 */
const SUMMARY_FILE = 'coverage-summary.json'
/** 遍历期望集合时跳过的目录：只有它们大到值得特判，且不可能命中 src。 */
const SKIP_DIRS = new Set(['node_modules', '.git'])

/**
 * 打印错误并以 1 退出。
 * @param {string} message 给读者的中文说明
 */
function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

/**
 * 把任意抛出物转成可读文本。
 * @param {unknown} error 捕获到的错误
 * @returns {string} 错误消息
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 递归列出目录下的文件（跳过 SKIP_DIRS）。
 * @param {string} dir 起始目录
 * @param {string[]} out 累积结果
 * @returns {string[]} 绝对路径列表
 */
function listFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) listFiles(join(dir, entry.name), out)
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

/**
 * 插件根相对路径，统一用 POSIX 分隔符（glob 与报告键都以 `/` 为准）。
 * @param {string} absPath 绝对路径
 * @returns {string} 相对路径
 */
function toPosix(absPath) {
  return relative(ROOT, absPath).split(sep).join('/')
}

/**
 * 展开 `{a,b}` 花括号（支持嵌套），返回若干无花括号的模式。
 * @param {string} pattern 原始模式
 * @returns {string[]} 展开后的模式
 */
function expandBraces(pattern) {
  const open = pattern.indexOf('{')
  if (open === -1) return [pattern]
  let depth = 0
  for (let i = open; i < pattern.length; i += 1) {
    if (pattern[i] === '{') {
      depth += 1
    } else if (pattern[i] === '}') {
      depth -= 1
      if (depth > 0) continue
      const head = pattern.slice(0, open)
      const tail = pattern.slice(i + 1)
      const body = pattern.slice(open + 1, i)
      const parts = []
      let inner = 0
      let start = 0
      for (let j = 0; j < body.length; j += 1) {
        if (body[j] === '{') inner += 1
        else if (body[j] === '}') inner -= 1
        else if (body[j] === ',' && inner === 0) {
          parts.push(body.slice(start, j))
          start = j + 1
        }
      }
      parts.push(body.slice(start))
      return parts.flatMap(part => expandBraces(head + part + tail))
    }
  }
  return [pattern]
}

/**
 * 单个（已展开花括号的）glob 转正则源串。
 * 支持 `**`（跨目录）、`*`、`?`、`[abc]` / `[!abc]`；其余字符按字面量。
 * @param {string} glob 模式
 * @returns {string} 正则源串
 */
function globSource(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i += 1
        if (glob[i + 1] === '/') {
          i += 1
          out += '(?:[^/]*/)*'
        } else {
          out += '.*'
        }
      } else {
        out += '[^/]*'
      }
    } else if (ch === '?') {
      out += '[^/]'
    } else if (ch === '[') {
      const close = glob.indexOf(']', i + 1)
      if (close === -1) {
        out += '\\['
      } else {
        const body = glob.slice(i + 1, close)
        out += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`
        i = close
      }
    } else {
      out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return out
}

/**
 * 判断一个相对路径是否命中 glob 模式。
 * @param {string} relPath POSIX 相对路径
 * @param {string} pattern glob 模式
 * @returns {boolean} 是否命中
 */
function matches(relPath, pattern) {
  const alternation = expandBraces(pattern).map(globSource).join('|')
  return new RegExp(`^(?:${alternation})$`).test(relPath)
}

// ── 参数 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
let reportsDirArg = ''
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--reports-dir') {
    reportsDirArg = argv[i + 1] ?? ''
    i += 1
  } else if (arg.startsWith('--reports-dir=')) {
    reportsDirArg = arg.slice('--reports-dir='.length)
  } else {
    fail(`未知参数：${arg}（只支持 --reports-dir <dir>）`)
  }
}

// ── 1. 读配置：算出「应当进分母」的文件集合 ──────────────────────────────────
let loadConfigFromFile
try {
  ;({ loadConfigFromFile } = await import('vite'))
} catch (error) {
  fail(`无法加载 vite（读 ${CONFIG_FILE} 依赖它）：${messageOf(error)}`)
}

let loaded
try {
  loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    join(ROOT, CONFIG_FILE),
    ROOT,
  )
} catch (error) {
  fail(`读取 ${CONFIG_FILE} 失败：${messageOf(error)}`)
}
if (!loaded) fail(`找不到 ${CONFIG_FILE}，无法确定覆盖率分母口径。`)

const coverage = loaded.config?.test?.coverage ?? {}
const include = coverage.include
const exclude = coverage.exclude ?? []
if (!Array.isArray(include) || include.length === 0) {
  fail(`${CONFIG_FILE} 未声明 coverage.include：无法独立算出应当进分母的文件集合，请显式声明。`)
}

const expected = new Set(
  listFiles(ROOT, [])
    .map(toPosix)
    .filter(rel => include.some(pattern => matches(rel, pattern)))
    .filter(rel => !exclude.some(pattern => matches(rel, pattern))),
)

// ── 2. 读覆盖率报告：算出「实际进分母」的文件集合 ───────────────────────────
const reportsDir = reportsDirArg
  ? resolve(ROOT, reportsDirArg)
  : resolve(ROOT, typeof coverage.reportsDirectory === 'string' ? coverage.reportsDirectory : 'coverage')
const summaryPath = join(reportsDir, SUMMARY_FILE)
if (!existsSync(summaryPath)) {
  fail(
    `找不到覆盖率报告 ${summaryPath}。\n` +
      '  请先跑 `npm run test:coverage`（该脚本内已开启 --coverage.reportOnFailure=true，' +
      '测试失败时也会出报告）；若换了输出目录，用 --reports-dir 指过来。\n' +
      '  若刚才那次 vitest 是因并发争用崩溃的（日志里出现 "Something removed the coverage ' +
      'directory" 或 coverage/.tmp 的 ENOENT），那是同一个 coverage.reportsDirectory 被多个 ' +
      'vitest 同时写入所致：改用一个隔离目录重跑\n' +
      '    npx vitest run --coverage --coverage.reportOnFailure=true ' +
      '--coverage.reportsDirectory=<隔离目录>\n' +
      '  再把同一个目录用 --reports-dir 指给本脚本。',
  )
}

let summary
try {
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
} catch (error) {
  fail(`解析 ${summaryPath} 失败：${messageOf(error)}`)
}

const actual = new Set(
  Object.keys(summary)
    .filter(key => key !== 'total')
    .map(key => toPosix(resolve(key))),
)

// ── 3. 比对并报告 ──────────────────────────────────────────────────────────
const missing = [...expected].filter(file => !actual.has(file)).sort()
const extra = [...actual].filter(file => !expected.has(file)).sort()

const header = [
  '覆盖率分母口径校验（scripts/verify-coverage-scope.mjs）',
  `  口径来源：${CONFIG_FILE}  coverage.include=${JSON.stringify(include)}  exclude=${JSON.stringify(exclude)}`,
  `  覆盖率报告：${summaryPath}`,
  `  应当进分母：${expected.size} 个文件`,
  `  实际进分母：${actual.size} 个文件`,
].join('\n')

if (missing.length === 0 && extra.length === 0) {
  console.log(header)
  console.log(`✓ 分母完整：${expected.size} 个源文件全部进入覆盖率统计，与 ${CONFIG_FILE} 一致。`)
  process.exit(0)
}

console.error(header)

if (missing.length > 0) {
  console.error(
    `\n✗ 有 ${missing.length} 个文件「应当进分母但没有进」——它们被 @vitest/coverage-v8 静默丢掉了：`,
  )
  for (const file of missing) console.error(`    - ${file}`)
  console.error(
    '\n  典型原因：这些文件本次没有被任何 spec 加载过，coverage-v8 于是对 transform 产物做\n' +
      '  parseAstAsync（不传 lang）；jsdom 环境下产物仍是 TS 语法 → 解析失败 → 该文件被排除，\n' +
      '  控制台只留一行 `Failed to parse <file>. Excluding it from coverage.`。\n' +
      '  这类文件不进分母，per-file 100% 门槛因此不会变红：漏测被伪装成「不存在」。\n' +
      '  正确修法是给它们补 spec（让文件被真实加载），而不是把它们写进 coverage.exclude。\n' +
      '  实测口径（2026-09，vitest 4.1.11 / vite 8.3.0）：该路径**未复现**——未加载文件的\n' +
      '  transform 产物已被 oxc 剥成 JS，parse 成功并照常进分母。所以本脚本是**面向未来的\n' +
      '  护栏**（升级 vitest/vite、改 environment、动 include 都可能让分母漂移），不是对某个\n' +
      '  现有缺陷的修复；此处报红时请按上面的方向重新定位，不要直接照抄结论。',
  )
}

if (extra.length > 0) {
  console.error(
    `\n✗ 有 ${extra.length} 个文件「进了分母但不在 include 集合里」——检查 coverage.include / exclude 与 glob：`,
  )
  for (const file of extra) console.error(`    - ${file}`)
}

process.exit(1)
