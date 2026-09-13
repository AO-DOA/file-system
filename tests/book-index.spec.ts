// dsh-plugin-fs — src/host/book-index.ts 单元测试。
// 用例按「可观察行为」设计：index.json 的 upsert 语义（按「源码路径」命中整条替换 / 未命中 push）、
// 四层数组兜底、其它数组原样保留、目录不存在时 mkdir -p。
// 覆盖口径：本文件按 file 级 行/函数/分支 100% 设计。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { upsertBookIndex, type BookIndexEntry, type BookIndexRoot } from '../src/host/book-index'

let home: string
let workRoot: string
let bookRoot: BookIndexRoot

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'fs-book-index-home-'))
  workRoot = await mkdtemp(join(tmpdir(), 'fs-book-index-work-'))
  bookRoot = { dir: join(home, 'books', '--bucket--'), projectRoot: workRoot }
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(home, { recursive: true, force: true })
  await rm(workRoot, { recursive: true, force: true })
})

// 读桶 index.json（解析结果只在断言中使用，故一律 unknown）。
async function readIdx(): Promise<unknown> {
  const raw: unknown = JSON.parse(await readFile(join(bookRoot.dir, 'index.json'), 'utf8'))
  return raw
}

// 预置一份 index.json 文本（构造缺字段 / 损坏 / 非标准形态）。
async function prewrite(raw: string): Promise<void> {
  await mkdir(bookRoot.dir, { recursive: true })
  await writeFile(join(bookRoot.dir, 'index.json'), raw, 'utf8')
}

describe('upsertBookIndex', () => {
  it('首次写入：mkdir -p 建桶目录，写默认骨架（项目/项目根 + 四空数组）并 push 条目', async () => {
    const entry: BookIndexEntry = { 源码路径: 'ws/src', 文档: '目录概览/src.md' }
    await upsertBookIndex(bookRoot, '目录层', entry)

    expect(await readIdx()).toEqual({
      项目: basename(workRoot),
      项目根: workRoot,
      目录层: [entry],
      文件层: [],
      源码层: [],
      文章翻译: [],
    })
  })

  it('既有 index.json 缺字段：补空数组，已有数组与其它键原样保留（不补 项目/项目根）', async () => {
    await prewrite(JSON.stringify({ 目录层: [{ 源码路径: 'old' }], 保留键: 1 }))

    const entry: BookIndexEntry = { 源码路径: 'ws/a.ts', 文档: '文件摘要/a.md' }
    await upsertBookIndex(bookRoot, '文件层', entry)

    expect(await readIdx()).toEqual({
      目录层: [{ 源码路径: 'old' }],
      保留键: 1,
      文件层: [entry],
      源码层: [],
      文章翻译: [],
    })
  })

  it('按「源码路径」命中：整条替换（长度不变，旧字段不残留）', async () => {
    await upsertBookIndex(bookRoot, '文件层', { 源码路径: 'ws/a.ts', 文档: '文件摘要/a.md' })
    await upsertBookIndex(bookRoot, '文件层', { 源码路径: 'ws/a.ts', 文档: '文件摘要/a2.md', 生成时间: '2026-09-11 03:00' })

    const idx = await readIdx()
    expect(idx).toEqual({
      项目: basename(workRoot),
      项目根: workRoot,
      目录层: [],
      文件层: [{ 源码路径: 'ws/a.ts', 文档: '文件摘要/a2.md', 生成时间: '2026-09-11 03:00' }],
      源码层: [],
      文章翻译: [],
    })
  })

  it('「源码路径」不同则追加，且其它层数组逐字保留', async () => {
    await upsertBookIndex(bookRoot, '目录层', { 源码路径: 'ws/src', 文档: '目录概览/src.md' })
    await upsertBookIndex(bookRoot, '文章翻译', { 源码路径: 'ws/README.md', 文档: '文章翻译/ws-README.md' })
    await upsertBookIndex(bookRoot, '目录层', { 源码路径: 'ws/lib', 文档: '目录概览/lib.md' })

    const idx = await readIdx()
    expect(idx).toEqual({
      项目: basename(workRoot),
      项目根: workRoot,
      目录层: [
        { 源码路径: 'ws/src', 文档: '目录概览/src.md' },
        { 源码路径: 'ws/lib', 文档: '目录概览/lib.md' },
      ],
      文件层: [],
      源码层: [],
      文章翻译: [{ 源码路径: 'ws/README.md', 文档: '文章翻译/ws-README.md' }],
    })
  })

  it('index.json 损坏：按默认骨架重建（条目照常写入）', async () => {
    await prewrite('{ 这不是 json')

    const entry: BookIndexEntry = { 源码路径: 'ws/a.ts', 文档: '源码注解/a.md' }
    await upsertBookIndex(bookRoot, '源码层', entry)

    expect(await readIdx()).toEqual({
      项目: basename(workRoot),
      项目根: workRoot,
      目录层: [],
      文件层: [],
      源码层: [entry],
      文章翻译: [],
    })
  })

  it('非白名单数组名：该键不存在时按空数组兜底后写入', async () => {
    await upsertBookIndex(bookRoot, '未知层', { 源码路径: 'k', 文档: 'x.md' })

    const idx = await readIdx()
    expect(idx).toEqual({
      项目: basename(workRoot),
      项目根: workRoot,
      目录层: [],
      文件层: [],
      源码层: [],
      文章翻译: [],
      未知层: [{ 源码路径: 'k', 文档: 'x.md' }],
    })
  })

  it('落盘格式：2 空格缩进 JSON + 尾换行，目录已存在时幂等', async () => {
    const entry: BookIndexEntry = { 源码路径: 'ws/a.ts', 文档: '文件摘要/a.md' }
    await upsertBookIndex(bookRoot, '文件层', entry)
    await upsertBookIndex(bookRoot, '文件层', entry)

    const text = await readFile(join(bookRoot.dir, 'index.json'), 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "文件层": [')
    expect(text).toContain(`"项目": "${basename(workRoot)}"`)
  })
})
