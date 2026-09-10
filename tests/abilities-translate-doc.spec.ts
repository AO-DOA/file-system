// dsh-plugin-fs — src/host/abilities/translate-doc/index.ts 单元测试。
// 覆盖口径：本文件按「file 级 行/函数/分支 100%」设计，边缘分支（stat 失败、目标是目录、
// 超读上限、源文不可读、已中文、prevStat 命中/未命中）集中在各 describe 末尾。
// 断言只取外部可观察行为：描述符字段值、返回值、抛出的错误消息逐字。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import translateDoc, { isMostlyChinese } from '../src/host/abilities/translate-doc/index'
import { READ_LIMIT } from '../src/host/fs-utils'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fs-translate-doc-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// 截获被拒绝的错误（断言错误消息逐字）。
async function caught(fn: () => Promise<unknown>): Promise<Error> {
  try {
    await fn()
  } catch (err) {
    return err as Error
  }
  throw new Error('expected the call to reject')
}

describe('描述符字段', () => {
  it('字段面与取值逐字不变（含 scope=translate）', () => {
    expect(Object.keys(translateDoc).sort()).toEqual([
      'arr', 'dir', 'docStem', 'hostIndex', 'kind', 'layer', 'precheck', 'promptFile', 'scope', 'sub', 'verify',
    ])
    expect(translateDoc.kind).toBe('translate')
    expect(translateDoc.dir).toBe('translate-doc')
    expect(translateDoc.sub).toBe('文章翻译')
    expect(translateDoc.arr).toBe('文章翻译')
    expect(translateDoc.layer).toBe('文章翻译')
    expect(translateDoc.hostIndex).toBe(true)
    expect(translateDoc.scope).toBe('translate')
    expect(translateDoc.promptFile).toBe('prompt.md')
  })

  it('docStem 走 computeDocStem（父目录用 - 连）', () => {
    expect(translateDoc.docStem({ key: 'ws/docs/readme.md' })).toBe('docs-readme')
    expect(translateDoc.docStem({ key: 'ws/README.md' })).toBe('ws-README')
  })
})

describe('isMostlyChinese', () => {
  it('null/undefined 与非字符串输入按空串/字面量处理', () => {
    expect(isMostlyChinese(null)).toBe(false)
    expect(isMostlyChinese(undefined)).toBe(false)
    expect(isMostlyChinese('')).toBe(false)
  })

  it('无中文字符直接判否（拉丁/数字/ASCII 标点都不计中文）', () => {
    expect(isMostlyChinese('a')).toBe(false)
    expect(isMostlyChinese('A')).toBe(false)
    expect(isMostlyChinese('1')).toBe(false)
    expect(isMostlyChinese('[')).toBe(false)
  })

  it('中文数 >= 拉丁数即视为中文', () => {
    expect(isMostlyChinese('你好世界')).toBe(true)
    expect(isMostlyChinese('中a')).toBe(true)
    expect(isMostlyChinese('中文A')).toBe(true)
    expect(isMostlyChinese('中1')).toBe(true)
  })

  it('中文少于拉丁时看占比，恰好 20% 视为中文', () => {
    expect(isMostlyChinese('中abcd')).toBe(true) // 1/(1+4) === 0.2
    expect(isMostlyChinese('中abcde')).toBe(false) // 1/6 < 0.2
    expect(isMostlyChinese('中文' + 'a'.repeat(20))).toBe(false)
  })

  it('CJK 扩展区字符（>= U+10000）不算简体中文', () => {
    expect(isMostlyChinese('𠀀')).toBe(false)
    expect(isMostlyChinese('𠀀中文')).toBe(true)
  })
})

describe('precheck 派发前校验', () => {
  it('目标不存在 → 抛「源文档不存在」', async () => {
    const abs = join(dir, 'missing.md')
    const err = await caught(() => translateDoc.precheck({ abs, rel: 'ws/missing.md' }))
    expect(err.message).toBe('源文档不存在: ' + abs)
  })

  it('目标是目录 → 抛「源文档不存在」', async () => {
    const abs = join(dir, 'sub')
    await mkdir(abs)
    const err = await caught(() => translateDoc.precheck({ abs, rel: 'ws/sub' }))
    expect(err.message).toBe('源文档不存在: ' + abs)
  })

  it('源文超过 READ_LIMIT → 抛「源文档过大」', async () => {
    const abs = join(dir, 'big.md')
    await writeFile(abs, 'a'.repeat(READ_LIMIT + 1), 'utf8')
    const err = await caught(() => translateDoc.precheck({ abs, rel: 'ws/big.md' }))
    expect(err.message).toBe('源文档过大（> ' + String(READ_LIMIT) + ' 字节）')
  })

  it('源文已是简体中文 → 抛「无需翻译」（且只采样前 8192 字节）', async () => {
    const abs = join(dir, 'zh.md')
    await writeFile(abs, '中文'.repeat(4), 'utf8')
    const err = await caught(() => translateDoc.precheck({ abs, rel: 'ws/zh.md' }))
    expect(err.message).toBe('源文档已是简体中文，无需翻译: ws/zh.md')

    const longAbs = join(dir, 'zh-long.md')
    await writeFile(longAbs, '中'.repeat(9000), 'utf8')
    const errLong = await caught(() => translateDoc.precheck({ abs: longAbs, rel: 'ws/zh-long.md' }))
    expect(errLong.message).toBe('源文档已是简体中文，无需翻译: ws/zh-long.md')
  })

  it('非中文源文 → 放行（不抛）', async () => {
    const abs = join(dir, 'en.md')
    await writeFile(abs, '# Title\n\nSome English body.\n', 'utf8')
    await expect(translateDoc.precheck({ abs, rel: 'ws/en.md' })).resolves.toBeUndefined()
  })

  it('stat 成功但 readFile 失败（head 为 null）→ 不判语种，放行', async (ctx) => {
    const abs = join(dir, 'unreadable.md')
    await writeFile(abs, '# 中文标题', 'utf8')
    await chmod(abs, 0o000)
    const unreadable = await readFile(abs, 'utf8').then(() => false, () => true)
    if (!unreadable) {
      // 运行用户可无视权限位（如 root）：本分支在该环境下不可达，跳过以免假红。
      ctx.skip()
      return
    }
    await expect(translateDoc.precheck({ abs, rel: 'ws/unreadable.md' })).resolves.toBeUndefined()
  })
})

describe('verify 收尾校验', () => {
  it('译文不存在 → 抛「译文未写入目标文件」', async () => {
    const docAbs = join(dir, 'out', 'a.md')
    const err = await caught(() => translateDoc.verify({ docAbs, prevStat: undefined }))
    expect(err.message).toBe('译文未写入目标文件: ' + docAbs)
  })

  it('目标是目录 → 抛「译文未写入目标文件」', async () => {
    const docAbs = join(dir, 'outdir')
    await mkdir(docAbs)
    const err = await caught(() => translateDoc.verify({ docAbs, prevStat: undefined }))
    expect(err.message).toBe('译文未写入目标文件: ' + docAbs)
  })

  it('更新模式下 mtime/size 均未变 → 抛「译文未更新」', async () => {
    const docAbs = join(dir, 'doc.md')
    await writeFile(docAbs, '译文', 'utf8')
    const st = await stat(docAbs)
    const err = await caught(() => translateDoc.verify({ docAbs, prevStat: { mtimeMs: st.mtimeMs, size: st.size } }))
    expect(err.message).toBe('子 agent 已结束但译文未更新: ' + docAbs)
  })

  it('size 变化（mtime 相同）→ 放行', async () => {
    const docAbs = join(dir, 'doc2.md')
    await writeFile(docAbs, '译文', 'utf8')
    const st = await stat(docAbs)
    await expect(translateDoc.verify({ docAbs, prevStat: { mtimeMs: st.mtimeMs, size: st.size + 1 } })).resolves.toBeUndefined()
  })

  it('mtime 变化（size 相同）→ 放行', async () => {
    const docAbs = join(dir, 'doc3.md')
    await writeFile(docAbs, '译文', 'utf8')
    const st = await stat(docAbs)
    await expect(translateDoc.verify({ docAbs, prevStat: { mtimeMs: st.mtimeMs + 1, size: st.size } })).resolves.toBeUndefined()
  })

  it('首次模式（无 prevStat）→ 只校验落盘', async () => {
    const docAbs = join(dir, 'doc4.md')
    await writeFile(docAbs, '译文', 'utf8')
    await expect(translateDoc.verify({ docAbs, prevStat: null })).resolves.toBeUndefined()
  })
})
