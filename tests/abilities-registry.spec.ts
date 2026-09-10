// dsh-plugin-fs — src/host/abilities/registry.ts 单元测试。
// 覆盖口径：本文件按「file 级 行/函数/分支 100%」设计。
// 断言导出面（四个导出的名字与所指数值）与四个能力的 kind/scope 取值——
// `scope` 与 `kind` 改名即破坏工具面收敛（GEN_SCOPE_TOOLS 按 kind 取白名单）。
// 注：任务书里的 id 前缀 `fsgen-` / `fstr-` 由 `src/host/index.js`（P3 路由层，taskId 生成处）产生，
// 不在 registry 职责内，故此处只锁 registry 的导出面与描述符字段值；P3 迁移须在路由测试里断言那两个前缀。
import { describe, expect, it } from 'vitest'
import { ABILITIES, GEN_ABILITIES, TRANSLATE_ABILITY, abilityOf } from '../src/host/abilities/registry'
import folderDoc from '../src/host/abilities/folder-doc/index'
import fileDoc from '../src/host/abilities/file-doc/index'
import sourceDoc from '../src/host/abilities/source-doc/index'
import translateDoc from '../src/host/abilities/translate-doc/index'

describe('registry 导出面', () => {
  it('GEN_ABILITIES 键为 folder/file/src，值即三个能力描述符本体', () => {
    expect(Object.keys(GEN_ABILITIES).sort()).toEqual(['file', 'folder', 'src'])
    expect(GEN_ABILITIES.folder).toBe(folderDoc)
    expect(GEN_ABILITIES.file).toBe(fileDoc)
    expect(GEN_ABILITIES.src).toBe(sourceDoc)
  })

  it('TRANSLATE_ABILITY 即翻译描述符本体', () => {
    expect(TRANSLATE_ABILITY).toBe(translateDoc)
  })

  it('ABILITIES 汇总四能力（GEN_ABILITIES 三键 + translate）', () => {
    expect(Object.keys(ABILITIES).sort()).toEqual(['file', 'folder', 'src', 'translate'])
    expect(ABILITIES.folder).toBe(folderDoc)
    expect(ABILITIES.file).toBe(fileDoc)
    expect(ABILITIES.src).toBe(sourceDoc)
    expect(ABILITIES.translate).toBe(translateDoc)
  })
})

describe('abilityOf', () => {
  it('按 kind 取对应描述符', () => {
    expect(abilityOf('folder')).toBe(folderDoc)
    expect(abilityOf('file')).toBe(fileDoc)
    expect(abilityOf('src')).toBe(sourceDoc)
    expect(abilityOf('translate')).toBe(translateDoc)
  })

  it('未知 kind 返回 undefined（调用方按 400 拒绝）', () => {
    expect(abilityOf('nope')).toBeUndefined()
    expect(abilityOf('')).toBeUndefined()
    expect(abilityOf('FOLDER')).toBeUndefined()
  })

  it('原型链键（如 constructor）落在 Object.prototype 上——源既有行为，逐字保留', () => {
    // ABILITIES 是普通对象字面量，源实现同样直接索引；迁移不修（PROGRESS.md D-9）。
    expect(abilityOf('constructor')).toBe(Object.prototype.constructor)
  })
})

describe('四能力的 kind / scope 逐值', () => {
  it('kind 与 scope 同为 folder/file/src/translate', () => {
    expect([folderDoc.kind, fileDoc.kind, sourceDoc.kind, translateDoc.kind])
      .toEqual(['folder', 'file', 'src', 'translate'])
    expect([folderDoc.scope, fileDoc.scope, sourceDoc.scope, translateDoc.scope])
      .toEqual(['folder', 'file', 'src', 'translate'])
  })

  it('dir / sub / arr / layer / promptFile 逐字不变', () => {
    expect([folderDoc.dir, folderDoc.sub, folderDoc.arr, folderDoc.layer])
      .toEqual(['folder-doc', '目录概览', '目录层', '目录'])
    expect([fileDoc.dir, fileDoc.sub, fileDoc.arr, fileDoc.layer])
      .toEqual(['file-doc', '文件摘要', '文件层', '文件'])
    expect([sourceDoc.dir, sourceDoc.sub, sourceDoc.arr, sourceDoc.layer])
      .toEqual(['source-doc', '源码注解', '源码层', '源码'])
    expect([translateDoc.dir, translateDoc.sub, translateDoc.arr, translateDoc.layer])
      .toEqual(['translate-doc', '文章翻译', '文章翻译', '文章翻译'])
    for (const ability of [folderDoc, fileDoc, sourceDoc, translateDoc]) {
      expect(ability.promptFile).toBe('prompt.md')
      expect(ability.hostIndex).toBe(true)
    }
  })
})
