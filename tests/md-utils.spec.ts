// dsh-plugin-fs — src/client/md-utils.ts 单元测试。
// locale 字典/t() 契约断言由 tests/locale.spec.ts 承接，此处只保留
// labLabelKey → 字典文案的闭环（键必须能在 ZH 中取到）。
// 只断言外部可观察行为（返回值），不与实现绑定；无 DOM / 无 React。
// 覆盖口径：本文件按「file 级 行/函数/分支 100%」设计，边缘分支用例集中在各 describe 末尾。
import { describe, expect, it } from 'vitest'
import {
  basename,
  extBadge,
  extOf,
  isMd,
  labLabelKey,
  langFor,
  parseFmRows,
  splitFrontmatter,
} from '../src/client/md-utils'
import { ZH } from '../src/shared/locale'

describe('basename', () => {
  it('取路径最后一段', () => {
    expect(basename('a/b/c.js')).toBe('c.js')
    expect(basename('README.md')).toBe('README.md')
    expect(basename('src/client/index.ts')).toBe('index.ts')
  })

  it('尾斜杠：空尾段回退原串', () => {
    expect(basename('a/b/')).toBe('a/b/')
  })

  it('空值输入返回空串（null / undefined / 空串）', () => {
    expect(basename('')).toBe('')
    expect(basename(null)).toBe('')
    expect(basename(undefined)).toBe('')
  })
})

describe('extOf', () => {
  it('取小写扩展名', () => {
    expect(extOf('index.js')).toBe('js')
    expect(extOf('a.B.TSX')).toBe('tsx') // 大写归一化
    expect(extOf('a.tar.gz')).toBe('gz') // 多点取最后一个
  })

  it('无扩展名返回空串', () => {
    expect(extOf('LICENSE')).toBe('')
    expect(extOf('.gitignore')).toBe('') // 点位于首字符 -> 隐藏文件而非扩展名
  })

  it('空值输入返回空串（null / undefined / 空串）', () => {
    expect(extOf('')).toBe('')
    expect(extOf(null)).toBe('')
    expect(extOf(undefined)).toBe('')
  })
})

describe('extBadge', () => {
  it('已知扩展名取字典短角标', () => {
    expect(extBadge('a.js')).toBe('JS')
    expect(extBadge('a.ts')).toBe('TS')
    expect(extBadge('a.md')).toBe('MD')
    expect(extBadge('a.json')).toBe('{}')
    expect(extBadge('a.py')).toBe('PY')
    expect(extBadge('a.css')).toBe('CSS')
    expect(extBadge('a.html')).toBe('<>')
    expect(extBadge('a.sh')).toBe('$')
    expect(extBadge('a.yml')).toBe('Y')
    expect(extBadge('a.yaml')).toBe('Y')
  })

  it('路径含目录时只看文件名扩展名', () => {
    expect(extBadge('src/client/index.js')).toBe('JS')
    expect(extBadge('docs/note.md')).toBe('MD')
  })

  it('未知扩展名取前 3 字符大写', () => {
    expect(extBadge('a.scss')).toBe('SCS')
    expect(extBadge('a.tex')).toBe('TEX')
    expect(extBadge('a.verylongext')).toBe('VER')
  })

  it('无扩展名返回空串', () => {
    expect(extBadge('a')).toBe('')
    expect(extBadge('.gitignore')).toBe('')
    expect(extBadge('')).toBe('')
    expect(extBadge(null)).toBe('')
    expect(extBadge(undefined)).toBe('')
  })
})

describe('langFor', () => {
  it('扩展名映射 shiki 语言 id', () => {
    expect(langFor('js')).toBe('js')
    expect(langFor('mjs')).toBe('js')
    expect(langFor('ts')).toBe('ts')
    expect(langFor('py')).toBe('python')
    expect(langFor('sh')).toBe('shellscript')
    expect(langFor('yml')).toBe('yaml')
    expect(langFor('xml')).toBe('xml')
  })

  it('未知/空扩展名回退 text', () => {
    expect(langFor('md')).toBe('text') // markdown 不经代码高亮，由 MarkdownText 渲染
    expect(langFor('unknown')).toBe('text')
    expect(langFor('')).toBe('text')
  })
})

describe('isMd', () => {
  it('识别 markdown 扩展名', () => {
    expect(isMd('md')).toBe(true)
    expect(isMd('markdown')).toBe(true)
  })

  it('非 markdown 扩展名返回 false', () => {
    expect(isMd('txt')).toBe(false)
    expect(isMd('js')).toBe(false)
    expect(isMd('')).toBe(false)
  })
})

describe('splitFrontmatter', () => {
  it('标准 frontmatter 拆解（多行 + 冒号）', () => {
    const r = splitFrontmatter('---\ntitle: Demo\nauthor: x\n---\n# 正文\n段落')
    expect(r.fm).toBe('title: Demo\nauthor: x')
    expect(r.body).toBe('# 正文\n段落')
  })

  it('frontmatter 值内含冒号与多行时逐字保留', () => {
    const r = splitFrontmatter('---\nsrc: a/b.js\ntime: 2026-09-11 10:00:00\ndesc: 中文: 含冒号\n---\nbody')
    expect(r.fm).toBe('src: a/b.js\ntime: 2026-09-11 10:00:00\ndesc: 中文: 含冒号')
    expect(r.body).toBe('body')
  })

  it('未闭合 --- 视为无 frontmatter，整文回 body', () => {
    const text = '---\ntitle: Demo'
    expect(splitFrontmatter(text)).toEqual({ fm: null, body: text })
  })

  it('空 frontmatter（紧邻闭合）', () => {
    const r = splitFrontmatter('---\n---\nbody')
    expect(r.fm).toBe('')
    expect(r.body).toBe('body')
  })

  it('无 frontmatter', () => {
    const r = splitFrontmatter('just body\nline2')
    expect(r.fm).toBe(null)
    expect(r.body).toBe('just body\nline2')
  })

  it('仅一行 ---（无闭合行）视为无 frontmatter', () => {
    const text = '---'
    expect(splitFrontmatter(text)).toEqual({ fm: null, body: text })
  })

  it('首行前导空白可容错（trim 判定）', () => {
    const r = splitFrontmatter('  ---\na: 1\n---\nbody')
    expect(r.fm).toBe('a: 1')
    expect(r.body).toBe('body')
  })

  it('CRLF 行尾容错：闭合行识别，fm 保留 \\r（原行为）', () => {
    const r = splitFrontmatter('---\r\na: 1\r\n---\r\nbody')
    expect(r.fm).toBe('a: 1\r')
    expect(r.body).toBe('body')
  })

  it('闭合后无正文', () => {
    const r = splitFrontmatter('---\na: 1\n---')
    expect(r.fm).toBe('a: 1')
    expect(r.body).toBe('')
  })

  it('空/未定义输入', () => {
    expect(splitFrontmatter('')).toEqual({ fm: null, body: '' })
    expect(splitFrontmatter(null)).toEqual({ fm: null, body: '' })
    expect(splitFrontmatter(undefined)).toEqual({ fm: null, body: '' })
  })
})

describe('parseFmRows', () => {
  it('标准键值行', () => {
    expect(parseFmRows('title: Demo\nauthor: someone\n')).toEqual([
      { key: 'title', value: 'Demo' },
      { key: 'author', value: 'someone' },
    ])
  })

  it('非键值行保留原文且 key 为 null', () => {
    expect(parseFmRows('# 注释\nplain line')).toEqual([
      { key: null, value: '# 注释' },
      { key: null, value: 'plain line' },
    ])
  })

  it('空行/纯空白行剔除', () => {
    expect(parseFmRows('a: 1\n\n   \nb: 2')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ])
  })

  it('键值含中文/冒号/连字符/下划线', () => {
    expect(parseFmRows('标题: 中文值\nmy-key_1: a:b:c')).toEqual([
      { key: null, value: '标题: 中文值' }, // 键首字符为中文，不符合 [A-Za-z0-9_-] 首键规则 -> 原文行
      { key: 'my-key_1', value: 'a:b:c' },
    ])
  })

  it('键无值', () => {
    expect(parseFmRows('a:')).toEqual([{ key: 'a', value: '' }])
  })

  it('空/未定义输入返回空数组', () => {
    expect(parseFmRows('')).toEqual([])
    expect(parseFmRows(null)).toEqual([])
    expect(parseFmRows(undefined)).toEqual([])
  })
})

describe('labLabelKey', () => {
  it('模式映射字典 key（doc 按 isDir 区分）', () => {
    expect(labLabelKey('doc', true)).toBe('labDocDir')
    expect(labLabelKey('doc', false)).toBe('labDocFile')
    expect(labLabelKey('annot', false)).toBe('labAnnot')
    expect(labLabelKey('tr', false)).toBe('labTr')
    expect(labLabelKey('source', false)).toBe('labSrc')
    expect(labLabelKey('anything-else', false)).toBe('labSrc') // 默认源码
  })

  it('非 doc 模式不受 isDir 影响', () => {
    expect(labLabelKey('annot', true)).toBe('labAnnot')
    expect(labLabelKey('tr', true)).toBe('labTr')
    expect(labLabelKey('source', true)).toBe('labSrc')
  })

  it('返回的 key 均能在字典中取到文案（闭环）', () => {
    // ZH 的键集是精确字面量（无索引签名），动态键经 Record 视读取值。
    const dict = ZH as Record<string, string>
    expect(dict[labLabelKey('doc', true)]).toBe('目录概览')
    expect(dict[labLabelKey('doc', false)]).toBe('文件摘要')
    expect(dict[labLabelKey('annot', false)]).toBe('源码注解')
    expect(dict[labLabelKey('tr', false)]).toBe('文章翻译')
    expect(dict[labLabelKey('source', false)]).toBe('源码')
  })
})
