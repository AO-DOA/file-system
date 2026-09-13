// P5-A 对账补测：「已确证缺口」的用例。
//
// 对账口径：逐条比对本仓既有四个 abilities spec
// （abilities-folder-file / abilities-registry / abilities-source-doc / abilities-translate-doc）的断言面，
// 本文件只承载其余 spec 里没有等价断言的那 1 条缺口。
//
// 缺口：
//   「renderAnnotatedDoc：短行短注解走行尾，长注解走行上方并继承缩进，行号不连续插空行」
//   的其余断言都已被本仓覆盖——行尾排版见 abilities-source-doc.spec.ts:215（逐字全文断言）、
//   行号不连续插空行见同文件 :309、产物 frontmatter 亦在同一条逐字断言里；
//   唯独「行上方注解行继承其代码行的前导缩进」在本仓中找不到任何等价断言：
//   本仓里两条「改走行上方」的用例（:246 代码行超 78 字符、:259 注解超 30 个字符）
//   传入的源码行都没有前导空白，doc-render.ts 的 indent 取码恒走空串分支，
//   于是「缩进继承」这条排版规则（源码注释里列为排版原则第 1 条）在本仓中无断言锁定。
//   本用例用同一组输入（4 空格缩进的代码行 + 39 字长注解）把它补上。
import { describe, expect, it } from 'vitest'
import { renderAnnotatedDoc } from '../src/host/abilities/source-doc/doc-render'

describe('P5-A 对账缺口：L3 产物排版', () => {
  it('长注解走行上方时，注解行继承其代码行的前导缩进', () => {
    // 输入：第 2 行代码带 4 空格缩进，注解刻意写长（39 字 > 30）→ 走「行上方」分支；
    // 注解行的前导空白必须与代码行一致（checkHealth 的缩进自检据此判定，故 problems 必须为空）。
    const longNote = '这一行是刻意写长的注解，用来触发行上方排版分支，字数超过三十个汉字。'
    const { doc, problems } = renderAnnotatedDoc({
      units: [
        { type: 'line', start: 1, end: 1, note: '定义函数 f', code: 'function f() {' },
        { type: 'line', start: 2, end: 2, note: longNote, code: '    const x = 1' },
        { type: 'line', start: 4, end: 4, note: '结束', code: '}' },
      ],
      summary: '演示排版',
      srcLines: ['function f() {', '    const x = 1', '', '}'],
      rel: 'ws/src/a.ts',
      layer: '源码',
      generatedAt: '2026-09-10 03:30',
    })

    expect(problems).toEqual([])
    // 短行 + 短注解 → 行尾（零缩进的代码行，注解跟在行尾）
    expect(doc).toContain('\nfunction f() {  // [1] 定义函数 f\n')
    // 长注解 → 注解行位于代码行上方，且继承代码行的 4 空格缩进
    expect(doc).toContain('\n    // [2] ' + longNote + '\n')
    expect(doc).toContain('\n    const x = 1\n')
    // 行号不连续（2 → 4）→ 单元之间插一个空行（本条已由 abilities-source-doc.spec.ts:309 覆盖，
    // 此处同输入一并锁定，避免排版规则在同一用例内被拆散）
    expect(doc).toContain('\n\n}  // [4] 结束')
  })
})
