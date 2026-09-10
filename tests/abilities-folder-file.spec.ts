// dsh-plugin-fs — folder-doc / file-doc 两个能力目录的单元测试。
// 迁移自迁移源 tests/abilities.test.js 中归属本单元的两组用例（node:test → vitest）；
// 迁移源未覆盖的收尾校验（verify 的四类分支）与骨架构建（buildFolderSkeleton）在本文件补齐。
// 只断言外部可观察行为：渲染文本逐字、抛错消息逐字、描述符字段值与返回值。
// 覆盖口径：本文件按「folder-doc / file-doc 两个目录下每个文件 行/函数/分支 100%」设计；
// buildFolderSkeleton 用真实临时目录（node:fs/promises + os.tmpdir），不 mock fs，用例结束清理。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FOLDER_DOC_PLACEHOLDER,
  FOLDER_DOC_ROLE_PLACEHOLDER,
  FOLDER_TREE_IGNORE,
  FOLDER_TREE_ITEM_PLACEHOLDER,
  buildFolderSkeleton,
  folderPlaceholderLeft,
  renderFolderDocSkeleton,
  renderFolderTree,
} from '../src/host/abilities/folder-doc/skeleton'
import {
  FILE_DOC_PLACEHOLDERS,
  filePlaceholderLeft,
  renderFileDocSkeleton,
} from '../src/host/abilities/file-doc/skeleton'
import folderDoc from '../src/host/abilities/folder-doc/index'
import fileDoc from '../src/host/abilities/file-doc/index'

const tempDirs: string[] = []

// 真实临时目录（buildFolderSkeleton / verify 必须走真实 fs；mock fs 会掩盖 readdir 的失败分支）。
async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fs-abilities-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

// 截获拒绝的错误消息（收尾校验的两种文案需要逐字比对，不能用子串匹配）。
async function caughtMessage(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (err) {
    return (err as Error).message
  }
  throw new Error('expected the call to reject')
}

describe('folder-doc/skeleton — renderFolderTree', () => {
  it('entries 为 null / undefined / 空数组时只输出目录名一行', () => {
    expect(renderFolderTree('p', null)).toBe('p/')
    expect(renderFolderTree('p', undefined)).toBe('p/')
    expect(renderFolderTree('p', [])).toBe('p/')
  })

  it('entry 为 null、名字为空、既非目录也非文件时一律跳过，后续项不受影响', () => {
    expect(renderFolderTree('p', [
      null,
      { name: '', isFile: true },
      { name: 'sock', isDirectory: false, isFile: false },
    ])).toBe('p/')
    expect(renderFolderTree('p', [null, { name: 'ok.js', isFile: true }])).toBe('p/\n└── ok.js  # <作用>')
  })

  it('隐藏项一律跳过（目录与文件同规则），排除名单只作用于目录', () => {
    expect(renderFolderTree('p', [
      { name: '.git', isDirectory: true },
      { name: 'node_modules', isDirectory: true },
      { name: '.env', isFile: true },
    ])).toBe('p/')
    // 排除名单里的名字作为文件仍保留（FOLDER_TREE_IGNORE 只作用于目录）
    expect(renderFolderTree('p', [{ name: 'dist', isFile: true }])).toBe('p/\n└── dist  # <作用>')
  })

  it('目录在前、文件在后，各自按名升序；末项 └──、其余 ├──，目录带尾斜杠', () => {
    const out = renderFolderTree('src', [
      { name: 'b.js', isFile: true },
      { name: 'sub', isDirectory: true },
      { name: 'a.js', isFile: true },
      { name: 'alpha', isDirectory: true },
    ])
    expect(out).toBe([
      'src/',
      '├── alpha/  # <作用>',
      '├── sub/  # <作用>',
      '├── a.js  # <作用>',
      '└── b.js  # <作用>',
    ].join('\n'))
  })

  it('单项时即末项（└──），目录带尾斜杠', () => {
    expect(renderFolderTree('p', [{ name: 'only', isDirectory: true }])).toBe('p/\n└── only/  # <作用>')
  })

  it('FOLDER_TREE_IGNORE 与三处语义占位串逐字不变', () => {
    expect(FOLDER_TREE_IGNORE).toEqual([
      '.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', 'out',
      'target', '.next', '.cache', 'vendor', '.idea', '.vscode',
    ])
    expect(FOLDER_DOC_PLACEHOLDER).toBe('<一句话说明这个文件夹是干什么的>')
    expect(FOLDER_TREE_ITEM_PLACEHOLDER).toBe('# <作用>')
    expect(FOLDER_DOC_ROLE_PLACEHOLDER).toBe('<1-2 句总体角色说明：这个目录整体在项目里扮演什么角色；不要逐项罗列子目录/文件>')
  })
})

describe('folder-doc/skeleton — renderFolderDocSkeleton', () => {
  it('整篇渲染文本逐字一致（frontmatter 三行 + 三处占位 + 目录树围栏）', () => {
    const out = renderFolderDocSkeleton({
      relPath: 'ws/src',
      name: 'src',
      layer: '目录',
      generatedAt: '2026-09-10 01:00',
      tree: 'src/\n└── a.js  # <作用>',
    })
    expect(out).toBe([
      '---',
      '源码路径: ws/src',
      '层级: 目录',
      '生成时间: 2026-09-10 01:00',
      '---',
      '',
      '# src',
      '',
      '**路径**：ws/src',
      '',
      '> <一句话说明这个文件夹是干什么的>',
      '',
      '<1-2 句总体角色说明：这个目录整体在项目里扮演什么角色；不要逐项罗列子目录/文件>',
      '',
      '## 子目录',
      '',
      '| 目录 | 作用 |',
      '|---|---|',
      '| <子目录名>/ | <一句话职责> |',
      '',
      '## 文件',
      '',
      '| 文件 | 作用 |',
      '|---|---|',
      '| <文件名> | <一句话职责> |',
      '',
      '## 目录树',
      '',
      '```',
      'src/',
      '└── a.js  # <作用>',
      '```',
      '',
    ].join('\n'))
  })
})

describe('folder-doc/skeleton — buildFolderSkeleton', () => {
  it('真实临时目录：目录在前文件在后、隐藏与排除项不出现，frontmatter 用调用方传入的值', async () => {
    const base = await makeTempDir()
    const abs = join(base, 'proj')
    await mkdir(abs)
    await mkdir(join(abs, 'alpha'))
    await mkdir(join(abs, 'beta'))
    await mkdir(join(abs, '.hidden'))
    await mkdir(join(abs, 'node_modules'))
    await writeFile(join(abs, 'b.txt'), 'b')
    await writeFile(join(abs, 'a.js'), 'a')
    await writeFile(join(abs, '.env'), 'env')

    const out = await buildFolderSkeleton({
      abs,
      targetKey: 'ws/proj',
      docStem: 'proj',
      layer: '目录',
      generatedAt: '2026-09-10 03:00',
    })

    expect(out).toContain('源码路径: ws/proj\n层级: 目录\n生成时间: 2026-09-10 03:00\n---')
    expect(out).toContain('\n# proj\n')
    expect(out).toContain('```\n' + [
      'proj/',
      '├── alpha/  # <作用>',
      '├── beta/  # <作用>',
      '├── a.js  # <作用>',
      '└── b.txt  # <作用>',
    ].join('\n') + '\n```')
    expect(out).not.toContain('node_modules')
    expect(out).not.toContain('.hidden')
    expect(out).not.toContain('.env')
  })

  it('目标不存在、或目标不是目录 → 抛「目标不是可读文件夹: <abs>」', async () => {
    const base = await makeTempDir()
    const missing = join(base, 'nope')
    expect(await caughtMessage(() => buildFolderSkeleton({
      abs: missing,
      targetKey: 'ws/nope',
      docStem: 'nope',
      layer: '目录',
      generatedAt: '2026-09-10 03:00',
    }))).toBe('目标不是可读文件夹: ' + missing)

    const file = join(base, 'a.txt')
    await writeFile(file, 'x')
    expect(await caughtMessage(() => buildFolderSkeleton({
      abs: file,
      targetKey: 'ws/a.txt',
      docStem: 'a',
      layer: '目录',
      generatedAt: '2026-09-10 03:00',
    }))).toBe('目标不是可读文件夹: ' + file)
  })
})

describe('folder-doc/skeleton — folderPlaceholderLeft', () => {
  it('命中目录树项占位 → 返回 `# <作用>`，且优先于角色占位与一句话占位', () => {
    expect(folderPlaceholderLeft(renderFolderTree('p', [{ name: 'a.js', isFile: true }]))).toBe(FOLDER_TREE_ITEM_PLACEHOLDER)
    expect(folderPlaceholderLeft(
      FOLDER_TREE_ITEM_PLACEHOLDER + FOLDER_DOC_ROLE_PLACEHOLDER + FOLDER_DOC_PLACEHOLDER,
    )).toBe(FOLDER_TREE_ITEM_PLACEHOLDER)
  })

  it('未命中目录树项但命中角色占位 → 返回角色占位串（优先于一句话占位）', () => {
    expect(folderPlaceholderLeft('# t\n\n' + FOLDER_DOC_ROLE_PLACEHOLDER + '\n\n' + FOLDER_DOC_PLACEHOLDER)).toBe(FOLDER_DOC_ROLE_PLACEHOLDER)
  })

  it('只命中一句话占位 → 返回一句话占位串', () => {
    expect(folderPlaceholderLeft('> ' + FOLDER_DOC_PLACEHOLDER + '\n\n（其余都已填）\n')).toBe(FOLDER_DOC_PLACEHOLDER)
  })

  it('三处占位都不在（正常产物）→ 返回空串', () => {
    expect(folderPlaceholderLeft('# src\n\n这个目录负责构建脚本。\n')).toBe('')
  })
})

describe('folder-doc 能力描述符', () => {
  it('描述符字段与默认导出面逐字保留', () => {
    expect(folderDoc.kind).toBe('folder')
    expect(folderDoc.dir).toBe('folder-doc')
    expect(folderDoc.sub).toBe('目录概览')
    expect(folderDoc.arr).toBe('目录层')
    expect(folderDoc.layer).toBe('目录')
    expect(folderDoc.hostIndex).toBe(true)
    expect(folderDoc.scope).toBe('folder')
    expect(folderDoc.promptFile).toBe('prompt.md')
    expect(typeof folderDoc.docStem).toBe('function')
    expect(typeof folderDoc.skeleton).toBe('function')
    expect(typeof folderDoc.verify).toBe('function')
  })

  it('docStem 取目标文件夹名（basename）', () => {
    expect(folderDoc.docStem({ abs: join(tmpdir(), 'proj', 'src') })).toBe('src')
  })

  it('skeleton 走 buildFolderSkeleton（真实临时目录）', async () => {
    const base = await makeTempDir()
    const abs = join(base, 'doc')
    await mkdir(abs)
    await writeFile(join(abs, 'a.js'), 'a')

    const out = await folderDoc.skeleton({
      abs,
      targetKey: 'ws/doc',
      docStem: 'doc',
      layer: '目录',
      generatedAt: '2026-09-10 04:00',
    })
    expect(out).toContain('源码路径: ws/doc')
    expect(out).toContain('└── a.js  # <作用>')
  })

  it('verify：产物不存在（readFile 拒绝回落到空串）→ 抛「产物为空」', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'missing.md')
    expect(await caughtMessage(() => folderDoc.verify({ docAbs }))).toBe('子 agent 已结束但产物为空: ' + docAbs)
  })

  it('verify：产物只有空白 → 抛「产物为空」', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'blank.md')
    await writeFile(docAbs, '\n   \n')
    expect(await caughtMessage(() => folderDoc.verify({ docAbs }))).toBe('子 agent 已结束但产物为空: ' + docAbs)
  })

  it('verify：目录树项占位残留 → 抛「产物仍是骨架」', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'tree.md')
    await writeFile(docAbs, renderFolderTree('p', [{ name: 'a.js', isFile: true }]))
    expect(await caughtMessage(() => folderDoc.verify({ docAbs }))).toBe('子 agent 已结束但产物仍是骨架（语义占位未填写）: ' + docAbs)
  })

  it('verify：角色占位残留 → 抛「产物仍是骨架」', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'role.md')
    await writeFile(docAbs, FOLDER_DOC_ROLE_PLACEHOLDER)
    expect(await caughtMessage(() => folderDoc.verify({ docAbs }))).toBe('子 agent 已结束但产物仍是骨架（语义占位未填写）: ' + docAbs)
  })

  it('verify：一句话占位残留 → 抛「产物仍是骨架」', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'placeholder.md')
    await writeFile(docAbs, FOLDER_DOC_PLACEHOLDER)
    expect(await caughtMessage(() => folderDoc.verify({ docAbs }))).toBe('子 agent 已结束但产物仍是骨架（语义占位未填写）: ' + docAbs)
  })

  it('verify：正常产物（三处占位都填了）→ 通过', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'ok.md')
    await writeFile(docAbs, '# doc\n\n这个目录负责构建脚本。\n')
    await expect(folderDoc.verify({ docAbs })).resolves.toBeUndefined()
  })
})

describe('file-doc/skeleton — renderFileDocSkeleton', () => {
  it('整篇渲染文本逐字一致（frontmatter 三行 + 四章节标题 + 两处占位 + 导出表头）', () => {
    const out = renderFileDocSkeleton({
      relPath: 'ws/src/a.js',
      title: 'a.js',
      layer: '文件',
      generatedAt: '2026-09-10 02:30',
    })
    expect(out).toBe([
      '---',
      '源码路径: ws/src/a.js',
      '层级: 文件',
      '生成时间: 2026-09-10 02:30',
      '---',
      '',
      '# a.js',
      '',
      '**路径**：ws/src/a.js',
      '',
      '> **解决什么问题**：<一句话：这个文件存在的价值，写给不懂项目的人>',
      '',
      '## 核心概念（这个文件只做一件事）',
      '',
      '<一句话主题 + 2-4 句展开；关键术语在这里自然解释，不单独列术语表>',
      '',
      '## 主线走查（按调用/依赖顺序）',
      '',
      '（按依赖顺序逐个写：每个关键导出一小节，写「做什么」与「为什么这么设计」；动机取自 JSDoc/注释，没有就写「推测：…」）',
      '',
      '## 在整体中的位置',
      '',
      '**谁用它（被引用）**：',
      '（grep 实际结果，逐个列出模块名与调用点）',
      '',
      '**它用谁（引用）**：',
      '（本文件 import 的模块及其作用）',
      '',
      '## 导出接口（附录：速查表）',
      '',
      '| 导出 | 类型 | 作用 |',
      '|---|---|---|',
      '',
    ].join('\n'))
  })
})

describe('file-doc/skeleton — filePlaceholderLeft', () => {
  it('命中第 1 条占位 → 返回第 1 条', () => {
    expect(filePlaceholderLeft('> **解决什么问题**：' + FILE_DOC_PLACEHOLDERS[0])).toBe(FILE_DOC_PLACEHOLDERS[0])
  })

  it('第 1 条不在但命中第 2 条 → 返回第 2 条', () => {
    expect(filePlaceholderLeft('# a.js\n\n' + FILE_DOC_PLACEHOLDERS[1] + '\n')).toBe(FILE_DOC_PLACEHOLDERS[1])
  })

  it('两条占位都不在（正常产物）→ 返回空串', () => {
    expect(filePlaceholderLeft('# a.js\n\n这个文件负责解析路径。\n')).toBe('')
  })

  it('两处占位串逐字不变，且不误命中正文里的泛型/JSX', () => {
    expect(FILE_DOC_PLACEHOLDERS).toEqual([
      '<一句话：这个文件存在的价值，写给不懂项目的人>',
      '<一句话主题 + 2-4 句展开；关键术语在这里自然解释，不单独列术语表>',
    ])
    const normal = '导出 `map<T>(xs: T[]): T[]` 与 `<View />` 组件。'
    expect(FILE_DOC_PLACEHOLDERS.some(p => normal.includes(p))).toBe(false)
  })
})

describe('file-doc 能力描述符', () => {
  it('描述符字段与默认导出面逐字保留', () => {
    expect(fileDoc.kind).toBe('file')
    expect(fileDoc.dir).toBe('file-doc')
    expect(fileDoc.sub).toBe('文件摘要')
    expect(fileDoc.arr).toBe('文件层')
    expect(fileDoc.layer).toBe('文件')
    expect(fileDoc.hostIndex).toBe(true)
    expect(fileDoc.scope).toBe('file')
    expect(fileDoc.promptFile).toBe('prompt.md')
    expect(typeof fileDoc.docStem).toBe('function')
    expect(typeof fileDoc.skeleton).toBe('function')
    expect(typeof fileDoc.verify).toBe('function')
  })

  it('docStem 走 computeDocStem 命名规则（父目录路径用 - 连）', () => {
    expect(fileDoc.docStem({ key: 'ws/src/a.js' })).toBe('src-a')
    expect(fileDoc.docStem({ key: 'ws/README.md' })).toBe('ws-README')
  })

  it('skeleton 用 abs 的文件名作标题、targetKey 作源码路径，返回 L2 骨架全文', () => {
    const out = fileDoc.skeleton({
      targetKey: 'ws/src/a.js',
      abs: join(tmpdir(), 'ws', 'src', 'a.js'),
      layer: '文件',
      generatedAt: '2026-09-10 05:00',
    })
    expect(out).toBe(renderFileDocSkeleton({
      relPath: 'ws/src/a.js',
      title: 'a.js',
      layer: '文件',
      generatedAt: '2026-09-10 05:00',
    }))
    expect(out).toContain('源码路径: ws/src/a.js')
    expect(out).toContain('\n# a.js\n')
  })

  it('verify：产物不存在（readFile 拒绝回落到空串）→ 抛「产物为空」', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'missing.md')
    expect(await caughtMessage(() => fileDoc.verify({ docAbs }))).toBe('子 agent 已结束但产物为空: ' + docAbs)
  })

  it('verify：产物只有空白 → 抛「产物为空」', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'blank.md')
    await writeFile(docAbs, '   \n')
    expect(await caughtMessage(() => fileDoc.verify({ docAbs }))).toBe('子 agent 已结束但产物为空: ' + docAbs)
  })

  it('verify：第 1 条占位残留 → 抛「产物仍是骨架」', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'p1.md')
    await writeFile(docAbs, '> **解决什么问题**：' + FILE_DOC_PLACEHOLDERS[0])
    expect(await caughtMessage(() => fileDoc.verify({ docAbs }))).toBe('子 agent 已结束但产物仍是骨架（语义占位未填写）: ' + docAbs)
  })

  it('verify：第 2 条占位残留 → 抛「产物仍是骨架」', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'p2.md')
    await writeFile(docAbs, FILE_DOC_PLACEHOLDERS[1])
    expect(await caughtMessage(() => fileDoc.verify({ docAbs }))).toBe('子 agent 已结束但产物仍是骨架（语义占位未填写）: ' + docAbs)
  })

  it('verify：正常产物（两处占位都填了）→ 通过', async () => {
    const base = await makeTempDir()
    const docAbs = join(base, 'ok.md')
    await writeFile(docAbs, '# a.js\n\n这个文件负责解析路径。\n')
    await expect(fileDoc.verify({ docAbs })).resolves.toBeUndefined()
  })
})
