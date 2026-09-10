// 问题台账（issues/）：子 agent 自记，宿主兜底维护索引表。
// 台账目录 = 插件根/issues。翻译子 agent 工具面只有 read/write，既列不了目录取号、
// 也改不动索引表，故由宿主算好序号下发、收尾时补索引行。
//
// 导入形态说明：node:fs 的**具名导出**是 ESM 命名空间上的只读绑定（模块加载时快照，
// 外部无法注入），而 default 导出就是 CJS 的 module.exports（属性可写）。这里走 default
// 导入是为了让「包根没有 issues 目录」这条分支在单元测试中可达——本仓 vitest 不把被测试
// 模块对 node:fs 的导入交给 mock 表（实测：vi.mock / vi.doMock 的工厂从未被调用，
// 只有从模块对象侧改属性才生效，如 fs.promises）。两者是同一个函数对象，行为逐字等价。
import { promises as fsp } from 'node:fs'
import nodeFs from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nextIssueNo } from './fs-utils.ts'

const HERE: string = dirname(fileURLToPath(import.meta.url))

// 台账目录 = 插件根/issues，按本文件位置推导，不依赖提示词目录缓存（两个模块各自独立）。
// rootDir 上提后源码形态（src/host/）与产物形态（lib/host/）深度一致，故只剩一条候选：
// resolve(HERE, '../../issues') 在两种形态下都落在插件根/issues。
// DSH_FS_ISSUES_DIR 显式指定时优先于上述推导：测试把台账指向临时目录，收尾的 syncIssueIndex
// （read-modify-write）就不会改写受版本控制的 issues/README.md；部署也可据此把台账移出插件根。
// 未设该变量时，解析结果与推导路径逐字相同——生产行为不变。
// 目录不存在时返回 ''，调用方据此跳过台账相关步骤。
export function issuesDir(): string {
  const override: string | undefined = process.env.DSH_FS_ISSUES_DIR
  if (override) return resolve(override)
  const dir: string = resolve(HERE, '../../issues')
  if (nodeFs.existsSync(dir)) return dir
  return ''
}

// 下一个台账序号：目录不存在（或读不了）时从 '01' 起。
export async function nextIssueNoFromDisk(): Promise<string> {
  const dir: string = issuesDir()
  if (!dir) return '01'
  const names: string[] = await fsp.readdir(dir).catch((): string[] => [])
  return nextIssueNo(names)
}

// 索引表补齐：issues/README.md 约定「文件是权威、索引是视图」。子 agent 用 write 整篇
// 覆盖 README 风险高（可能截断既有内容），故这一步交给宿主：只追加 README 里还没有的行。
export async function syncIssueIndex(): Promise<void> {
  const dir: string = issuesDir()
  if (!dir) return
  const readmeAbs: string = join(dir, 'README.md')
  const readme: string | null = await fsp.readFile(readmeAbs, 'utf8').catch((): null => null)
  if (!readme) return
  const names: string[] = (await fsp.readdir(dir).catch((): string[] => []))
    .filter((n: string): boolean => /^\d{4}-\d{2}-\d{2}-\d+-.+\.md$/.test(n))
  const missing: string[] = names.filter((n: string): boolean => !readme.includes(n)).sort()
  if (missing.length === 0) return
  const rows: string[] = []
  for (const n of missing) {
    const text: string = await fsp.readFile(join(dir, n), 'utf8').catch((): string => '')
    const pick = (re: RegExp, dflt: string): string => {
      const m: RegExpExecArray | null = re.exec(text)
      return m && m[1] ? m[1].trim() : dflt
    }
    rows.push('| ' + n.slice(0, 10) +
      ' | ' + pick(/^#\s+(.+)$/m, n.replace(/\.md$/, '')) +
      ' | ' + pick(/^skill:\s*(.+)$/m, 'translate-doc') +
      ' | ' + pick(/^type:\s*(.+)$/m, '') +
      ' | ' + pick(/^status:\s*(.+)$/m, '问题提交') +
      ' | ' + pick(/^recurrence:\s*(.+)$/m, '1') +
      ' | [' + n.replace(/\.md$/, '') + '](' + n + ') |')
  }
  await fsp.writeFile(readmeAbs, readme.replace(/\s*$/, '\n') + rows.join('\n') + '\n', 'utf8')
}
