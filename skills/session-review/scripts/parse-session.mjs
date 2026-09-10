#!/usr/bin/env node
// parse-session — 会话复盘专用：反查会话日志，自动过滤流式碎片，提炼关键事件
//
// 职责：
//   1) 复用 find-session 的反查逻辑，按标题子串找到会话 id 与日志路径；
//   2) 用 zstd -dc 解压 session.jsonl.zstd；
//   3) 过滤流式碎片（reasoning-chunks / text-chunks / assistant-chunk / tool-call-chunks），
//      只留 user/message、assistant/message、tool/call、tool/result、turn/end、todo/write、session/title；
//   4) 统计并打印工具调用序列、turn/step、每轮最终回复、用户消息、todo、turn/end 原因。
//
// 本脚本只负责「把模型做了什么摊开」，不评分；评分判断由 session-review SKILL.md 的评分卡完成。
//
// 用法：
//   node parse-session.mjs [标题子串] [--home <DSH_HOME>] [--all]
//   例：node parse-session.mjs "生成 source-annotate"

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

const argv = process.argv.slice(2)
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const has = (n) => argv.includes(n)
const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PC_DIR = join(HOME, 'storages', 'session_projcache', 'sessions')
const SESS_ROOT = join(HOME, 'sessions')
const q = argv.find((a) => !a.startsWith('--'))
const showAll = has('--all')

const err = (m) => { process.stderr.write(`\n[parse-session] ${m}\n`); process.exit(1) }
if (!existsSync(PC_DIR)) err(`找不到投影缓存目录: ${PC_DIR}`)

const titleOf = (o) => { try { return ((o.record || {}).rows?.title || {}).val || '' } catch { return '' } }
const cwdOf = (o) => { try { return ((o.record || {}).identity || {}).cwd || '' } catch { return '' } }

// 会话根目录下的候选目录；根不存在/不可读 → 空列表（本次会话按未命中处理，
// 调用方本来就要处理「找不到日志」这一分支，没有别的通道会读到这次失败）。
function sessRoots() {
  try {
    return readdirSync(SESS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(SESS_ROOT, d.name))
  } catch { /* SESS_ROOT 不存在/不可读 → 无候选根 */ }
  return []
}

function locateLog(id) {
  for (const root of sessRoots()) {
    const cand = join(root, id, 'session.jsonl.zstd')
    if (existsSync(cand)) return cand
  }
  return null
}

// ===== 1) 反查会话 =====
const files = readdirSync(PC_DIR).filter((f) => f.endsWith('.json'))
let found = null
for (const f of files) {
  const id = f.replace(/\.json$/, '')
  let obj
  try { obj = JSON.parse(readFileSync(join(PC_DIR, f), 'utf8')) } catch { continue }
  const title = titleOf(obj)
  if (q && !title.includes(q)) continue
  if (!title && !showAll) continue
  found = { id, title, cwd: cwdOf(obj), log: locateLog(id) }
  break
}
if (!found) { process.stdout.write(`\n未找到标题含「${q}」的会话（投影缓存 ${files.length} 条）。\n`); process.exit(0) }

process.stdout.write(`会话 id : ${found.id}\n`)
process.stdout.write(`标题    : ${found.title || '(无标题)'}\n`)
process.stdout.write(`cwd     : ${found.cwd || '(未知)'}\n`)
process.stdout.write(`日志    : ${found.log || '(未找到)'}\n`)
if (!found.log) process.exit(0)

// ===== 2) 解压 =====
const raw = execFileSync('zstd', ['-dc', found.log], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8')
const lines = raw.split('\n').filter(Boolean)

// ===== 3) 逐行解析，过滤流式碎片 =====
const keep = new Set(['user/message', 'assistant/message', 'tool/call', 'tool/result', 'turn/end', 'todo/write', 'session/title'])
const evts = []
for (const ln of lines) {
  let o
  try { o = JSON.parse(ln) } catch { continue }
  if (keep.has(o.type)) evts.push(o)
}

// ===== 4) 统计 ====
const toolCalls = evts.filter((e) => e.type === 'tool/call')
const userMsgs = evts.filter((e) => e.type === 'user/message')
const finalMsgs = evts.filter((e) => e.type === 'assistant/message')
const turns = new Set(evts.map((e) => e.data?.turn).filter(Boolean))
const steps = evts.filter((e) => e.data?.step != null).map((e) => e.data.step)
const turnMsg = { '': '' }
process.stdout.write(`\n=== 概况 ===\n`)
process.stdout.write(`turn 数: ${turns.size} | 工具调用: ${toolCalls.length} 次 | user 消息: ${userMsgs.length} | assistant 消息: ${finalMsgs.length}\n`)

const textOf = (content) => {
  // content 可能是数组（[{type:reasoning/text/tool-call}]）或字符串
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const t = []
  for (const c of content) if (c && typeof c === 'object' && (c.type === 'text' || c.type === 'output_text')) t.push(c.text || '')
  return t.join('\n')
}

// ===== 5) 用户消息 =====
process.stdout.write(`\n=== 用户消息 ===\n`)
for (const e of userMsgs) {
  const c = e.data?.content
  let txt = ''
  if (Array.isArray(c)) txt = c.map((x) => (typeof x === 'string' ? x : x?.text || '')).join('\n')
  else if (typeof c === 'string') txt = c
  process.stdout.write(`[user] ${txt.split('\n')[0].slice(0, 220)}\n`)
}

// ===== 6) 工具调用序列 =====
process.stdout.write(`\n=== 工具调用序列 ===\n`)
for (const e of toolCalls) {
  const d = e.data || {}
  const nm = d.name || ''
  let args = ''
  try { args = JSON.parse(d.arguments || '{}') } catch { args = { raw: d.arguments } }
  // 对常见工具，抽最关键的参数
  let shown = ''
  if (nm === 'bash') shown = (args.command || '').slice(0, 140)
  else if (nm === 'read') shown = (args.file_path || '')
  else if (nm === 'write') shown = (args.file_path || '')
  else if (nm === 'skill') shown = (args.name || '')
  else if (nm === 'todo_write') shown = JSON.stringify((args.todos || []).map((t) => t.content?.slice(0, 30))).slice(0, 160)
  else shown = JSON.stringify(args).slice(0, 120)
  process.stdout.write(`  [t${d.turn}s${d.step}] ${nm} :: ${shown}\n`)
}

// ===== 7) 每轮最终回复 =====
process.stdout.write(`\n=== 每轮最终回复（assistant text 摘要）===\n`)
for (const e of finalMsgs) {
  const d = e.data || {}
  const txt = textOf(d.message?.content).trim()
  if (!txt) continue
  process.stdout.write(`\n--- turn=${d.turn} step=${d.step} ---\n${txt.slice(0, 900)}\n`)
}

// ===== 8) turn/end 原因 =====
process.stdout.write(`\n=== turn 结束原因 ===\n`)
for (const e of evts.filter((x) => x.type === 'turn/end')) {
  const d = e.data || {}
  const reason = d.reason || {}
  // reason {code, ...}——打印 code/stopReason 等
  process.stdout.write(`  turn=${d.turn} ${JSON.stringify(reason).slice(0, 200)}\n`)
}
