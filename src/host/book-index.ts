// 书库 index.json 的确定性写入（宿主负责，不交给模型）。
// 2026-09-10 能力目录化重构时从 src/host/index.ts 抽出，L1/L2 与翻译层共用。
import { promises as fsp } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

// 书库四层数组名（与 fs-utils.ts 的 BOOK_REL_LAYERS 对应）。
const INDEX_ARRAYS: string[] = ['目录层', '文件层', '源码层', '文章翻译']

// 目标归属桶：写入只需要桶目录与该项目根的绝对路径（调用方直传 book-store 的归属条目）。
export interface BookIndexRoot {
  dir: string
  projectRoot: string
}

// 索引条目：以「源码路径」为唯一键（中文键逐字保留），其余字段原样写入。
export interface BookIndexEntry {
  源码路径: string
  [k: string]: unknown
}

// index.json 的已知字段（中文键逐字保留）；索引签名保留「其它数组原样保留」的动态读写。
interface BookIndexFile {
  项目?: string
  项目根?: string
  目录层?: unknown[]
  文件层?: unknown[]
  源码层?: unknown[]
  文章翻译?: unknown[]
  [k: string]: unknown
}

// upsert 一条索引：索引文件落在目标归属桶（最近已知项目根）；「项目根」写该项目根绝对路径
// （旧值为 basename，读取仅展示不做转换）；保留其它数组原样。以「源码路径」为键：存在即替换。
export async function upsertBookIndex(bookRoot: BookIndexRoot, arrName: string, entry: BookIndexEntry): Promise<void> {
  const idxPath = resolve(bookRoot.dir, 'index.json')
  let idx: BookIndexFile = { 项目: basename(bookRoot.projectRoot), 项目根: bookRoot.projectRoot, 目录层: [], 文件层: [], 源码层: [], 文章翻译: [] }
  try { idx = JSON.parse(await fsp.readFile(idxPath, 'utf8')) as BookIndexFile } catch { /* 不存在/损坏 → 下面按空对象重建 */ }
  for (const k of INDEX_ARRAYS) if (!Array.isArray(idx[k])) idx[k] = []
  if (!Array.isArray(idx[arrName])) idx[arrName] = []
  const arr = idx[arrName] as unknown[]
  const i = arr.findIndex(x => (x as BookIndexEntry)['源码路径'] === entry['源码路径'])
  if (i >= 0) arr[i] = entry
  else arr.push(entry)
  await fsp.mkdir(dirname(idxPath), { recursive: true })
  await fsp.writeFile(idxPath, JSON.stringify(idx, null, 2) + '\n', 'utf8')
}
