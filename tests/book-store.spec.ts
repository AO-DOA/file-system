// dsh-plugin-fs — src/host/book-store.ts 单元测试。
// 用例按「可观察行为」设计：桶定位、index.json 合并式补字段、已知根注册表与 TTL 缓存、
// 最近根定向、四层 stem 集合双位置只读回退、/tree 视图缓存。
// 覆盖口径：本文件按 file 级 行/函数/分支 100% 设计，边缘分支用例集中在各 describe 末尾。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createBookStore, type BookRootEntry } from '../src/host/book-store'
import { legacyBookDir, newBookDir, projectKey, relToSrcKey } from '../src/host/fs-utils'

let home: string
let workRoot: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'fs-book-store-home-'))
  workRoot = await mkdtemp(join(tmpdir(), 'fs-book-store-work-'))
  vi.stubEnv('DSH_HOME', home)
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(home, { recursive: true, force: true })
  await rm(workRoot, { recursive: true, force: true })
})

const booksDir = (): string => join(home, 'books')

// 写一个桶的 index.json（原始文本，便于构造「损坏 / 非对象」的取值）。
async function writeBucketRaw(bucket: string, raw: string): Promise<string> {
  const dir = join(booksDir(), bucket)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'index.json'), raw, 'utf8')
  return dir
}

// 写一个已注册的桶（index.json 至少含「项目根」，注册表据此发现已知项目根）。
async function writeBucket(bucket: string, index: Record<string, unknown>): Promise<string> {
  return writeBucketRaw(bucket, JSON.stringify(index))
}

// 读桶 index.json（解析结果只在断言中使用，故一律 unknown）。
async function readIdx(dir: string): Promise<unknown> {
  const raw: unknown = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'))
  return raw
}

describe('projectRootPath / freshBookDir / oldBookDir', () => {
  it('三个目录函数都按当前 root 现算（getRoot 每次取值，不缓存常量）', () => {
    let root = workRoot
    const store = createBookStore({ getRoot: () => root })
    expect(store.projectRootPath()).toBe(workRoot)
    expect(store.freshBookDir()).toBe(newBookDir(workRoot))
    expect(store.oldBookDir()).toBe(legacyBookDir(workRoot))

    // /set-root 改写 root 后立即生效：新桶/旧库目录随之漂移。
    root = join(workRoot, 'sub')
    expect(store.projectRootPath()).toBe(join(workRoot, 'sub'))
    expect(store.freshBookDir()).toBe(newBookDir(join(workRoot, 'sub')))
    expect(store.oldBookDir()).toBe(legacyBookDir(join(workRoot, 'sub')))
  })
})

describe('ensureBookDirAt / ensureBookDir', () => {
  it('新桶：建桶目录 + 四层子目录 + 最小 index.json', async () => {
    const store = createBookStore({ getRoot: () => workRoot })
    await store.ensureBookDirAt({ projectRoot: workRoot, bucket: projectKey(workRoot), dir: newBookDir(workRoot) })

    for (const sub of ['目录概览', '文件摘要', '源码注解', '文章翻译']) {
      expect((await stat(join(newBookDir(workRoot), sub))).isDirectory()).toBe(true)
    }
    expect(await readIdx(newBookDir(workRoot))).toEqual({
      项目: basename(workRoot),
      项目根: workRoot,
      目录层: [],
      文件层: [],
      源码层: [],
      文章翻译: [],
    })
  })

  it('合并式补字段：已有字段与其它键原样保留，只补缺失项', async () => {
    const dir = newBookDir(workRoot)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.json'), JSON.stringify({
      项目: '自定义项目',
      项目根: '/other/root',
      目录层: [{ 源码路径: 'x', 文档: '目录概览/x.md' }],
      备注: 'kept',
    }), 'utf8')

    const store = createBookStore({ getRoot: () => workRoot })
    await store.ensureBookDirAt({ projectRoot: workRoot, dir })

    const idx = await readIdx(dir)
    expect(idx).toEqual({
      项目: '自定义项目',
      项目根: '/other/root',
      目录层: [{ 源码路径: 'x', 文档: '目录概览/x.md' }],
      文件层: [],
      源码层: [],
      文章翻译: [],
      备注: 'kept',
    })
  })

  it('字段齐备时 changed=false：不回写（原文本原样保留，不被 pretty 重排）', async () => {
    const dir = newBookDir(workRoot)
    await mkdir(dir, { recursive: true })
    const raw = '{"项目":"p","项目根":"/r","目录层":[],"文件层":[],"源码层":[],"文章翻译":[]}'
    await writeFile(join(dir, 'index.json'), raw, 'utf8')

    const store = createBookStore({ getRoot: () => workRoot })
    await store.ensureBookDirAt({ projectRoot: workRoot, dir })

    // 回写会把内容变成 2 空格缩进 + 尾换行，故「文本逐字不变」即证明未写盘。
    expect(await readFile(join(dir, 'index.json'), 'utf8')).toBe(raw)
  })

  it('index.json 非法 JSON：按空对象重建（条目照常可用）', async () => {
    const dir = newBookDir(workRoot)
    await writeBucketRaw(projectKey(workRoot), '{ 这不是 json')

    const store = createBookStore({ getRoot: () => workRoot })
    await store.ensureBookDirAt({ projectRoot: workRoot, dir })

    expect(await readIdx(dir)).toEqual({
      项目: basename(workRoot),
      项目根: workRoot,
      目录层: [],
      文件层: [],
      源码层: [],
      文章翻译: [],
    })
  })

  it('index.json 为 JSON null / 标量：同样按空对象重建', async () => {
    const store = createBookStore({ getRoot: () => workRoot })
    for (const raw of ['null', '0', '"just-a-string"']) {
      const dir = newBookDir(workRoot)
      await writeBucketRaw(projectKey(workRoot), raw)
      await store.ensureBookDirAt({ projectRoot: workRoot, dir })
      expect(await readIdx(dir)).toEqual({
        项目: basename(workRoot),
        项目根: workRoot,
        目录层: [],
        文件层: [],
        源码层: [],
        文章翻译: [],
      })
    }
  })

  it('「项目」「项目根」为空串时视为缺失并补齐', async () => {
    const dir = newBookDir(workRoot)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.json'), JSON.stringify({
      项目: '', 项目根: '', 目录层: [], 文件层: [], 源码层: [], 文章翻译: [],
    }), 'utf8')

    const store = createBookStore({ getRoot: () => workRoot })
    await store.ensureBookDirAt({ projectRoot: workRoot, dir })

    const idx = await readIdx(dir)
    expect(idx).toEqual({
      项目: basename(workRoot),
      项目根: workRoot,
      目录层: [],
      文件层: [],
      源码层: [],
      文章翻译: [],
    })
  })

  it('ensureBookDir 建当前工作区根的桶（打开过的根即注册为已知项目根）', async () => {
    const store = createBookStore({ getRoot: () => workRoot })
    await store.ensureBookDir()
    expect(await readIdx(newBookDir(workRoot))).toEqual({
      项目: basename(workRoot),
      项目根: workRoot,
      目录层: [],
      文件层: [],
      源码层: [],
      文章翻译: [],
    })
  })
})

describe('knownBookRoots', () => {
  it('扫桶取「项目根」：跳过非目录与 books/session，跳过重复根与缺字段桶，末尾隐式并入当前根', async () => {
    const rootA = join(workRoot, 'a')
    await mkdir(rootA, { recursive: true })
    await writeBucket('--bucket-a--', { 项目根: rootA })
    await writeBucket('--bucket-dup--', { 项目根: rootA })       // 同一 root → 去重
    await writeBucket('--bucket-nofield--', { 项目: 'x' })        // 缺「项目根」→ 不参与
    await writeBucket('--bucket-empty--', { 项目根: '' })         // 空串「项目根」→ 不参与
    await writeBucketRaw('--bucket-broken--', 'not json')         // 损坏 → 不参与
    await mkdir(join(booksDir(), 'session'), { recursive: true }) // 生成会话统一工作目录 → 显式跳过
    await writeFile(join(booksDir(), 'loose.txt'), 'x', 'utf8')   // 非目录条目 → 跳过

    const store = createBookStore({ getRoot: () => workRoot })
    const roots = await store.knownBookRoots()

    expect(roots).toEqual([
      { projectRoot: rootA, bucket: '--bucket-a--', dir: join(booksDir(), '--bucket-a--') },
      { projectRoot: workRoot, bucket: projectKey(workRoot), dir: newBookDir(workRoot) },
    ])
  })

  it('当前根已由某个桶注册时不再隐式重复并入', async () => {
    await writeBucket('--bucket-self--', { 项目根: workRoot })
    const store = createBookStore({ getRoot: () => workRoot })
    const roots = await store.knownBookRoots()
    expect(roots).toEqual([
      { projectRoot: workRoot, bucket: '--bucket-self--', dir: join(booksDir(), '--bucket-self--') },
    ])
  })

  it('书库根不存在时按空列表处理，仍隐式并入当前根', async () => {
    const store = createBookStore({ getRoot: () => workRoot })
    const roots = await store.knownBookRoots()
    expect(roots).toEqual([
      { projectRoot: workRoot, bucket: projectKey(workRoot), dir: newBookDir(workRoot) },
    ])
  })

  it('TTL 5s 内命中缓存（返回同一数组），过期后重扫；invalidateRootsCache 立即失效', async () => {
    vi.useFakeTimers()
    const rootLate = join(workRoot, 'late')
    await mkdir(rootLate, { recursive: true })
    await writeBucket('--bucket-a--', { 项目根: workRoot })

    const store = createBookStore({ getRoot: () => workRoot })
    const first = await store.knownBookRoots()
    await writeBucket('--bucket-late--', { 项目根: rootLate })

    const second = await store.knownBookRoots()
    expect(second).toBe(first)                                   // 缓存命中：同一引用，未重扫

    vi.advanceTimersByTime(5001)                                 // 越过 ROOTS_CACHE_TTL
    const third = await store.knownBookRoots()
    expect(third).not.toBe(first)
    expect(third.some(r => r.projectRoot === rootLate)).toBe(true)

    store.invalidateRootsCache()
    const fourth = await store.knownBookRoots()
    expect(fourth).not.toBe(third)
  })
})

describe('bestRootFor', () => {
  const store = createBookStore({ getRoot: () => workRoot })
  const a: BookRootEntry = { projectRoot: '/a', bucket: 'b1', dir: '/d1' }
  const ab: BookRootEntry = { projectRoot: '/a/b', bucket: 'b2', dir: '/d2' }

  it('取包含 abs 的最长路径根（相等也算包含）', () => {
    expect(store.bestRootFor('/a/b/c.txt', [a, ab])).toBe(ab)
    expect(store.bestRootFor('/a', [a, ab])).toBe(a)
    expect(store.bestRootFor('/a/b', [a, ab])).toBe(ab)
  })

  it('已命中短根后遇更长根才替换；顺序相反时不回退', () => {
    expect(store.bestRootFor('/a/b/c.txt', [ab, a])).toBe(ab)
    expect(store.bestRootFor('/a/b/c.txt', [a])).toBe(a)
  })

  it('无命中、以及同前缀但非路径边界，均返回 null', () => {
    expect(store.bestRootFor('/x/y', [a, ab])).toBeNull()
    expect(store.bestRootFor('/ab', [a])).toBeNull()
    expect(store.bestRootFor('/a', [])).toBeNull()
  })

  it('win32 平台走反斜杠分隔符分支', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const wa: BookRootEntry = { projectRoot: 'C:\\a', bucket: 'b1', dir: 'd1' }
    const wab: BookRootEntry = { projectRoot: 'C:\\a\\b', bucket: 'b2', dir: 'd2' }
    expect(store.bestRootFor('C:\\a\\b\\c.txt', [wa, wab])).toBe(wab)
    expect(store.bestRootFor('C:\\a\\b', [wa, wab])).toBe(wab)
    expect(store.bestRootFor('C:\\ab', [wa])).toBeNull()
  })
})

describe('bookTargetFor', () => {
  it('命中最近已知根：产出 abs / 归属桶 / relP / 源码键', async () => {
    await writeBucket('--bucket-self--', { 项目根: workRoot })
    const store = createBookStore({ getRoot: () => workRoot })
    const target = await store.bookTargetFor('src/client/index.ts')

    expect(target.abs).toBe(join(workRoot, 'src/client/index.ts'))
    expect(target.bookRoot).toEqual({
      projectRoot: workRoot, bucket: '--bucket-self--', dir: join(booksDir(), '--bucket-self--'),
    })
    expect(target.relP).toBe('src/client/index.ts')
    expect(target.key).toBe(relToSrcKey('src/client/index.ts', workRoot))
  })

  it('rel 指向根自身（或 .）时 relP 回退 "."，键回落工作区名', async () => {
    await writeBucket('--bucket-self--', { 项目根: workRoot })
    const store = createBookStore({ getRoot: () => workRoot })
    const dot = await store.bookTargetFor('.')
    expect(dot.abs).toBe(workRoot)
    expect(dot.relP).toBe('.')
    expect(dot.key).toBe(basename(workRoot))

    const rel = await store.bookTargetFor('')
    expect(rel.abs).toBe(workRoot)
    expect(rel.relP).toBe('.')
  })

  it('注册表缓存窗口内切根：无命中根时兜底当前根自己的桶', async () => {
    let root = workRoot
    const store = createBookStore({ getRoot: () => root })
    await store.ensureBookDir()
    expect(await store.knownBookRoots()).toHaveLength(1)     // 预热 5s 缓存（内含旧根）

    const outside = join(home, 'workspace-outside')
    await mkdir(outside, { recursive: true })
    root = outside                                           // /set-root 切到另一棵无关的树

    const target = await store.bookTargetFor('x.txt')
    expect(target.abs).toBe(join(outside, 'x.txt'))
    expect(target.bookRoot.projectRoot).toBe(outside)
    expect(target.bookRoot.bucket).toBe(projectKey(outside))
    expect(target.bookRoot.dir).toBe(newBookDir(outside))
    expect(target.relP).toBe('x.txt')
    expect(target.key).toBe(relToSrcKey('x.txt', outside))
  })
})

describe('layerStemSetIn / docStemSetsIn', () => {
  it('只收该层的 .md 文件 stem（目录与非 md 忽略），多个 base 合并', async () => {
    const bucket = newBookDir(workRoot)
    await mkdir(join(bucket, '目录概览'), { recursive: true })
    await writeFile(join(bucket, '目录概览', 'a.md'), 'x', 'utf8')
    await writeFile(join(bucket, '目录概览', 'b.txt'), 'x', 'utf8')
    await mkdir(join(bucket, '目录概览', 'c.md'), { recursive: true })
    const legacy = legacyBookDir(workRoot)
    await mkdir(join(legacy, '目录概览'), { recursive: true })
    await writeFile(join(legacy, '目录概览', 'old.md'), 'x', 'utf8')

    const store = createBookStore({ getRoot: () => workRoot })
    const set = await store.layerStemSetIn([bucket, legacy], '目录概览')
    expect([...set].sort()).toEqual(['a', 'old'])
  })

  it('docStemSetsIn 恒返回四层同名键（缺失层为空集合）', async () => {
    const bucket = newBookDir(workRoot)
    await mkdir(join(bucket, '文章翻译'), { recursive: true })
    await writeFile(join(bucket, '文章翻译', 'p.md'), 'x', 'utf8')

    const store = createBookStore({ getRoot: () => workRoot })
    const sets = await store.docStemSetsIn([bucket])
    expect(Object.keys(sets)).toEqual(['目录概览', '文件摘要', '源码注解', '文章翻译'])
    expect([...sets['文章翻译']]).toEqual(['p'])
    expect(sets['文件摘要'].size).toBe(0)
  })
})

describe('cachedBookView / selfHomeEntry / invalidateDocCache', () => {
  it('视图只含与当前根有前缀关系的根，每桶双位置合并四层 stem，并幂等建当前根桶', async () => {
    const store = createBookStore({ getRoot: () => workRoot })
    await store.ensureBookDir()                              // 当前根桶（含 index.json）先注册
    await mkdir(join(newBookDir(workRoot), '文件摘要'), { recursive: true })
    await writeFile(join(newBookDir(workRoot), '文件摘要', 'self-doc.md'), 'x', 'utf8')
    await mkdir(join(legacyBookDir(workRoot), '文件摘要'), { recursive: true })
    await writeFile(join(legacyBookDir(workRoot), '文件摘要', 'legacy-doc.md'), 'x', 'utf8')

    const child = join(workRoot, 'sub')
    const unrelated = join(home, 'unrelated')
    await mkdir(child, { recursive: true })
    await mkdir(unrelated, { recursive: true })
    await writeBucket('--bucket-child--', { 项目根: child })
    await writeBucket('--bucket-parent--', { 项目根: dirname(workRoot) })
    await writeBucket('--bucket-unrelated--', { 项目根: unrelated })

    const view = await store.cachedBookView()
    expect(view.map(v => v.projectRoot).sort())
      .toEqual([workRoot, child, dirname(workRoot)].sort())

    const self = view.find(v => v.projectRoot === workRoot)
    expect(self?.bucket).toBe(projectKey(workRoot))
    expect([...((self?.sets['文件摘要']) ?? [])].sort()).toEqual(['legacy-doc', 'self-doc'])
    expect(self?.sets['目录概览'].size).toBe(0)
    expect(await readIdx(newBookDir(workRoot))).toBeTruthy()
  })

  it('root 与 TTL 都未变时命中缓存；切根后自然 miss', async () => {
    let root = workRoot
    const store = createBookStore({ getRoot: () => root })
    await store.ensureBookDir()

    const first = await store.cachedBookView()
    const second = await store.cachedBookView()
    expect(second).toBe(first)                               // 全真命中：同一引用

    const outside = join(home, 'workspace-outside')
    await mkdir(outside, { recursive: true })
    root = outside
    const third = await store.cachedBookView()
    expect(third).not.toBe(first)
    // 切根后 miss → ensureBookDir 建新根桶并写盘 → 连带失效已知根缓存 → 视图重扫只含新根。
    expect(third.map(v => v.projectRoot)).toEqual([outside])
  })

  it('越过 TTL 1.5s 后重新扫盘', async () => {
    vi.useFakeTimers()
    const store = createBookStore({ getRoot: () => workRoot })
    await store.ensureBookDir()

    const first = await store.cachedBookView()
    vi.advanceTimersByTime(1501)
    const second = await store.cachedBookView()
    expect(second).not.toBe(first)
    expect(second.map(v => v.projectRoot)).toEqual([workRoot])
  })

  it('win32 平台走反斜杠分隔符分支', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const store = createBookStore({ getRoot: () => workRoot })
    await store.ensureBookDir()
    const view = await store.cachedBookView()
    expect(view.map(v => v.projectRoot)).toEqual([workRoot])
  })

  it('invalidateDocCache 同时清文档视图与已知根注册表缓存', async () => {
    const store = createBookStore({ getRoot: () => workRoot })
    const first = await store.cachedBookView()

    const late = join(workRoot, 'late')
    await mkdir(late, { recursive: true })
    await writeBucket('--bucket-late--', { 项目根: late })
    expect((await store.cachedBookView()).map(v => v.projectRoot)).toEqual([workRoot])  // 两个缓存都仍生效

    store.invalidateDocCache()
    const after = await store.cachedBookView()
    expect(after).not.toBe(first)
    expect(after.map(v => v.projectRoot).sort()).toEqual([workRoot, late].sort())
  })

  it('selfHomeEntry 现算当前根的归属条目：新桶 + 旧库双位置四层集合', async () => {
    const store = createBookStore({ getRoot: () => workRoot })
    await mkdir(join(newBookDir(workRoot), '源码注解'), { recursive: true })
    await writeFile(join(newBookDir(workRoot), '源码注解', 'a.md'), 'x', 'utf8')
    await mkdir(join(legacyBookDir(workRoot), '文章翻译'), { recursive: true })
    await writeFile(join(legacyBookDir(workRoot), '文章翻译', 'b.md'), 'x', 'utf8')

    const entry = await store.selfHomeEntry()
    expect(entry.projectRoot).toBe(workRoot)
    expect(entry.bucket).toBe(projectKey(workRoot))
    expect(entry.dir).toBe(newBookDir(workRoot))
    expect([...entry.sets['源码注解']]).toEqual(['a'])
    expect([...entry.sets['文章翻译']]).toEqual(['b'])
    expect(entry.sets['目录概览'].size).toBe(0)
    expect(entry.sets['文件摘要'].size).toBe(0)
  })
})
