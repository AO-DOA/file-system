// dsh-plugin-fs — src/host/fs-utils.ts 单元测试。
// 迁移自迁移源 tests/fs-utils.test.js（node:test → vitest），只断言外部可观察行为：
// 路径编码、桶名/层名校验、越权边界、模板渲染、时间戳与台账序号。
// 覆盖口径：本文件按「file 级 行/函数/分支 100%」设计，边缘分支用例集中在各 describe 末尾。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BOOK_REL_LAYERS,
  GEN_CWD_SEG,
  GEN_SCOPE_TOOLS,
  READ_LIMIT,
  bookBucketValid,
  bookDocRelValid,
  booksRoot,
  computeDocStem,
  docRelBook,
  docRelBookIn,
  docRelPath,
  formatStamp,
  genScopeAllow,
  isBookDocRel,
  isBookPath,
  isMdPath,
  legacyBookDir,
  newBookDir,
  nextIssueNo,
  normRel,
  projectKey,
  relToSrcKey,
  renderPromptTemplate,
  resolveIn,
  wsName,
} from '../src/host/fs-utils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

// 截获抛出的错误对象（resolveIn 的 statusCode 只在错误对象上可观察）。
function caughtError(fn: () => unknown): { message: string; statusCode?: number } {
  try {
    fn()
  } catch (err) {
    return err as { message: string; statusCode?: number }
  }
  throw new Error('expected the call to throw')
}

describe('常量契约', () => {
  it('READ_LIMIT / GEN_CWD_SEG / 四层名 / 工具白名单逐字不变', () => {
    expect(READ_LIMIT).toBe(2 * 1024 * 1024)
    expect(GEN_CWD_SEG).toBe('session')
    expect(BOOK_REL_LAYERS).toEqual(['目录概览', '文件摘要', '源码注解', '文章翻译'])
    expect(GEN_SCOPE_TOOLS).toEqual({
      src: ['read', 'write', 'edit'],
      folder: ['read', 'write'],
      file: ['read', 'write', 'glob', 'grep'],
      translate: ['read', 'write', 'edit'],
    })
  })
})

describe('booksRoot / newBookDir / legacyBookDir', () => {
  it('DSH_HOME 有值时书库根为其下 books 目录', () => {
    vi.stubEnv('DSH_HOME', join(tmpdir(), 'dsh-home-test'))
    expect(booksRoot()).toBe(join(tmpdir(), 'dsh-home-test', 'books'))
  })

  it('DSH_HOME 为空时回退 os.homedir()/.dsh/books', () => {
    vi.stubEnv('DSH_HOME', '')
    expect(booksRoot()).toBe(join(homedir(), '.dsh', 'books'))
  })

  it('newBookDir 拼书库根与 projectKey 桶名', () => {
    const home = join(tmpdir(), 'dsh-home-test')
    vi.stubEnv('DSH_HOME', home)
    const root = join(tmpdir(), 'proj')
    expect(newBookDir(root)).toBe(join(home, 'books', '--tmp-proj--'))
  })

  it('legacyBookDir 指向项目根内 .book/<basename>-book', () => {
    const root = join(tmpdir(), 'proj')
    expect(legacyBookDir(root)).toBe(join(root, '.book', 'proj-book'))
  })
})

describe('projectKey', () => {
  it('与 DSH format.ts 对拍：安全字符原样、分隔符折 -、非安全字符转 ~XXXX', () => {
    expect(projectKey('/home/xuepeng/DSH')).toBe('--home-xuepeng-DSH--')
    expect(projectKey('/home/xuepeng/DSHworkPace')).toBe('--home-xuepeng-DSHworkPace--')
    expect(projectKey('/home/xuepeng/源码志')).toBe('--home-xuepeng-~6E90~7801~5FD7--')
  })

  it('连续分隔符（/ \\ : 三类）只折一个连字符', () => {
    expect(projectKey('C:\\a:b')).toBe('--C-a-b--')
    expect(projectKey('/a//b')).toBe('--a-b--')
  })

  it('~ 自身不在安全字符集，转义为 ~007E（含前导零补位）', () => {
    expect(projectKey('/a~b')).toBe('--a~007Eb--')
    expect(projectKey('/é')).toBe('--~00E9--')
  })

  it('全分隔符输入时 slug 回退 root', () => {
    expect(projectKey('/')).toBe('--root--')
    expect(projectKey('///')).toBe('--root--')
  })

  it('slug 段截断到 251 字符并用 -- 包裹', () => {
    const key = projectKey('/' + 'a'.repeat(300))
    expect(key).toBe('--' + 'a'.repeat(251) + '--')
    expect(key).toHaveLength(255)
  })

  it('空串与 null/undefined 输入抛 cannot encode an empty project path', () => {
    expect(() => projectKey('')).toThrow('cannot encode an empty project path')
    expect(() => projectKey(null)).toThrow('cannot encode an empty project path')
    expect(() => projectKey(undefined)).toThrow('cannot encode an empty project path')
  })
})

describe('normRel / wsName / relToSrcKey', () => {
  it('normRel 去 ./、去首尾 /，空值返回空串', () => {
    expect(normRel('./src/index.js')).toBe('src/index.js')
    expect(normRel('/src/index.js/')).toBe('src/index.js')
    expect(normRel('.')).toBe('.')
    expect(normRel('')).toBe('')
    expect(normRel(null)).toBe('')
    expect(normRel(undefined)).toBe('')
  })

  it('wsName 取 root 末段目录名', () => {
    expect(wsName(join(tmpdir(), 'demo-workspace'))).toBe('demo-workspace')
    expect(wsName('/a/b/')).toBe('b')
  })

  it('relToSrcKey 根节点回退工作区名，子路径加工作区名前缀', () => {
    const root = join(tmpdir(), 'demo-workspace')
    expect(relToSrcKey('.', root)).toBe('demo-workspace')
    expect(relToSrcKey('', root)).toBe('demo-workspace')
    expect(relToSrcKey('demo-workspace', root)).toBe('demo-workspace')
    expect(relToSrcKey('src/index.js', root)).toBe('demo-workspace/src/index.js')
    expect(relToSrcKey('./src/index.js', root)).toBe('demo-workspace/src/index.js')
  })
})

describe('computeDocStem', () => {
  it('顶层文件用工作区名做前缀', () => {
    expect(computeDocStem('demo-workspace/README.md')).toBe('demo-workspace-README')
    expect(computeDocStem('demo-workspace/LICENSE')).toBe('demo-workspace-LICENSE')
  })

  it('多层文件用父目录路径连字符前缀，扩展名不区分大小写', () => {
    expect(computeDocStem('demo-workspace/src/client/index.js')).toBe('src-client-index')
    expect(computeDocStem('demo-workspace/a/b/App.TSX')).toBe('a-b-App')
  })

  it('.d.ts 与白名单外扩展名的处理', () => {
    expect(computeDocStem('ws/types/index.d.ts')).toBe('types-index')
    expect(computeDocStem('ws/a.txt')).toBe('ws-a.txt')
    expect(computeDocStem('ws/note.markdown')).toBe('ws-note')
  })

  it('空串与 null 输入保持源语义（parts 为空 → undefined-）', () => {
    expect(computeDocStem('')).toBe('undefined-')
    expect(computeDocStem(null)).toBe('undefined-')
  })
})

describe('docRelBook / docRelBookIn / docRelPath', () => {
  it('docRelBook 输出 <层名>/<stem>.md', () => {
    expect(docRelBook('目录概览', 'src')).toBe('目录概览/src.md')
    expect(docRelBook('文章翻译', 'ws-README')).toBe('文章翻译/ws-README.md')
  })

  it('docRelBookIn 输出 @<桶名>/<层名>/<stem>.md', () => {
    const bucket = projectKey('/home/xuepeng/DSHworkPace')
    expect(docRelBookIn(bucket, '目录概览', 'src')).toBe('@' + bucket + '/目录概览/src.md')
  })

  it('docRelPath 忽略 root 参数并与 docRelBook 一致', () => {
    const root = join(tmpdir(), 'proj')
    expect(docRelPath(root, '目录概览', 'src')).toBe('目录概览/src.md')
    expect(docRelPath(root, '文件摘要', 'src-index-js')).toBe(docRelBook('文件摘要', 'src-index-js'))
    expect(docRelPath('', '源码注解', 'a-b-c')).toBe('源码注解/a-b-c.md')
  })
})

describe('bookBucketValid', () => {
  it('projectKey 字符集内的桶名放行（含 ~ 转义）', () => {
    expect(bookBucketValid('--home-xuepeng-DSH--')).toBe(true)
    expect(bookBucketValid('--home-xuepeng-~6E90--')).toBe(true)
  })

  it('null / undefined / 空串一律不合法', () => {
    expect(bookBucketValid(null)).toBe(false)
    expect(bookBucketValid(undefined)).toBe(false)
    expect(bookBucketValid('')).toBe(false)
  })

  it('恰为 .. 或含 .. 的桶名不合法（防穿越）', () => {
    expect(bookBucketValid('..')).toBe(false)
    expect(bookBucketValid('--a..b--')).toBe(false)
  })

  it('含路径分隔符或其它非法字符的桶名不合法', () => {
    expect(bookBucketValid('a/b')).toBe(false)
    expect(bookBucketValid('a b')).toBe(false)
  })
})

describe('bookDocRelValid / isBookDocRel', () => {
  it('两层式：四层名之一 + .md/.markdown 结尾放行', () => {
    expect(bookDocRelValid('目录概览/src.md')).toBe(true)
    expect(bookDocRelValid('文件摘要/src-index-js.md')).toBe(true)
    expect(bookDocRelValid('源码注解/a.md')).toBe(true)
    expect(bookDocRelValid('文章翻译/a.markdown')).toBe(true)
  })

  it('两层式：非四层名开头或扩展名不符一律拒绝', () => {
    expect(bookDocRelValid('README.md')).toBe(false)
    expect(bookDocRelValid('其他层/a.md')).toBe(false)
    expect(bookDocRelValid('目录概览/README.txt')).toBe(false)
    expect(bookDocRelValid('目录概览.md')).toBe(false)
    expect(bookDocRelValid('.book/文章翻译/a.md')).toBe(false)
  })

  it('三层式：@桶名 + 合法层名放行', () => {
    const bucket = projectKey('/home/xuepeng/DSHworkPace')
    expect(bookDocRelValid('@' + bucket + '/目录概览/src.md')).toBe(true)
    expect(bookDocRelValid('@' + bucket + '/文件摘要/src-a.md')).toBe(true)
  })

  it('三层式：不以 @ 开头、桶名非法、层名非白名单一律拒绝', () => {
    const bucket = projectKey('/home/xuepeng/DSHworkPace')
    expect(bookDocRelValid('bucket/目录概览/src.md')).toBe(false)
    expect(bookDocRelValid('@../目录概览/a.md')).toBe(false)
    expect(bookDocRelValid('@/目录概览/a.md')).toBe(false)
    expect(bookDocRelValid('@' + bucket + '/其他层/a.md')).toBe(false)
    expect(bookDocRelValid('@' + bucket + '/目录概览/a.txt')).toBe(false)
    expect(bookDocRelValid('@--a-b--/../../etc/passwd.md')).toBe(false)
  })

  it('null / undefined / 空串输入不合法', () => {
    expect(bookDocRelValid(null)).toBe(false)
    expect(bookDocRelValid(undefined)).toBe(false)
    expect(bookDocRelValid('')).toBe(false)
  })

  it('isBookDocRel 与 bookDocRelValid 同语义', () => {
    expect(isBookDocRel('目录概览/src.md')).toBe(true)
    expect(isBookDocRel('README.md')).toBe(false)
    expect(isBookDocRel(null)).toBe(false)
  })
})

describe('isMdPath / isBookPath', () => {
  it('isMdPath 识别 md/markdown 且大小写不敏感', () => {
    expect(isMdPath('README.md')).toBe(true)
    expect(isMdPath('README.MD')).toBe(true)
    expect(isMdPath('README.markdown')).toBe(true)
  })

  it('isMdPath 对非 md 扩展名与空值返回 false', () => {
    expect(isMdPath('index.js')).toBe(false)
    expect(isMdPath('')).toBe(false)
    expect(isMdPath(null)).toBe(false)
    expect(isMdPath('.md')).toBe(false)
  })

  it('isBookPath 识别 .book 与其下路径', () => {
    expect(isBookPath('.book/proj-book/文章翻译/README.md')).toBe(true)
    expect(isBookPath('.book')).toBe(true)
    expect(isBookPath('./.book/x.md')).toBe(true)
  })

  it('isBookPath 对项目内普通路径与空值返回 false', () => {
    expect(isBookPath('README.md')).toBe(false)
    expect(isBookPath('src/docs/guide.md')).toBe(false)
    expect(isBookPath('.bookx')).toBe(false)
    expect(isBookPath('')).toBe(false)
  })
})

describe('resolveIn', () => {
  it('允许 root 内路径', () => {
    const root = join(tmpdir(), 'safe-root')
    expect(resolveIn(root, 'src/index.js')).toBe(join(root, 'src/index.js'))
  })

  it('允许 root 自身（pathArg 为 . / 缺省 / null / 空串）', () => {
    const root = join(tmpdir(), 'self-root')
    expect(resolveIn(root, '.')).toBe(root)
    expect(resolveIn(root)).toBe(root)
    expect(resolveIn(root, null)).toBe(root)
    expect(resolveIn(root, '')).toBe(root)
  })

  it('../ 越权抛错且 statusCode = 400', () => {
    const root = join(tmpdir(), 'safe-root')
    const err = caughtError(() => resolveIn(root, '../outside'))
    expect(err.message).toBe('path escapes workspace root')
    expect(err.statusCode).toBe(400)
  })

  it('绝对路径越权被拒', () => {
    const root = join(tmpdir(), 'safe-root')
    expect(() => resolveIn(root, join(tmpdir(), 'elsewhere'))).toThrow('path escapes workspace root')
  })

  it('前缀同名目录（safe-root-evil）不被放行', () => {
    const root = join(tmpdir(), 'safe-root')
    const evil = join(tmpdir(), 'safe-root-evil')
    expect(() => resolveIn(root, evil)).toThrow('path escapes workspace root')
  })

  it('win32 平台走反斜杠分隔符分支：root 自身放行、越权仍抛错', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const root = '/win/root'
    expect(resolveIn(root, '.')).toBe(root)
    expect(resolveIn(root, null)).toBe(root)
    expect(() => resolveIn(root, '..\\outside')).toThrow('path escapes workspace root')
  })
})

describe('genScopeAllow', () => {
  it('未提供可用集合时直给期望白名单（返回副本，不暴露内部数组）', () => {
    const allow = genScopeAllow('src')
    expect(allow).toEqual(['read', 'write', 'edit'])
    allow.push('bash')
    expect(genScopeAllow('src')).toEqual(['read', 'write', 'edit'])
  })

  it('未知 kind 返回空数组', () => {
    expect(genScopeAllow('no-such-kind')).toEqual([])
    expect(genScopeAllow('no-such-kind', ['read'])).toEqual([])
  })

  it('提供可用集合时取交集（保序、去掉不可用项）', () => {
    expect(genScopeAllow('file', ['glob', 'read'])).toEqual(['read', 'glob'])
    expect(genScopeAllow('translate', ['write'])).toEqual(['write'])
    expect(genScopeAllow('src', [])).toEqual([])
  })
})

describe('renderPromptTemplate', () => {
  it('替换已知 ${name} 占位符', () => {
    expect(renderPromptTemplate('路径 ${rel} 层 ${layer}', { rel: 'a.md', layer: 'L2' }))
      .toBe('路径 a.md 层 L2')
    expect(renderPromptTemplate('无占位符', { rel: 'a.md' })).toBe('无占位符')
  })

  it('数字值按字符串插入', () => {
    expect(renderPromptTemplate('共 ${n} 行', { n: 12 })).toBe('共 12 行')
  })

  it('vars 缺省时占位符原样保留', () => {
    expect(renderPromptTemplate('${rel}')).toBe('${rel}')
  })

  it('值为 undefined / null 时占位符原样保留', () => {
    expect(renderPromptTemplate('${a}-${b}', { a: undefined, b: null })).toBe('${a}-${b}')
  })

  it('未知占位符名原样保留', () => {
    expect(renderPromptTemplate('${known}-${unknown}', { known: 'K' })).toBe('K-${unknown}')
  })

  it('{{name}} 不是本函数语法，原样保留', () => {
    expect(renderPromptTemplate('{{name}} 与 ${name}', { name: 'X' })).toBe('{{name}} 与 X')
  })
})

describe('formatStamp', () => {
  it('传入 Date 时按本地时区格式化并两位补零', () => {
    expect(formatStamp(new Date(2026, 0, 5, 3, 7))).toBe('2026-01-05 03:07')
    expect(formatStamp(new Date(2026, 10, 25, 23, 59))).toBe('2026-11-25 23:59')
  })

  it('不传参数时取当前时间，形状为 YYYY-MM-DD HH:mm', () => {
    expect(formatStamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})

describe('nextIssueNo', () => {
  it('取最大序号 +1 并两位补零', () => {
    const names = [
      'README.md',
      '_template.md',
      '2026-09-07-09-translate-doc-frontmatter-not-generated.md',
      '2026-09-08-11-session-finder-v2-log-filename.md',
    ]
    expect(nextIssueNo(names)).toBe('12')
  })

  it('无既有台账时从 01 起（含 fileNames 缺省 / null）', () => {
    expect(nextIssueNo([])).toBe('01')
    expect(nextIssueNo(['README.md', '_template.md'])).toBe('01')
    expect(nextIssueNo(undefined)).toBe('01')
    expect(nextIssueNo(null)).toBe('01')
  })

  it('序号小于当前最大值时不回退', () => {
    expect(nextIssueNo(['2026-09-08-11-a.md', '2026-09-07-05-b.md'])).toBe('12')
  })

  it('序号超出 Number 精度（Infinity）时被忽略', () => {
    expect(nextIssueNo(['2026-09-07-' + '9'.repeat(400) + '-x.md'])).toBe('01')
  })
})
