// dsh-plugin-fs — 产品文案字典（src/shared/locale.ts）单元测试。
// 只断言外部行为：字典内容（键与文案逐字）、LANG 注册表、t() 的取值/回退/缺键语义。
// 迁移自迁移源 tests/client-md-utils.test.js 的「locale 字典契约」段，并把 72 键扩为全量对照。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LANG, ZH, t } from '../src/shared/locale'

// 迁移源 src/shared/locale.js:5-90 的全量键值对照表（72 键，逐字抄录）。
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
  a11yGen: '生成/重新生成：目录概览·文件摘要·源码注解',
  a11yTrLoading: '翻译中…',
  a11yTrRegen: '重新翻译（覆盖已有译文）',
  a11yTrNew: '翻译为中文（特殊名词用 ( ) 内解释）',
  // 按钮
  btnGen: '生成解读',
  btnEdit: '编辑',
  btnView: '查看',
  btnSave: '保存',
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
  folderCardDesc2: '点击右上角「生成解读」，在下拉中选择「目录概览」。',
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
  // client api() 错误兜底（宿主未给 d.error 时上状态栏）
  errHttpPrefix: 'HTTP ',
  errRequestFailed: 'request failed',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ZH 字典', () => {
  it('全量 72 键与文案逐字一致（键名、顺序、值均不可漂移）', () => {
    expect(Object.keys(ZH)).toEqual(Object.keys(EXPECTED_ZH))
    expect(Object.keys(ZH)).toHaveLength(72)
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
