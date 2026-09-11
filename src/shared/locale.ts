// dsh-plugin-fs — 产品文案字典（唯一真相源）。
// host 与 client 共用：client 经 t() 取值；host 直取 ZH[key]（U3 引用 errGenMd / errTranslateOnlyMd / errBookNoTranslate）。
// 多语言扩展点：新增语言在 LANG 注册并补全 ZH 对应键；当前 zh 单语，en 留未来。

/** key → 文案。产品文案唯一真源，字典外不得硬编码。
 *  `as const satisfies` 而非 `Record<string, string>` 注解：后者给每个取值带上 `string | undefined`
 *  （索引签名），host 直取后拼接（`ZH.errXxx + detail`）过不了 lint 的 restrict-plus-operands；
 *  加上约束后键仍是字面量、取值是 string，同时键集仍受 Record<string, string> 校验。 */
export const ZH = {
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
  // 分屏（R4）。可见文字沿用宿主 `dock.splitPane` 的「分栏」（与 §2 例外里那个字形同源，
  // 不自造术语）；a11y 串要说清「再点一次关闭」这个非通用交互 —— 窄档只剩图标时，
  // 按钮上没有可见文字，标识与用法全靠它。
  btnSplit: '分栏',
  a11ySplit: '分屏：把当前显示的视图复制一份只读副本到右侧；再点一次关闭',
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
  // host 错误串 · 第 1 批 A 类（正常 UI 操作可达的上屏文案；文案逐字沿用原字面量，只搬家不改写）。
  // 含变量的串按「前缀 + 续段」分键、调用方拼接（先例 errReadFail）；变量夹在固定文案中间时，
  // 中间那段另立 Mid/End 键，使整句固定文案零残留。errFileTooLargeClose 是括号闭合段。
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
  // host 协议/安全/防御类错误串 · 第 2 批 B 类（同上：只搬家不改写，值与原字面量逐字相同）。
  // 「固定前缀 + 变量」式串沿用 …With 后缀（先例 errNotAFileWith）；无变量的直取。
  // errPathRequired 由 index.ts 的 5 处共用（/write、/mkdir、/delete、/translate、/read）；
  // errUnknownGenKindWith 由 index.ts 的路由预检与 gen-executor.ts 的执行器兜底共用。
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
  // host 开发者诊断串 · 第 3 批 C 类（子 agent 收尾判据 / 骨架与产物自检 / 服务缺失）。
  // 同上：只搬家不改写——这些是诊断语（含「子 agent」、绝对路径、内部术语），改成用户话术
  // 会丢掉现场信息，故值与原字面量逐字相同。
  // 逐字同文的串共用一个键（不建同值多键）：errAgentLoopUnavailable 由 gen-executor 与
  // translate-executor 各一处共用；errGenEmptyArtifact 与 errGenSkeletonLeft 由 folder-doc 与
  // file-doc 两个能力描述符各一处共用。
  // 含变量/绝对路径的串沿用「前缀 + 续段」拆键（先例 errFileTooLarge / errSrcTooLarge）：
  // 变量夹在固定文案中间时，中段另立 Mid（三段则 Mid/Mid2），尾段另立 End，整句固定文案零残留。
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
} as const satisfies Record<string, string>

/** 语言码 → 字典。当前仅 zh；新增语言在此登记并补全 ZH 对应键。 */
export const LANG: Record<string, Record<string, string>> = { zh: ZH }

/**
 * 取当前语言文案；缺省 zh。缺键时 warn 并返回 key 本身（开发期即可发现未登记文案）。
 * @param key - ZH 中的文案键。
 * @param lang - 语言码；未注册或缺省时回退 zh（与源实现 `LANG[lang] || ZH` 同语义）。
 * @returns 对应文案；键未登记时返回 key 本身。
 */
export function t(key: string, lang?: string): string {
  // 显式注解：ZH 现在是无索引签名的字面量对象类型，联合类型下的 `dict[key]` 会失去索引签名。
  const dict: Record<string, string> = LANG[lang ?? ''] ?? ZH
  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key] as string
  console.warn('[locale] missing key: ' + key)
  return key
}
