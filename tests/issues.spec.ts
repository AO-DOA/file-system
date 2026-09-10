// 问题台账（src/host/issues.ts）单元测试。
//
// 迁移自迁移源 tests/issues.test.js（node:test → vitest），并把分支口径补到 100%：
//   · 台账目录的推导——环境变量覆盖 / 包根 issues 存在 / 包根没有 issues 目录（返回空串）；
//   · syncIssueIndex 读-改-写的四条早退路径（无目录 / 无 README / 无匹配文件 / 无缺失行）
//     与五个字段的「正则命中」与「回退默认值」两条取值路径。
//
// 台账目录默认按本文件位置推导到插件根/issues，而 syncIssueIndex() 是 read-modify-write：
// 生成/翻译任务收尾都会调用它，测试用例因此会走到，一旦 issues/ 里出现未登记索引的台账文件
// 就会改写受版本控制的 issues/README.md。故每个写用例都把 DSH_FS_ISSUES_DIR 指向临时目录，
// 并在 afterEach 统一断言工作树文件既没改内容、也没被重写（mtime 变化同样算污染）。
//
// 「包根没有 issues 目录」这条分支在本仓无法自然构造（仓库里就有 issues/），而 vitest 不把
// 被测试模块对 node:fs 的导入交给 mock 表（实测：vi.mock / vi.doMock 的工厂从未被调用）。
// 故改从模块对象侧注入：node:fs 的 default 导出就是 CJS 的 module.exports，其 existsSync
// 属性可写，且与 issues.ts 用的是同一个对象；注入范围被限制成「只否认包根 issues 这一个路径」，
// 其余路径透传真实实现。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import nodeFs, { promises as fsp, readFileSync, statSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { issuesDir, nextIssueNoFromDisk, syncIssueIndex } from '../src/host/issues'

// Vitest resolves `import.meta.url` to a non-file URL in the spec files, so the
// repository root comes from process.cwd() (the same device real-composition.spec.ts
// uses). The module under test keeps the real file: URL — its own top-level
// dirname(fileURLToPath(import.meta.url)) would throw otherwise.
const REPO_ROOT = process.cwd()

// 受版本控制的真台账：以下每个用例都必须证明它一个字节都没变。
const REPO_README = join(REPO_ROOT, 'issues', 'README.md')
const REPO_ISSUES_DIR = join(REPO_ROOT, 'issues')

const repoReadmeBefore = readFileSync(REPO_README, 'utf8')
const repoReadmeMtimeBefore = statSync(REPO_README).mtimeMs

/** 让包根 issues 目录「不存在」，返回恢复函数。 */
function hideRepoIssuesDir(): () => void {
  // 形参沿用 existsSync 自身的参数类型：写 unknown 会因参数逆变不兼容而无法赋回
  // nodeFs.existsSync（TS2322）；本函数只做 String(p) 的比较与转交，无需放宽类型。
  const orig: typeof nodeFs.existsSync = nodeFs.existsSync
  nodeFs.existsSync = (p: Parameters<typeof nodeFs.existsSync>[0]): boolean =>
    resolve(String(p)) !== REPO_ISSUES_DIR && orig(p)
  return (): void => { nodeFs.existsSync = orig }
}

let tmpRoot = ''

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'dsh-fs-issues-'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  // 工作树的受版本控制文件既没改内容、也没被重写。
  expect(readFileSync(REPO_README, 'utf8')).toBe(repoReadmeBefore)
  expect(statSync(REPO_README).mtimeMs).toBe(repoReadmeMtimeBefore)
})

describe('issuesDir', () => {
  it('DSH_FS_ISSUES_DIR 显式指定时优先（台账隔离靠它）', () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)
    expect(issuesDir()).toBe(tmpRoot)
  })

  it('覆盖值经 resolve 规范化（相对成分被折叠）', () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', join(tmpRoot, 'a', '..', 'b'))
    expect(issuesDir()).toBe(join(tmpRoot, 'b'))
  })

  it('未设覆盖变量时落到插件根 issues（源码与产物形态深度一致）', () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', undefined)
    expect(issuesDir()).toBe(REPO_ISSUES_DIR)
  })

  it('空串覆盖值等同未设（不把空路径当目录）', () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', '')
    expect(issuesDir()).toBe(REPO_ISSUES_DIR)
  })

  it('包根没有 issues 目录时返回空串（调用方据此跳过台账步骤）', () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', undefined)
    const restore = hideRepoIssuesDir()
    try {
      expect(issuesDir()).toBe('')
    } finally {
      restore()
    }
    expect(issuesDir()).toBe(REPO_ISSUES_DIR)
  })
})

describe('nextIssueNoFromDisk', () => {
  it('空台账目录从 01 起（读的是隔离目录，不是插件根）', async () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)
    expect(await nextIssueNoFromDisk()).toBe('01')
  })

  it('已有台账文件时按文件名序号顺延', async () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)
    await writeFile(join(tmpRoot, '2026-01-01-1-样例问题.md'), '# 样例问题\n', 'utf8')
    expect(await nextIssueNoFromDisk()).toBe('02')
  })

  it('台账目录不存在（readdir 抛错）时同样从 01 起', async () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', join(tmpRoot, 'no-such-dir'))
    expect(await nextIssueNoFromDisk()).toBe('01')
  })

  it('台账目录解析为空串时直接返回 01，不触碰文件系统', async () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', undefined)
    const restore = hideRepoIssuesDir()
    try {
      expect(await nextIssueNoFromDisk()).toBe('01')
    } finally {
      restore()
    }
  })
})

describe('syncIssueIndex', () => {
  it('台账目录解析为空串时直接返回（不抛、不创建任何文件）', async () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', undefined)
    const restore = hideRepoIssuesDir()
    try {
      await expect(syncIssueIndex()).resolves.toBeUndefined()
    } finally {
      restore()
    }
  })

  it('隔离目录没有 README.md 时直接返回，不凭空创建索引表', async () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)
    await writeFile(join(tmpRoot, '2026-01-01-1-样例问题.md'), '# 样例问题\n', 'utf8')
    await syncIssueIndex()
    await expect(stat(join(tmpRoot, 'README.md'))).rejects.toThrow()
  })

  it('目录里没有台账文件时 README 逐字不变', async () => {
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)
    const readme = '| 日期 | 标题 | skill | 类型 | 状态 | 次数 | 文件 |\n'
    await writeFile(join(tmpRoot, 'README.md'), readme, 'utf8')
    await writeFile(join(tmpRoot, '_template.md'), '# 模板\n', 'utf8')
    await writeFile(join(tmpRoot, '2026-01-01-无序号后缀.md'), '# 未取号\n', 'utf8')
    await syncIssueIndex()
    expect(await readFile(join(tmpRoot, 'README.md'), 'utf8')).toBe(readme)
  })

  it('未登记索引的台账文件补进隔离目录的 README（五字段取自 frontmatter）', async () => {
    const name = '2026-01-01-1-样例问题.md'
    await writeFile(join(tmpRoot, name), [
      '# 样例问题',
      'skill: translate-doc',
      'type: 缺陷',
      'status: 问题提交',
      'recurrence: 1',
      '',
    ].join('\n'), 'utf8')
    await writeFile(join(tmpRoot, 'README.md'), '| 日期 | 标题 | skill | 类型 | 状态 | 次数 | 文件 |\n', 'utf8')
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)

    await syncIssueIndex()

    const readme = await readFile(join(tmpRoot, 'README.md'), 'utf8')
    expect(readme).toContain('| 2026-01-01 | 样例问题 | translate-doc | 缺陷 | 问题提交 | 1 |')
    expect(readme).toContain('[' + name.replace(/\.md$/, '') + '](' + name + ')')
  })

  it('缺失的 frontmatter 字段回退默认值，标题行两侧空白被 trim', async () => {
    const name = '2026-02-03-7-缺字段的台账.md'
    // 只有一级标题（且两侧带空白），其余 frontmatter 键全缺 → 全部走默认值分支。
    await writeFile(join(tmpRoot, name), '#   带空白的标题   \n正文\n', 'utf8')
    await writeFile(join(tmpRoot, 'README.md'), '| 日期 | 标题 | skill | 类型 | 状态 | 次数 | 文件 |\n', 'utf8')
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)

    await syncIssueIndex()

    const readme = await readFile(join(tmpRoot, 'README.md'), 'utf8')
    expect(readme).toContain('| 2026-02-03 | 带空白的标题 | translate-doc |  | 问题提交 | 1 |')
  })

  it('台账文件读不出来（同名目录）时按空文本处理，全部回退默认值', async () => {
    const name = '2026-03-04-9-读不到的台账.md'
    await mkdir(join(tmpRoot, name))
    await writeFile(join(tmpRoot, 'README.md'), '| 日期 | 标题 | skill | 类型 | 状态 | 次数 | 文件 |\n', 'utf8')
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)

    await syncIssueIndex()

    const readme = await readFile(join(tmpRoot, 'README.md'), 'utf8')
    expect(readme).toContain('| 2026-03-04 | 2026-03-04-9-读不到的台账 | translate-doc |  | 问题提交 | 1 |')
  })

  it('多个缺失行按文件名排序追加，且以换行收尾', async () => {
    await writeFile(join(tmpRoot, '2026-01-02-2-b.md'), '# B\n', 'utf8')
    await writeFile(join(tmpRoot, '2026-01-01-1-a.md'), '# A\n', 'utf8')
    await writeFile(join(tmpRoot, 'README.md'), '| 日期 | 标题 | skill | 类型 | 状态 | 次数 | 文件 |\n', 'utf8')
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)

    await syncIssueIndex()

    const readme = await readFile(join(tmpRoot, 'README.md'), 'utf8')
    expect(readme.indexOf('| A |')).toBeLessThan(readme.indexOf('| B |'))
    expect(readme.endsWith('\n')).toBe(true)
  })

  it('索引已存在时不重复追加（幂等）', async () => {
    const name = '2026-04-05-3-幂等样例.md'
    await writeFile(join(tmpRoot, name), '# 幂等样例\n', 'utf8')
    await writeFile(join(tmpRoot, 'README.md'), '| 日期 | 标题 | skill | 类型 | 状态 | 次数 | 文件 |\n', 'utf8')
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)

    await syncIssueIndex()
    const first = await readFile(join(tmpRoot, 'README.md'), 'utf8')
    await syncIssueIndex()
    expect(await readFile(join(tmpRoot, 'README.md'), 'utf8')).toBe(first)
    // 索引行只追加了一次（标题 + 链接文字 + 链接目标共 3 处出现）。
    expect(first.match(/幂等样例/g)?.length).toBe(3)
  })

  it('目录列不出来（readdir 抛错）时视为无台账文件，不抛', async () => {
    await writeFile(join(tmpRoot, 'README.md'), '| 日期 | 标题 | skill | 类型 | 状态 | 次数 | 文件 |\n', 'utf8')
    vi.stubEnv('DSH_FS_ISSUES_DIR', tmpRoot)
    vi.spyOn(fsp, 'readdir').mockRejectedValue(new Error('EACCES'))

    await expect(syncIssueIndex()).resolves.toBeUndefined()

    const readme = await readFile(join(tmpRoot, 'README.md'), 'utf8')
    expect(readme).toBe('| 日期 | 标题 | skill | 类型 | 状态 | 次数 | 文件 |\n')
  })
})
