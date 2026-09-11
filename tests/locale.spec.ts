// dsh-plugin-fs — 产品文案字典（src/shared/locale.ts）单元测试。
// 只断言外部行为：字典内容（键与文案逐字）、LANG 注册表、t() 的取值/回退/缺键语义。
// 迁移自迁移源 tests/client-md-utils.test.js 的「locale 字典契约」段，并把 72 键扩为全量对照；
// 后续按批次新增的 host 错误串键（第 1 批 A 类 12 键、第 2 批 B 类 10 键、第 3 批 C 类 23 键）
// 同步登记在此表，键序与 ZH 逐位一致。
// R1/R3 段（顶栏收编 + 视图选择器）的键变动同样登记在此：新增 a11yViewPick（视图选择器 title）、
// 删除随独立翻译按钮一并失效的三个 a11yTr* 键（New/Regen/Loading）、改写三个值
// （btnGen「生成解读」→「解读选择」、a11yGen 补「文章翻译」、folderCardDesc2 跟随按钮改名）。
// R4 段（分栏）的键变动同样登记在此：新增 btnSplit（「分栏」，与规格 §2 例外里那个字形同源）
// 与 a11ySplit（气泡文案），键数由 115 增至 117。
// 2026-09-12 术语裁决：全产品中文表述统一为「分栏」（原「分屏」废止），本表只跟值
// —— `a11ySplit` 由 30 字的整句说明收成「分栏：右侧只读副本」；键名是英文中性词，不动。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { LANG, ZH, t } from '../src/shared/locale'

// 迁移源 src/shared/locale.js:5-90 的全量键值对照表（迁移源 72 键逐字抄录 + 第 1 批 A 类 12 键
// + 第 2 批 B 类 10 键 + 第 3 批 C 类 23 键）。
// 任何键名/文案漂移都会让 toEqual 失败——这是「文案字典不可擅改」的机器护栏。
const EXPECTED_ZH: Record<string, string> = {
  // 槽位/页签
  slotLabel: '文件',
  // 查看模式页签（labLabelKey 的 key → 文案映射）
  labDocDir: '目录概览',
  labDocFile: '文件摘要',
  labAnnot: '源码注解',
  labTr: '文章翻译',
  labSrc: '源码',
  // MarkdownText 内置按钮/脚注标签
  mdCopy: '复制',
  mdCopied: '已复制',
  mdFootnotes: '脚注',
  // 通用状态
  loading: '加载中...',
  emptyFile: '（空文件）',
  emptyDir: '空目录',
  frontmatter: 'frontmatter',
  // a11y title / 提示
  a11yDocDir: '含目录概览',
  a11yDocFiles: '含文件摘要/源码注解/文章翻译',
  a11yDirty: '● 未保存',
  a11yExpandTree: '展开文件树',
  a11yCollapseTree: '折叠文件树',
  a11yRefresh: '刷新',
  a11yGen: '生成/重新生成：目录概览·文件摘要·源码注解·文章翻译',
  // 视图选择器（R3）：按钮文字即当前视图名，title 只说明悬停交互。
  a11yViewPick: '视图选择：悬停展开其它视图',
  // 按钮
  btnGen: '解读选择',
  btnEdit: '编辑',
  btnView: '查看',
  btnSave: '保存',
  // 分栏（R4）：可见文字沿用宿主 `dock.splitPane` 的「分栏」；气泡文案只有「功能名 + 一句极短限定」
  // （原先那句 30 字的整句说明会把气泡撑成一条横在按钮下方、压住正文，用户截图反馈）。
  btnSplit: '分栏',
  a11ySplit: '分栏：右侧只读副本',
  // 翻译（R1：原独立翻译按钮并入「解读选择」菜单，这三项现在由菜单项复用）
  btnTr: '翻译',
  btnTrRegen: '重新翻译',
  btnTrLoading: '翻译中…',
  pickWs: '选择工作区',
  // 生成菜单项
  genFolder: '生成目录概览',
  genFolderRegen: '重新生成目录概览',
  genFile: '生成文件摘要',
  genFileRegen: '重新生成文件摘要',
  genSrc: '生成源码注解',
  genSrcRegen: '重新生成源码注解',
  // 占位卡（文件夹无目录概览）
  rootDirName: '工作区根目录',
  folderCardTitle: '创建本目录的目录概览',
  folderCardDesc1: '用目录概览技能(folder-doc)生成该目录的概览说明，便于快速了解其结构、边界与上下游（目录层/L1）。',
  folderCardDesc2: '点击右上角「解读选择」，在下拉中选择「目录概览」。',
  pathSep: ' · ',
  wsItemSep: '  ·  ',
  // 生成/读取中
  genFolderBusy: '正在生成目录概览…',
  genFileBusy: '正在生成文件摘要（L2）…',
  genSrcBusy: '正在生成源码注解（L3）…',
  // 状态/错误串（前缀式，调用方拼接详情）
  okSaved: '已保存',
  okTrDone: '翻译完成',
  errReadFail: '读取失败: ',
  errLoadFail: '加载失败: ',
  errRestoreFail: '恢复失败: ',
  errSaveFail: '保存失败: ',
  errGenFail: '生成失败',
  errGenFailWith: '生成失败: ',
  errGenNoTaskId: '生成失败：未返回任务 id',
  errGenTaskGone: '生成任务不存在：',
  errGenNoDocRel: '生成完成，但未返回文档路径',
  errGenReadFail: '生成完成，但读取文档失败: ',
  errTrFail: '翻译失败: ',
  errTrNoTaskId: '翻译失败：未返回任务 id',
  errTrNoDocRel: '翻译完成，但未返回文档路径',
  errTrReadFail: '翻译完成，但读取译文失败: ',
  errPollTimeout: '任务状态轮询超时，请稍后刷新任务状态',
  // host 错误串（U3 host 侧直取；wire 展示原文案不变）
  errGenMd: 'markdown 文档不需要生成文件层文档/源码注解',
  errTranslateOnlyMd: '仅支持 Markdown 文档翻译',
  errBookNoTranslate: '书库内文档不参与翻译',
  errTargetMissing: '目标不存在（路径需相对当前工作区根）',
  errTargetNotDir: '目录概览只能对文件夹生成（当前目标是文件）',
  errTargetNotFile: '文件摘要/源码注解只能对文件生成（当前目标是文件夹）',
  errTaskTimeout: '生成/翻译任务超时未完成，请重试',
  // host 错误串 · 第 1 批 A 类（文案逐字沿用原字面量；含变量的串按前缀/续段分键）
  errNotAFile: 'not a file',
  errNotAFileWith: 'not a file: ',
  errFileTooLarge: 'file too large: ',
  errFileTooLargeMid: ' bytes (limit ',
  errFileTooLargeClose: ')',
  errTaskNotFound: 'task not found',
  errSrcMissing: '源文档不存在: ',
  errSrcTooLarge: '源文档过大（> ',
  errSrcTooLargeEnd: ' 字节）',
  errSrcAlreadyZh: '源文档已是简体中文，无需翻译: ',
  errUnreadableFile: '目标不是可读文件: ',
  errUnreadableDir: '目标不是可读文件夹: ',
  // host 错误串 · 第 2 批 B 类（协议/安全/防御；文案逐字沿用原字面量）
  errBodyTooLarge: 'body too large',
  errInvalidJsonBody: 'invalid json body',
  errNotADirectoryWith: 'not a directory: ',
  errPathRequired: 'path required',
  errRefuseDeleteRoot: 'refusing to delete the workspace root',
  errUnknownGenKindWith: 'unknown gen kind: ',
  errUnknownRouteWith: 'unknown route: ',
  errInvalidBookDocRelWith: 'invalid book doc rel: ',
  errEmptyProjectPath: 'cannot encode an empty project path',
  errPathEscape: 'path escapes workspace root',
  // host 开发者诊断串 · 第 3 批 C 类（子 agent 收尾判据 / 骨架与产物自检 / 服务缺失）
  errAgentLoopUnavailable: 'agentLoop 服务不可用',
  errGenNoArtifact: '子 agent 已结束但产物未生成: ',
  errGenArtifactStale: '子 agent 已结束但产物未更新: ',
  errGenEmptyArtifact: '子 agent 已结束但产物为空: ',
  errGenSkeletonLeft: '子 agent 已结束但产物仍是骨架（语义占位未填写）: ',
  errTrNotWritten: '译文未写入目标文件: ',
  errTrNotUpdated: '子 agent 已结束但译文未更新: ',
  errSrcSkeletonMissing: '子 agent 已结束但骨架文件不存在: ',
  errSrcSkeletonNoUnit: '骨架无任何可注解单元: ',
  errSrcNoAnnotation: '子 agent 已结束但未填写任何注解（疑似空转）: ',
  errHealthCheck: '产物健康自检未通过: ',
  errHealthLowRatio: '注解占比过低（',
  errHealthLowRatioEnd: '%<50%）：疑似大量代码行未填注解',
  errHealthEmptyBody: '正文没有任何可注解或代码行，产物为空',
  errHealthIndent: '行上方注解缩进与代码不一致（第 ',
  errHealthIndentMid: ' 行）. 注解缩进=',
  errHealthIndentEnd: ' 代码缩进=',
  errHealthBlankRun: '正文出现连续空行（>1），排版被空行割裂',
  errHealthNoMarker: '正文找不到任何 `// [N]` 注解标记（疑似全部漏注解）',
  errUnitOutOfRange: '单元 [',
  errUnitOutOfRangeMid: '-',
  errUnitOutOfRangeMid2: '] 越界（源码共 ',
  errUnitOutOfRangeEnd: ' 行）',
  // client api() 错误兜底（宿主未给 d.error 时上状态栏）
  errHttpPrefix: 'HTTP ',
  errRequestFailed: 'request failed',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ZH 字典', () => {
  it('全量 117 键与文案逐字一致（键名、顺序、值均不可漂移）', () => {
    expect(Object.keys(ZH)).toEqual(Object.keys(EXPECTED_ZH))
    expect(Object.keys(ZH)).toHaveLength(117)
    expect(ZH).toEqual(EXPECTED_ZH)
  })

  it('host 侧直取的三键文案不变（index.ts 的 400 文案真源）', () => {
    expect(ZH.errGenMd).toBe('markdown 文档不需要生成文件层文档/源码注解')
    expect(ZH.errTranslateOnlyMd).toBe('仅支持 Markdown 文档翻译')
    expect(ZH.errBookNoTranslate).toBe('书库内文档不参与翻译')
  })
})

describe('LANG 注册表', () => {
  it('zh 指向同一份 ZH 对象（多语言扩展点）', () => {
    expect(LANG.zh).toBe(ZH)
  })
})

describe('t()', () => {
  it('缺省语言（不传 lang）取 zh 文案', () => {
    expect(t('btnSave')).toBe('保存')
    expect(t('slotLabel')).toBe('文件')
    expect(t('errPollTimeout')).toBe('任务状态轮询超时，请稍后刷新任务状态')
  })

  it('显式 zh 与缺省一致', () => {
    expect(t('btnSave', 'zh')).toBe('保存')
    expect(t('mdCopied', 'zh')).toBe('已复制')
  })

  it('未注册语言回退 zh（而非返回 key）', () => {
    expect(t('btnSave', 'en')).toBe('保存')
    expect(t('btnSave', '')).toBe('保存')
  })

  it('缺键 warn 并返回 key 本身', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(t('no-such-key')).toBe('no-such-key')
    expect(warn).toHaveBeenCalledWith('[locale] missing key: no-such-key')
  })

  it('未注册语言下的缺键同样 warn 并返回 key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(t('also-missing', 'en')).toBe('also-missing')
    expect(warn).toHaveBeenCalledWith('[locale] missing key: also-missing')
  })

  it('原型链上的键不视为已登记（hasOwnProperty 语义）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(t('toString')).toBe('toString')
    expect(warn).toHaveBeenCalledWith('[locale] missing key: toString')
  })
})

// ---- A 类文案字典化：搬迁对照 + 回潮守卫（第 1 批，2026-09-11）----
// 两条断言各把一件事：① 新键的字典值逐字等于搬迁前的原字面量；② 已字典化的源码文件里
// 不再出现那些原字面量——「有人把某处改回裸串」时 ② 立刻变红（运行时取值守卫做不到这一点：
// 裸串与字典值同值，取值层面无法区分来源）。
// 每项的值取自搬迁前的源码原文与 git diff 的改前行；配合 ZH 全量对照表互为双保险。
const MOVED_STRINGS: Array<[string, string]> = [
  ['errNotAFile', 'not a file'],
  ['errNotAFileWith', 'not a file: '],
  ['errFileTooLarge', 'file too large: '],
  ['errFileTooLargeMid', ' bytes (limit '],
  ['errFileTooLargeClose', ')'],
  ['errTaskNotFound', 'task not found'],
  ['errSrcMissing', '源文档不存在: '],
  ['errSrcTooLarge', '源文档过大（> '],
  ['errSrcTooLargeEnd', ' 字节）'],
  ['errSrcAlreadyZh', '源文档已是简体中文，无需翻译: '],
  ['errUnreadableFile', '目标不是可读文件: '],
  ['errUnreadableDir', '目标不是可读文件夹: '],
]

/** 搬走后源码里不得再出现的原文（按文件分组；含引号的按原样带引号匹配）。
 *  第 1 批 A 类 + 第 2 批 B 类 + 第 3 批 C 类共用本表：A 类的四处由第 1 批登记，index.ts 项与
 *  fs-utils / gen-executor 两项由第 2 批扩入，其余 7 个文件由第 3 批扩入。`path required` 带
 *  单引号匹配，以免命中 index.ts:385 注释里反引号包裹的文档性提及（那不是字面量）。
 *  扫描判据是纯文本 includes，与「字面量是 throw 还是 bad.push 收集」无关——checkHealth 的 5 条
 *  走 bad.push，同样被 doc-render.ts 这一项覆盖（另有一条计数断言锚定 push 形式本身）。
 *  纯分隔符段（errUnitOutOfRangeMid = '-'）太短、做文本扫描会误命中，不登记；其值由
 *  MOVED_STRINGS_C 与拼接同构断言锁定。 */
const DOC_RENDER_LITERALS: string[] = [
  '注解占比过低（',
  '%<50%）：疑似大量代码行未填注解',
  "'正文没有任何可注解或代码行，产物为空'",
  '行上方注解缩进与代码不一致（第 ',
  ' 行）. 注解缩进=',
  ' 代码缩进=',
  "'正文出现连续空行（>1），排版被空行割裂'",
  "'正文找不到任何 `// [N]` 注解标记（疑似全部漏注解）'",
  '单元 [',
  '] 越界（源码共 ',
  ' 行）',
]

const NO_LITERAL: Array<[string, string[]]> = [
  ['src/host/index.ts', [
    "'not a file'", "'not a file: '", 'file too large:', "'task not found'",
    "'body too large'", "'invalid json body'", "'not a directory: '", "'path required'",
    "'refusing to delete the workspace root'", "'unknown gen kind: '", "'unknown route: '",
    "'invalid book doc rel: '",
  ]],
  // 第 1 批 A 类三串 + 第 3 批 C 类两串
  ['src/host/abilities/translate-doc/index.ts', [
    '源文档不存在: ', '源文档过大（> ', '源文档已是简体中文，无需翻译: ',
    "'译文未写入目标文件: '", "'子 agent 已结束但译文未更新: '",
  ]],
  ['src/host/abilities/source-doc/skeleton.ts', ['目标不是可读文件: ']],
  ['src/host/abilities/folder-doc/skeleton.ts', ['目标不是可读文件夹: ']],
  ['src/host/fs-utils.ts', ["'cannot encode an empty project path'", "'path escapes workspace root'"]],
  // 第 2 批 B 类一串 + 第 3 批 C 类三串
  ['src/host/gen-executor.ts', [
    "'unknown gen kind: '",
    "'agentLoop 服务不可用'", "'子 agent 已结束但产物未生成: '", "'子 agent 已结束但产物未更新: '",
  ]],
  // ---- 以下 6 个文件由第 3 批 C 类扩入 ----
  ['src/host/translate-executor.ts', ["'agentLoop 服务不可用'"]],
  ['src/host/abilities/folder-doc/index.ts', [
    "'子 agent 已结束但产物为空: '", "'子 agent 已结束但产物仍是骨架（语义占位未填写）: '",
  ]],
  ['src/host/abilities/file-doc/index.ts', [
    "'子 agent 已结束但产物为空: '", "'子 agent 已结束但产物仍是骨架（语义占位未填写）: '",
  ]],
  ['src/host/abilities/source-doc/index.ts', [
    "'子 agent 已结束但骨架文件不存在: '", "'骨架无任何可注解单元: '",
    "'子 agent 已结束但未填写任何注解（疑似空转）: '", "'产物健康自检未通过: '",
  ]],
  ['src/host/abilities/source-doc/doc-render.ts', DOC_RENDER_LITERALS],
]

describe('A 类文案字典化（第 1 批）', () => {
  it('12 个新键的字典值逐字等于搬迁前的原字面量', () => {
    for (const [key, original] of MOVED_STRINGS) {
      expect((ZH as Record<string, string>)[key], key).toBe(original)
    }
  })

  it('含变量的两串按原拼接顺序复现后，与原模板串逐字相同', () => {
    expect(ZH.errFileTooLarge + String(1234) + ZH.errFileTooLargeMid + String(2048) + ZH.errFileTooLargeClose)
      .toBe('file too large: ' + String(1234) + ' bytes (limit ' + String(2048) + ')')
    expect(ZH.errSrcTooLarge + String(2048) + ZH.errSrcTooLargeEnd)
      .toBe('源文档过大（> ' + String(2048) + ' 字节）')
    expect(ZH.errNotAFileWith + '目录概览/a.md').toBe('not a file: 目录概览/a.md')
  })

  it('已字典化的源码文件不再残留原字面量（改回裸串即变红）', () => {
    for (const [file, literals] of NO_LITERAL) {
      const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
      for (const literal of literals) {
        expect(text.includes(literal), file + ' 残留裸串: ' + literal).toBe(false)
      }
    }
  })
})

// ---- B 类文案字典化：搬迁对照（第 2 批，2026-09-11）----
// 协议/安全/防御类串（400/404/413 的 error 文案与越权抛错）。与 A 类同一套判据，值同样取自
// 搬迁前的源码原文（HEAD 版）；回潮拦截复用上面扩展后的 NO_LITERAL 表，故此处不再重复扫描。
const MOVED_STRINGS_B: Array<[string, string]> = [
  ['errBodyTooLarge', 'body too large'],
  ['errInvalidJsonBody', 'invalid json body'],
  ['errNotADirectoryWith', 'not a directory: '],
  ['errPathRequired', 'path required'],
  ['errRefuseDeleteRoot', 'refusing to delete the workspace root'],
  ['errUnknownGenKindWith', 'unknown gen kind: '],
  ['errUnknownRouteWith', 'unknown route: '],
  ['errInvalidBookDocRelWith', 'invalid book doc rel: '],
  ['errEmptyProjectPath', 'cannot encode an empty project path'],
  ['errPathEscape', 'path escapes workspace root'],
]

describe('B 类文案字典化（第 2 批）', () => {
  it('10 个新键的字典值逐字等于搬迁前的原字面量', () => {
    for (const [key, original] of MOVED_STRINGS_B) {
      expect((ZH as Record<string, string>)[key], key).toBe(original)
    }
  })

  it('含变量的四个前缀串按原拼接顺序复现后，与原串逐字相同', () => {
    expect(ZH.errNotADirectoryWith + '/nope').toBe('not a directory: /nope')
    expect(ZH.errUnknownGenKindWith + 'nope').toBe('unknown gen kind: nope')
    expect(ZH.errUnknownRouteWith + 'nope').toBe('unknown route: nope')
    expect(ZH.errInvalidBookDocRelWith + '../a.md').toBe('invalid book doc rel: ../a.md')
  })

  it('多处共用的文案只登记一个键（path required ×5、unknown route ×2、unknown gen kind ×2）', () => {
    const keys = Object.keys(ZH)
    const z = ZH as Record<string, string>
    expect(keys.filter(k => z[k] === 'path required')).toEqual(['errPathRequired'])
    expect(keys.filter(k => z[k] === 'unknown route: ')).toEqual(['errUnknownRouteWith'])
    expect(keys.filter(k => z[k] === 'unknown gen kind: ')).toEqual(['errUnknownGenKindWith'])
  })
})

// ---- C 类文案字典化：搬迁对照（第 3 批，2026-09-11）----
// 开发者诊断语（子 agent 收尾判据 / 骨架与产物自检 / 服务缺失）。这些串**只搬家不改写**：
// 它们是排障现场信息（含「子 agent」、绝对路径、内部术语），改写成用户话术即丢诊断信息。
// 值同样取自搬迁前的源码原文（HEAD 版），逐字符相同（含标点、冒号、空格、全角括号）。
// 回潮拦截复用上面扩展后的 NO_LITERAL 表；此处另加一条 push 形式的显式锚定（见最后一个用例）。
const MOVED_STRINGS_C: Array<[string, string]> = [
  ['errAgentLoopUnavailable', 'agentLoop 服务不可用'],
  ['errGenNoArtifact', '子 agent 已结束但产物未生成: '],
  ['errGenArtifactStale', '子 agent 已结束但产物未更新: '],
  ['errGenEmptyArtifact', '子 agent 已结束但产物为空: '],
  ['errGenSkeletonLeft', '子 agent 已结束但产物仍是骨架（语义占位未填写）: '],
  ['errTrNotWritten', '译文未写入目标文件: '],
  ['errTrNotUpdated', '子 agent 已结束但译文未更新: '],
  ['errSrcSkeletonMissing', '子 agent 已结束但骨架文件不存在: '],
  ['errSrcSkeletonNoUnit', '骨架无任何可注解单元: '],
  ['errSrcNoAnnotation', '子 agent 已结束但未填写任何注解（疑似空转）: '],
  ['errHealthCheck', '产物健康自检未通过: '],
  ['errHealthLowRatio', '注解占比过低（'],
  ['errHealthLowRatioEnd', '%<50%）：疑似大量代码行未填注解'],
  ['errHealthEmptyBody', '正文没有任何可注解或代码行，产物为空'],
  ['errHealthIndent', '行上方注解缩进与代码不一致（第 '],
  ['errHealthIndentMid', ' 行）. 注解缩进='],
  ['errHealthIndentEnd', ' 代码缩进='],
  ['errHealthBlankRun', '正文出现连续空行（>1），排版被空行割裂'],
  ['errHealthNoMarker', '正文找不到任何 `// [N]` 注解标记（疑似全部漏注解）'],
  ['errUnitOutOfRange', '单元 ['],
  ['errUnitOutOfRangeMid', '-'],
  ['errUnitOutOfRangeMid2', '] 越界（源码共 '],
  ['errUnitOutOfRangeEnd', ' 行）'],
]

describe('C 类文案字典化（第 3 批）', () => {
  it('23 个新键的字典值逐字等于搬迁前的原字面量', () => {
    for (const [key, original] of MOVED_STRINGS_C) {
      expect((ZH as Record<string, string>)[key], key).toBe(original)
    }
  })

  it('含变量的三段按原拼接顺序复现后，与原模板串逐字相同', () => {
    expect(ZH.errHealthLowRatio + String(25) + ZH.errHealthLowRatioEnd)
      .toBe('注解占比过低（' + String(25) + '%<50%）：疑似大量代码行未填注解')
    expect(ZH.errHealthIndent + String(0) + ZH.errHealthIndentMid + JSON.stringify('  ') + ZH.errHealthIndentEnd + JSON.stringify(''))
      .toBe('行上方注解缩进与代码不一致（第 ' + String(0) + ' 行）. 注解缩进=' + JSON.stringify('  ') + ' 代码缩进=' + JSON.stringify(''))
    expect(
      ZH.errUnitOutOfRange + String(1) + ZH.errUnitOutOfRangeMid + String(3)
      + ZH.errUnitOutOfRangeMid2 + String(2) + ZH.errUnitOutOfRangeEnd,
    ).toBe('单元 [1-3] 越界（源码共 2 行）')
  })

  it('带绝对路径/前缀式诊断串按原拼接顺序复现后，与原串逐字相同', () => {
    expect(ZH.errGenNoArtifact + '/abs/a.md').toBe('子 agent 已结束但产物未生成: /abs/a.md')
    expect(ZH.errGenEmptyArtifact + '/abs/a.md').toBe('子 agent 已结束但产物为空: /abs/a.md')
    expect(ZH.errGenSkeletonLeft + '/abs/a.md').toBe('子 agent 已结束但产物仍是骨架（语义占位未填写）: /abs/a.md')
    expect(ZH.errTrNotWritten + '/abs/a.md').toBe('译文未写入目标文件: /abs/a.md')
    expect(ZH.errSrcSkeletonMissing + '/abs/skeleton-t1.txt').toBe('子 agent 已结束但骨架文件不存在: /abs/skeleton-t1.txt')
    expect(ZH.errHealthCheck + '正文为空').toBe('产物健康自检未通过: 正文为空')
  })

  it('逐字同文的三组诊断串各只登记一个键（agentLoop ×2、产物为空 ×2、产物仍是骨架 ×2）', () => {
    const keys = Object.keys(ZH)
    const z = ZH as Record<string, string>
    expect(keys.filter(k => z[k] === 'agentLoop 服务不可用')).toEqual(['errAgentLoopUnavailable'])
    expect(keys.filter(k => z[k] === '子 agent 已结束但产物为空: ')).toEqual(['errGenEmptyArtifact'])
    expect(keys.filter(k => z[k] === '子 agent 已结束但产物仍是骨架（语义占位未填写）: ')).toEqual(['errGenSkeletonLeft'])
  })

  it('checkHealth 的 5 条收集式诊断（bad.push）同样纳入扫描——守卫不因非 throw 形式漏过', () => {
    const file = 'src/host/abilities/source-doc/doc-render.ts'
    const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    // 5 条诊断全部经 `bad.push(ZH.<key>)` 收集（不是 throw）：计数锚定 push 形式本身，
    // 任何一条改回裸串都会掉数（文本扫描对同值裸串本就不敏感）。
    // `\s*` 容纳 max-len 拆分后的换行写法（`bad.push(` 与首段分行）。
    expect(text.match(/bad\.push\(\s*ZH\./g)).toHaveLength(5)
    // 显式复跑 doc-render.ts 的扫描项：文本 includes 与 throw/push 无关，故 push 形式天然覆盖。
    for (const literal of DOC_RENDER_LITERALS) {
      expect(text.includes(literal), file + ' 残留裸串: ' + literal).toBe(false)
    }
  })
})
