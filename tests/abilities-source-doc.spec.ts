// dsh-plugin-fs — src/host/abilities/source-doc/（L3 源码注解能力）单元测试。
// 覆盖三块：确定性骨架渲染（skeleton.ts）、产物侧解析/排版/自检（doc-render.ts）、
// 能力描述符与三个钩子（index.ts：skeleton / verify / finalize）。
// 只断言外部可观察行为：骨架文本、单元划分结果、解析结果、产物全文、错误消息与落盘/删骨架副作用；
// 真实临时目录 + 真实 fs（不 mock fs），每个用例自建自清。
// 覆盖口径：本 spec 按「file 级 行/函数/分支 100%」设计，边缘分支用例集中在各 describe 末尾。
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import sourceDoc from '../src/host/abilities/source-doc/index'
import { buildSourceSkeleton, buildUnits, renderSourceSkeleton } from '../src/host/abilities/source-doc/skeleton'
import { annotationStats, checkHealth, langOf, parseFilledSkeleton, renderAnnotatedDoc } from '../src/host/abilities/source-doc/doc-render'

// 每个用例一个隔离临时目录（用例结束整目录删除）。
let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-source-doc-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('buildUnits：源码 → 可注解单元', () => {
  it('空数组输入返回空单元表', () => {
    expect(buildUnits([])).toEqual([])
  })

  it('连续 // 行合并为一个 block（start/end 首尾行号，code 以 \\n 连接原行）', () => {
    expect(buildUnits(['// 第一行', '  // 第二行', 'const a = 1'])).toEqual([
      { type: 'block', start: 1, end: 2, code: '// 第一行\n  // 第二行', note: '' },
      { type: 'line', start: 3, end: 3, code: 'const a = 1', note: '' },
    ])
  })

  it('空行触发 flush；纯符号行被跳过；同一 block 在空行后另起一个', () => {
    const units = buildUnits(['// A', '', '{', '}', ',', ';', '   ', '// B', 'foo()'])
    expect(units).toEqual([
      { type: 'block', start: 1, end: 1, code: '// A', note: '' },
      { type: 'block', start: 8, end: 8, code: '// B', note: '' },
      { type: 'line', start: 9, end: 9, code: 'foo()', note: '' },
    ])
  })

  it('结尾 flush 收尾未闭合的 block', () => {
    expect(buildUnits(['const a = 1', '// 尾部注释'])).toEqual([
      { type: 'line', start: 1, end: 1, code: 'const a = 1', note: '' },
      { type: 'block', start: 2, end: 2, code: '// 尾部注释', note: '' },
    ])
  })
})

describe('renderSourceSkeleton：骨架文本', () => {
  it('block 单元用「@块 [N-M]（注释块，合并为一条注解）」，line 单元用「@行 [N]」', () => {
    const text = renderSourceSkeleton(
      [
        { type: 'block', start: 1, end: 2, note: '', code: '// a\n// b' },
        { type: 'line', start: 3, end: 3, note: '', code: 'const a = 1' },
      ],
      '/w/a.ts',
    )
    expect(text).toContain('@块 [1-2]（注释块，合并为一条注解）\n代码: // a\n// b\n注解: \n')
    expect(text).toContain('@行 [3]\n代码: const a = 1\n注解: \n')
  })

  it('空 units：只剩文件头与 @摘要 段（逐字）', () => {
    expect(renderSourceSkeleton([], '/w/a.ts')).toBe(
      '# ===== source-doc 骨架（填空题）=====\n' +
      '# 源文件: /w/a.ts\n' +
      '# 说明：在每行「注解: 」后写出该行（或该块）在干什么的中文解释。\n' +
      '# 首次出现的英文术语/名称，在解释里就地写「English（中文）」：英文后跟一对中文圆括号给中文翻译，\n' +
      '# 这样读者顺读即懂，不再有独立术语表。只给真正的术语/名称加（中文），变量名/普通英文词不加。\n' +
      '# 只管填「注解: 」后的内容；行号与代码原文由脚本保证，不要改动其它行。\n' +
      '\n' +
      '# 先在最上面的「@摘要」后填一句话（本文件解决什么问题），用于产物「> 解决什么问题」，可留空。\n' +
      '\n' +
      '@摘要（这一页代码解决什么问题，一句话；build 写入产物「> 解决什么问题」，可留空）\n' +
      '注解: \n',
    )
  })
})

describe('buildSourceSkeleton：读源码并渲染', () => {
  it('成功：返回 text / unitCount / lineCount', async () => {
    const abs = join(dir, 'a.ts')
    await writeFile(abs, '// 注释\n\nconst a = 1\n', 'utf8')
    const { text, unitCount, lineCount } = await buildSourceSkeleton({ abs })
    expect(unitCount).toBe(2)
    expect(lineCount).toBe(4)
    expect(text).toContain(`# 源文件: ${abs}`)
    expect(text).toContain('@块 [1-1]（注释块，合并为一条注解）')
    expect(text).toContain('@行 [3]')
  })

  it('目标不可读：抛「目标不是可读文件: <abs>」', async () => {
    const abs = join(dir, 'nope.ts')
    await expect(buildSourceSkeleton({ abs })).rejects.toThrow('目标不是可读文件: ' + abs)
  })
})

describe('parseFilledSkeleton：解析填好的骨架', () => {
  it('@摘要 段：说明行被忽略，遇「注解: 」取值并退出摘要区', () => {
    const text = [
      '@摘要（这一页代码解决什么问题）',
      '这行是摘要区的说明文字，不是填写内容',
      '注解: 本文件解决的问题',
      '@行 [1]',
      '代码: const a = 1',
      '注解: 赋值',
    ].join('\n')
    const { units, summary } = parseFilledSkeleton(text)
    expect(summary).toBe('本文件解决的问题')
    expect(units).toEqual([{ type: 'line', start: 1, end: 1, note: '赋值', code: 'const a = 1' }])
  })

  it('摘要区遇 @行 / @块 退出，并继续把该行解析成单元', () => {
    const blocks = parseFilledSkeleton(['@摘要', '@块 [3-4]', '代码: // x', '注解: 块注解', '@行 [7]', '@摘要'].join('\n'))
    expect(blocks.summary).toBe('')
    expect(blocks.units).toEqual([
      { type: 'block', start: 3, end: 4, note: '块注解', code: '// x' },
      { type: 'line', start: 7, end: 7, note: '', code: '' },
    ])
  })

  it('代码收集：重复「代码: 」与普通行累积，空行忽略，遇 @行 / 注解: 终止；末尾 flushCode 收尾', () => {
    const text = [
      '@行 [1]',
      '代码: line1',
      '代码: line2',
      '  raw body',
      '',
      '@行 [6]',
      '代码: b',
      '注解: 第二单元',
      '@行 [9]',
      '代码: c',
    ].join('\n')
    const { units } = parseFilledSkeleton(text)
    expect(units).toEqual([
      { type: 'line', start: 1, end: 1, note: '', code: 'line1\nline2\n  raw body' },
      { type: 'line', start: 6, end: 6, note: '第二单元', code: 'b' },
      { type: 'line', start: 9, end: 9, note: '', code: 'c' },
    ])
  })

  it('尚未出现任何单元时的「注解: 」/「代码: 」行被忽略', () => {
    const { units, summary } = parseFilledSkeleton(['注解: 无主注解', '代码: 无主代码'].join('\n'))
    expect(units).toEqual([])
    expect(summary).toBe('')
  })
})

describe('langOf：围栏语言标签', () => {
  it('已知扩展名按映射返回（含大写扩展名先 toLowerCase）', () => {
    expect(langOf('ws/src/a.ts')).toBe('typescript')
    expect(langOf('ws/tool.py')).toBe('python')
    expect(langOf('ws/README.MD'.toLowerCase() + '.ts')).toBe('typescript')
    expect(langOf('ws/a.TS')).toBe('typescript')
  })

  it('未知扩展名与无扩展名回落 javascript', () => {
    expect(langOf('ws/a.zzz')).toBe('javascript')
    expect(langOf('ws/README')).toBe('javascript')
  })
})

describe('annotationStats：注解填充统计', () => {
  it('units 为 null / undefined 时 total 0、ratio 0', () => {
    expect(annotationStats(null)).toEqual({ filled: 0, total: 0, ratio: 0 })
    expect(annotationStats(undefined)).toEqual({ filled: 0, total: 0, ratio: 0 })
  })

  it('含假值单元时只数 note 非空者；全填 ratio 为 1', () => {
    const unit = { type: 'line' as const, start: 1, end: 1, code: 'a', note: '注解' }
    expect(annotationStats([null, undefined, unit, { ...unit, note: '' }])).toEqual({ filled: 1, total: 4, ratio: 0.25 })
    expect(annotationStats([unit, unit])).toEqual({ filled: 2, total: 2, ratio: 1 })
  })
})

describe('checkHealth：四项自检', () => {
  it('健康正文返回空数组', () => {
    expect(checkHealth(['const a = 1  // [1] 赋值', '', 'const b = 2  // [3] 声明'])).toEqual([])
  })

  it('注解占比 < 50% 报「注解占比过低」', () => {
    const bad = checkHealth(['// [1] a', 'x = 1', 'y = 2', 'z = 3'])
    expect(bad).toContain('注解占比过低（25%<50%）：疑似大量代码行未填注解')
  })

  it('空行 / 纯注释行 / 以 < 或 / 结尾的行都不计入，total 为 0 时报正文为空且无标记', () => {
    const bad = checkHealth(['', '// 纯注释', 'const x = <', 'html</'])
    expect(bad).toContain('正文没有任何可注解或代码行，产物为空')
    expect(bad).toContain('正文找不到任何 `// [N]` 注解标记（疑似全部漏注解）')
  })

  it('行上方注解缩进与后续第一个非空代码行不一致时报错', () => {
    const bad = checkHealth(['  // [1] 缩进注解', '', 'const a = 1'])
    expect(bad).toContain('行上方注解缩进与代码不一致（第 0 行）. 注解缩进="  " 代码缩进=""')
  })

  it('行上方注解之后没有非空行（只剩空行到结尾）时跳过缩进检查', () => {
    expect(checkHealth(['  // [1] a', ''])).toEqual([])
  })

  it('正文出现连续 2+ 空行时报「排版被空行割裂」', () => {
    expect(checkHealth(['const a = 1  // [1] 赋值', '', '', 'const b = 2  // [4] 声明']))
      .toContain('正文出现连续空行（>1），排版被空行割裂')
  })
})

describe('renderAnnotatedDoc：取码 + 排版 + 产物渲染', () => {
  it('短代码行 + 短注解 → 行尾注解；产物 frontmatter / 标题 / 摘要 / 围栏逐字', () => {
    const { doc, problems } = renderAnnotatedDoc({
      units: [{ type: 'line', start: 1, end: 1, note: '赋值', code: '骨架里的旧码（srcLines 优先，应被忽略）' }],
      summary: '一句话说明这页代码的价值',
      srcLines: ['const a = 1'],
      rel: 'ws/src/a.ts',
      layer: '源码',
      generatedAt: '2026-09-11 10:00',
    })
    expect(problems).toEqual([])
    expect(doc).toBe(
      '---\n' +
      '源码路径: ws/src/a.ts\n' +
      '层级: 源码\n' +
      '生成时间: 2026-09-11 10:00\n' +
      '---\n' +
      '\n' +
      '# a.ts（逐行中文注解）\n' +
      '\n' +
      '**路径**：ws/src/a.ts\n' +
      '\n' +
      '> **解决什么问题**：一句话说明这页代码的价值\n' +
      '\n' +
      '## 逐行注解（行间插入，注释已并入注解行）\n' +
      '\n' +
      '```typescript\n' +
      'const a = 1  // [1] 赋值\n' +
      '```\n',
    )
  })

  it('代码行超过 78 字符 → 改用行上方注解', () => {
    const long = 'const a = ' + 'x'.repeat(80)
    const { doc } = renderAnnotatedDoc({
      units: [{ type: 'line', start: 1, end: 1, note: '很长的行', code: '' }],
      summary: '摘要',
      srcLines: [long],
      rel: 'ws/a.ts',
      layer: '源码',
      generatedAt: 'T',
    })
    expect(doc).toContain(`// [1] 很长的行\n${long}`)
  })

  it('注解超过 30 个字符 → 改用行上方注解（按 Unicode 码点计数）', () => {
    const { doc } = renderAnnotatedDoc({
      units: [{ type: 'line', start: 1, end: 1, note: '注'.repeat(31), code: '' }],
      summary: '摘要',
      srcLines: ['const a = 1'],
      rel: 'ws/a.ts',
      layer: '源码',
      generatedAt: 'T',
    })
    expect(doc).toContain(`// [1] ${'注'.repeat(31)}\nconst a = 1`)
  })

  it('block 且 note 非空：只写注解行，原注释行不保留', () => {
    const { doc } = renderAnnotatedDoc({
      units: [{ type: 'block', start: 1, end: 2, note: '块注解', code: '' }],
      summary: '摘要',
      srcLines: ['// 原注释一', '// 原注释二'],
      rel: 'ws/a.ts',
      layer: '源码',
      generatedAt: 'T',
    })
    expect(doc).toContain('\n// [1-2] 块注解\n')
    expect(doc).not.toContain('// 原注释一')
  })

  it('block 且 note 为空：保留原代码行，避免丢内容', () => {
    const { doc } = renderAnnotatedDoc({
      units: [{ type: 'block', start: 1, end: 2, note: '', code: '' }],
      summary: '摘要',
      srcLines: ['// 原注释一', '// 原注释二'],
      rel: 'ws/a.ts',
      layer: '源码',
      generatedAt: 'T',
    })
    expect(doc).toContain('// 原注释一\n// 原注释二')
    expect(doc).not.toContain('// [1-2]')
  })

  it('line 单元 start !== end（note 为空）：标签用 [N-M]，保留代码行', () => {
    const { doc } = renderAnnotatedDoc({
      units: [{ type: 'line', start: 1, end: 2, note: '', code: '' }],
      summary: '摘要',
      srcLines: ['a', 'b'],
      rel: 'ws/a.ts',
      layer: '源码',
      generatedAt: 'T',
    })
    expect(doc).toContain('a\nb')
  })

  it('单元间行号不连续时插入空行分隔；相邻不插', () => {
    const { doc, problems } = renderAnnotatedDoc({
      units: [
        { type: 'line', start: 1, end: 1, note: '一', code: '' },
        { type: 'line', start: 5, end: 5, note: '五', code: '' },
      ],
      summary: '摘要',
      srcLines: ['a', 'b', 'c', 'd', 'e'],
      rel: 'ws/a.ts',
      layer: '源码',
      generatedAt: 'T',
    })
    expect(problems).toEqual([])
    expect(doc).toContain('a  // [1] 一\n\ne  // [5] 五')
  })

  it('不传 srcLines：回落骨架内 code；summary 为空用占位文案', () => {
    const { doc, problems } = renderAnnotatedDoc({
      units: [
        { type: 'line', start: 1, end: 1, note: '甲', code: 'foo()' },
        { type: 'line', start: 2, end: 2, note: '', code: '' },
      ],
      summary: '',
      rel: 'ws/x.py',
      layer: '源码',
      generatedAt: 'T',
    })
    expect(problems).toEqual([])
    expect(doc).toContain('foo()  // [1] 甲')
    expect(doc).toContain('```python')
    expect(doc).toContain('> **解决什么问题**：（待补充：一句话说明这页代码存在的价值）')
  })

  it('连续 3+ 空行被折叠为 1 个空行（替换 \n{3,} 生效）', () => {
    const { doc } = renderAnnotatedDoc({
      units: [
        { type: 'line', start: 1, end: 1, note: '', code: '' },
        { type: 'line', start: 3, end: 3, note: '', code: '' },
        { type: 'line', start: 5, end: 5, note: '', code: '' },
      ],
      summary: '摘要',
      srcLines: ['', 'x', '', 'y', ''],
      rel: 'ws/a.ts',
      layer: '源码',
      generatedAt: 'T',
    })
    expect(doc).toContain('```typescript\n\n\n\n```')
  })

  it('单元行号越界（start < 1 / end < start / end > 源码行数）分别抛错', () => {
    const base = { summary: '', rel: 'ws/a.ts', layer: '源码', generatedAt: 'T', srcLines: ['a', 'b'] }
    expect(() => renderAnnotatedDoc({ ...base, units: [{ type: 'line', start: 0, end: 0, note: '', code: '' }] }))
      .toThrow('单元 [0-0] 越界（源码共 2 行）')
    expect(() => renderAnnotatedDoc({ ...base, units: [{ type: 'line', start: 2, end: 1, note: '', code: '' }] }))
      .toThrow('单元 [2-1] 越界（源码共 2 行）')
    expect(() => renderAnnotatedDoc({ ...base, units: [{ type: 'line', start: 1, end: 3, note: '', code: '' }] }))
      .toThrow('单元 [1-3] 越界（源码共 2 行）')
  })
})

describe('source-doc 能力描述符与钩子', () => {
  it('描述符字段逐字（含 skeletonFile / hostBuild 两条 L3 特殊契约）', () => {
    expect(Object.keys(sourceDoc).sort()).toEqual([
      'arr', 'dir', 'docStem', 'finalize', 'hostBuild', 'hostIndex', 'kind',
      'layer', 'promptFile', 'scope', 'skeleton', 'skeletonFile', 'sub', 'verify',
    ])
    expect(sourceDoc.kind).toBe('src')
    expect(sourceDoc.dir).toBe('source-doc')
    expect(sourceDoc.sub).toBe('源码注解')
    expect(sourceDoc.arr).toBe('源码层')
    expect(sourceDoc.layer).toBe('源码')
    expect(sourceDoc.hostIndex).toBe(true)
    expect(sourceDoc.skeletonFile).toBe(true)
    expect(sourceDoc.hostBuild).toBe(true)
    expect(sourceDoc.scope).toBe('src')
    expect(sourceDoc.promptFile).toBe('prompt.md')
  })

  it('docStem 走 computeDocStem(target.key)', () => {
    expect(sourceDoc.docStem({ key: 'ws/src/a.ts' })).toBe('src-a')
  })

  it('skeleton({abs}) 返回骨架全文', async () => {
    const abs = join(dir, 'a.ts')
    await writeFile(abs, 'const a = 1\n', 'utf8')
    const text = await sourceDoc.skeleton({ abs })
    expect(text).toContain('# ===== source-doc 骨架（填空题）=====')
    expect(text).toContain(`# 源文件: ${abs}`)
    expect(text).toContain('@行 [1]\n代码: const a = 1\n注解: \n')
  })

  it('verify：骨架文件不存在 → 抛「骨架文件不存在」', async () => {
    const skeletonPath = join(dir, 'none.txt')
    await expect(sourceDoc.verify({ skeletonPath })).rejects.toThrow('子 agent 已结束但骨架文件不存在: ' + skeletonPath)
  })

  it('verify：骨架无任何可注解单元 → 抛「骨架无任何可注解单元」', async () => {
    const skeletonPath = join(dir, 'empty.txt')
    await writeFile(skeletonPath, '', 'utf8')
    await expect(sourceDoc.verify({ skeletonPath })).rejects.toThrow('骨架无任何可注解单元: ' + skeletonPath)
  })

  it('verify：有单元但一条注解都没填 → 抛「未填写任何注解」', async () => {
    const skeletonPath = join(dir, 'blank.txt')
    await writeFile(skeletonPath, ['@行 [1]', '代码: const a = 1', '注解: '].join('\n'), 'utf8')
    await expect(sourceDoc.verify({ skeletonPath })).rejects.toThrow('子 agent 已结束但未填写任何注解（疑似空转）: ' + skeletonPath)
  })

  it('verify：至少填了一条注解则通过', async () => {
    const skeletonPath = join(dir, 'filled.txt')
    await writeFile(skeletonPath, ['@行 [1]', '代码: const a = 1', '注解: 赋值'].join('\n'), 'utf8')
    await expect(sourceDoc.verify({ skeletonPath })).resolves.toBeUndefined()
  })

  it('finalize：解析骨架 → 按真实行号排版 → 写 DOC → 删骨架', async () => {
    const abs = join(dir, 'a.ts')
    await writeFile(abs, 'const a = 1\n', 'utf8')
    const skeletonPath = join(dir, 'skel.txt')
    await writeFile(skeletonPath, ['@摘要（说明）', '注解: 演示文件', '@行 [1]', '代码: const a = 1', '注解: 赋值'].join('\n'), 'utf8')
    const docAbs = join(dir, 'out', '源码注解', 'a.md')
    await sourceDoc.finalize({ docAbs, skeletonPath, targetKey: 'ws/src/a.ts', layer: '源码', generatedAt: '2026-09-11 10:00', abs })
    const doc = await readFile(docAbs, 'utf8')
    expect(doc).toContain('源码路径: ws/src/a.ts')
    expect(doc).toContain('# a.ts（逐行中文注解）')
    expect(doc).toContain('> **解决什么问题**：演示文件')
    expect(doc).toContain('const a = 1  // [1] 赋值')
    expect(existsSync(skeletonPath)).toBe(false)
  })

  it('finalize：健康自检未通过 → 抛错且不写 DOC、不删骨架', async () => {
    const abs = join(dir, 'b.ts')
    await writeFile(abs, 'const b = 2\n', 'utf8')
    const skeletonPath = join(dir, 'skel2.txt')
    await writeFile(skeletonPath, ['@行 [1]', '代码: const b = 2', '注解: '].join('\n'), 'utf8')
    const docAbs = join(dir, 'out2', '源码注解', 'b.md')
    await expect(sourceDoc.finalize({ docAbs, skeletonPath, targetKey: 'ws/b.ts', layer: '源码', generatedAt: 'T', abs }))
      .rejects.toThrow('产物健康自检未通过: ')
    expect(existsSync(docAbs)).toBe(false)
    expect(existsSync(skeletonPath)).toBe(true)
  })
})
