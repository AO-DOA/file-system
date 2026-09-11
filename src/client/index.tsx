// dsh-plugin-fs — Client half.
// 文件系统文件查看器：注册到 conversation.view（对话页签行）新增「文件」页签，
// 左侧宿主文件树 + 右侧查看/编辑器。数据经 fetch('/api/fs/*') 调宿主 Node 路由
// （不依赖 host builtin，打包形态可持久常驻）。
// Markdown 与代码复用 DSH 原生渲染器：MarkdownText（md）与 CodeBlock（shiki 高亮），
// 二者来自 @deepseek-ai/dsh-client-ui-primitives，运行时由 web shell 的 seed 表解析。
// 纯逻辑（路径/frontmatter/映射）在 md-utils.ts；产品文案唯一真相源在 ../shared/locale.ts。
//
// 迁移说明（P4，决策 D-11）：本文件由迁移源 `src/client/index.js`（771 行，revision 3a3f89e）
// 逐段改写为 `.tsx` + JSX；每处 JSX 均按原 `React.createElement(type, props, ...children)`
// 的实参顺序对照，props 传递内容与顺序未变。行为等价原则见决策 D-8/D-9。
import * as React from 'react'
import {
  Button, CodeBlock, IconBrowseOutline16, IconCheckOutline16, IconChevronRightOutline14,
  IconEditOutline16, IconFolderClose16, IconFolderOpen16, IconFolderOpenOutline16,
  IconLoadingOutline16, IconPanelLeftOutline16, IconPlusOutline16, IconRefreshOutline16,
  MarkdownText, Menu, Tag, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels, TooltipSide } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '@deepseek-ai/cordis'
import {
  basename, extBadge, extOf, isMd, labLabelKey, langFor, parseFmRows, splitFrontmatter,
} from './md-utils.ts'
import { t } from '../shared/locale.ts'

// 插件标识：与 host 同键（运行时 guardedSurface 会用包名合成 name 覆盖，
// 此显式导出用于代码自证与契约文档化；勿依赖其运行值）。
export const name = 'fs'
export const inject = ['slots']

// ---- wire 数据形状（host 侧 /api/fs/* 的下发契约，见 docs/baseline/contracts.md）----

/** `/tree` 下发的一个节点；`hasDoc*` 为文档存在标记，`doc*Rel` 为书库逻辑路径。 */
interface TreeNode {
  type: 'directory' | 'file'
  path: string
  name: string
  hasDoc?: boolean | undefined
  hasDocSrc?: boolean | undefined
  hasDocTr?: boolean | undefined
  docRel?: string | undefined
  docSrcRel?: string | undefined
  docTrRel?: string | undefined
}

/** 当前打开对象：`/tree` 节点，或 `opened || {}` 产生的空占位（源实现同此）。 */
type OpenedNode = Partial<TreeNode>

/** `GET /read` 成功响应（`content` 为原文/文档全文，`ext` 为小写扩展名）。 */
interface ReadResponse {
  content: string
  ext: string
  size: number
}

/** `GET /root` 成功响应。 */
interface RootResponse {
  root: string
}

/** `GET /tree` 成功响应。 */
interface TreeResponse {
  path: string
  list: TreeNode[]
}

/** `GET /gen-status` 响应里的任务对象（生成与翻译共用一张任务表）。 */
interface GenTask {
  id: string
  kind: string
  status: string
  docRel?: string | undefined
  error?: string | undefined
}

/** `GET /gen-status` 成功响应。 */
interface GenStatusResponse {
  ok: boolean
  task: GenTask | null
}

/** `POST /gen-doc`、`POST /translate` 成功响应（`taskId` 供 pollTask 轮询）。 */
interface StartTaskResponse {
  ok: boolean
  started: boolean
  taskId: string
}

/** 解读选择菜单的四类入口：folder=目录概览(L1) / file=文件摘要(L2) / src=源码注解(L3)
 *  / translate=文章翻译（R1 收编：与前三者共用菜单，但走 host 的 `/translate` 路由，
 *  不写 L2/L3 文档，故 `runGen` 在入口处分派到 `runTranslate`）。 */
type GenKind = 'folder' | 'file' | 'src' | 'translate'

/** 解读选择菜单的一项；`disabled` 由翻译进行中（trBusy）置位，拒绝重复触发。 */
interface GenItem {
  id: GenKind
  label: string
  disabled?: boolean
}

/** 文件夹说明状态：ready(有内容) | missing(未生成→占位卡) | generating(生成中) | idle(未打开)。 */
type FoldState = 'idle' | 'ready' | 'missing' | 'generating'

/** 文件文档生成状态（源实现的 `genState`）：idle | file(生成 L2 中) | src(生成 L3 中)。 */
type GenState = 'idle' | 'file' | 'src'

/** 查看模式：doc / annot / tr / source。 */
type ViewMode = 'doc' | 'annot' | 'tr' | 'source'

/** 文件夹说明对象。 */
interface Fold {
  state: FoldState
  content: string
}

/** `workspaces` 服务的最小切面（源实现只消费 `list` 的 getSnapshot/subscribe）。 */
interface WorkspacesSurface {
  list: {
    getSnapshot(): { items?: WorkspaceItem[] | undefined } | undefined
    subscribe(listener: () => void): () => void
  }
}

/** 工作区条目（菜单 label 为 `(title || basename(path)) + wsItemSep + path`）。 */
interface WorkspaceItem {
  workspaceId: string
  title?: string | undefined
  path: string
}

/** 槽位定义（`id` 与 `order` 是产品位置契约，改动即破坏既有用户界面布局）。 */
interface SlotDefinition {
  name: string
  id: string
  order: number
  label: () => string
}

/** 槽位透传 props：`conversation.view` 的 owner props 本插件不消费（G-10）。 */
type SlotProps = Record<string, unknown>

/**
 * 客户端槽位注册表契约。
 *
 * 真实形状来自 `@deepseek-ai/dsh-client-ui-slots`，由 web shell 在运行时提供；
 * 此处按本插件实际消费的两个方法声明最小切面（与迁移源 `src/client/index.js:765-770` 一致）。
 */
interface SlotsSurface {
  inject(name: string, callback: () => void): void
  register(definition: SlotDefinition, view: (props: SlotProps) => React.ReactElement): () => void
}

// ---- 调宿主路由 ----

/**
 * 取错误对象的消息文本（迁移源 12 处 `e && e.message ? e.message : String(e)` 的类型安全等价式）。
 * @param e - catch 到的未知值。
 * @returns `message` 字段的字符串形式（为假值时）或 `String(e)`。
 */
function errText(e: unknown): string {
  if (e !== null && e !== undefined) {
    const message: unknown = (e as { message?: unknown }).message
    if (message) return String(message)
  }
  return String(e)
}

/**
 * 统一错误处理：HTTP 非 2xx 或业务 ok===false 一律 reject(Error)，
 * 调用方不再逐处判断 r.ok（tree/root 等成功响应无 ok 字段，不受影响）。
 * @param path - `/api/fs` 之后的路径（含 query）。
 * @param opts - fetch 选项。
 * @returns 解析后的 JSON；成功响应形状由调用方按端点约定指定。
 */
function api<T>(path: string, opts?: RequestInit): Promise<T> {
  return fetch('/api/fs' + path, opts).then(async (r) => {
    const d = await r.json().catch(() => null)
    if (!r.ok) throw new Error((d && d.error) || (t('errHttpPrefix') + r.status))
    if (d && d.ok === false) throw new Error(d.error || t('errRequestFailed'))
    return d as T
  })
}

/** 带 JSON 体的 POST 选项（五个 POST 端点共用，`headers` 逐字同源）。 */
function jsonPost(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// ---- UI 状态持久化（localStorage，跨界面/刷新保留）----
const UI_KEY = 'fs.ui.v1'

/** 落盘形状（6 个字段；`expanded` 落盘为展开路径字符串数组）。 */
interface UiState {
  rootPath: string
  curWsId: string
  treeW: number
  collapsed: boolean
  opened: TreeNode | null
  expanded: string[]
}

/**
 * 读持久化 UI 状态。
 * @returns 存档对象；不可用或无存档时 null（调用方按内存默认值走）。
 */
function loadUi(): UiState | null {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || 'null') as UiState | null }
  // 隐私模式/配额异常读不到时返回 null：UI 用内存默认值，调用方本就处理 null。
  catch { /* localStorage 不可用 → 无持久化状态，调用方按 null 走默认值 */ return null }
}

/**
 * 写持久化 UI 状态。
 * @param data - 待落盘的 6 字段对象。
 */
function saveUi(data: UiState): void {
  try { localStorage.setItem(UI_KEY, JSON.stringify(data)) }
  // 写失败只影响下次打开时的恢复：当前界面状态在内存里，没有别的通道会读到这次失败。
  catch { /* localStorage 不可用/写满 → 本次不持久化，UI 用内存态继续 */ }
}

// ---- 静默失败处理器：空 catch 必须写明吞掉了什么、以及为什么别的通道读不到 ----
// 文档读取竞态：新请求已接管（alive=false），旧响应/旧错误被丢弃；对应 state 缺失时 UI 走
// 加载态或占位卡，没有别的通道会读到这次失败。
const swallowStaleDocRead = (): void => {}
// 树节点懒加载失败：该节点保持未展开、缓存不写入，用户再点一次即重试；目录瞬时消失或权限
// 抖动都属常见，上屏报错反而打断浏览，故只吞掉、不留其它通道。
const swallowTreeLoadFailure = (): void => {}

const INDENT = 20

// 生成任务轮询上界：pollTask 最多轮询 5min（host 侧任务超时预算 10min 的前端孪生上限），
// 超期置 error 停止轮询，避免僵死任务/网络异常导致无限请求。
const POLL_LIMIT_MS = 5 * 60 * 1000

// MarkdownText 内置交互标签（复制/已复制/脚注）——产品文案走字典。
const MD_LABELS: MarkdownLabels = {
  code: { copyLabel: t('mdCopy'), copiedLabel: t('mdCopied') },
  footnotes: t('mdFootnotes'),
}

// ---- 查看区：按扩展名分流原生渲染 / 等宽兜底 ----

/**
 * 渲染 frontmatter 字段卡（无字段时返回 null）。
 * @param fm - splitFrontmatter 产出的头字段文本。
 * @returns 字段卡元素；无字段时 null。
 */
function renderFrontmatter(fm: string | null): React.JSX.Element | null {
  const rows = parseFmRows(fm)
  if (!rows.length) return null
  return (
    <div className="fs-fmcard">
      <div className="fs-fmhead">{t('frontmatter')}</div>
      {rows.map((r, i) => (
        <div key={i} className="fs-fmrow">
          <span className="fs-fmkey">{r.key || ''}</span>
          <span className="fs-fmval">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * 渲染 Markdown 正文：frontmatter 卡 + 原生 MarkdownText。
 * @param content - 文件原文（wire 数据，原样透传）。
 * @returns 正文元素。
 */
function renderMd(content: string): React.JSX.Element {
  const split = splitFrontmatter(content || '')
  const fmCard = renderFrontmatter(split.fm)
  return (
    <div className="fs-vbody">
      {fmCard}
      <MarkdownText text={split.body || ''} labels={MD_LABELS} />
    </div>
  )
}

/**
 * CodeBlock 的调用窄化。
 *
 * 迁移源（`src/client/index.js:110`）只传 `{ code, lang }`；上游
 * `@deepseek-ai/dsh-client-ui-primitives` 0.1.5 起把 `copyLabel`/`copiedLabel`
 * 声明为必填（真源 `packages/client/ui-primitives/src/markdown/CodeBlock.tsx:35-38`）。
 * 按决策 D-8/D-9「既有缺陷逐字保留」，本迁移**不补值**——补值会改变高亮区复制按钮的
 * 可见文案，属行为变化。故此处只在类型层窄化到源实现真正传递的两个字段，
 * 运行时调用与源逐字一致（该缺陷已在 P4 交付报告中单列，待用户裁决）。
 */
const CodeBlockCall = CodeBlock as unknown as (props: {
  code: string
  lang?: string | undefined
}) => React.JSX.Element

/**
 * 查看区主体：md -> 原生渲染；可高亮扩展名 -> CodeBlock；其余等宽兜底。
 * @param content - 文件内容（wire 数据，原样透传）。
 * @param ext - 小写扩展名。
 * @returns 查看区元素。
 */
function viewBody(content: string, ext: string): React.JSX.Element {
  if (isMd(ext)) {
    return renderMd(content)
  }
  const lang = langFor(ext)
  if (lang && lang !== 'text') {
    return <CodeBlockCall code={content || ''} lang={lang} />
  }
  return <pre className="fs-code">{content || t('emptyFile')}</pre>
}

/** FsTree 的 props（与迁移源 JSDoc `src/client/index.js:117-124` 同契约）。 */
interface FsTreeProps {
  tree: TreeNode[]
  expanded: Record<string, boolean>
  cache: Record<string, TreeNode[]>
  selected: OpenedNode | null
  onToggle: (path: string, open: boolean) => void
  onOpen: (node: TreeNode) => void
}

/**
 * 文件树面板：目录/文件行渲染、展开态、文档标记（树内点击经 onToggle/onOpen 回调）。
 * @param props - 见 {@link FsTreeProps}。
 * @returns 树面板元素。
 */
function FsTree(props: FsTreeProps): React.JSX.Element {
  const tree = props.tree || []
  const expanded = props.expanded || {}
  const cache = props.cache || {}
  const selected = props.selected

  /**
   * 渲染某目录已缓存的子节点。
   * @param dirPath - 目录相对路径。
   * @param depth - 当前缩进深度。
   * @returns 子节点行；无缓存或空目录时 null。
   */
  function renderChildren(dirPath: string, depth: number): React.JSX.Element[] | null {
    const kids = cache[dirPath] || []
    if (!kids.length) return null
    return kids.map(k => renderRow(k, depth + 1))
  }

  /**
   * 渲染目录行：点击既切换展开态也把该目录设为右侧打开对象。
   * @param node - 目录节点。
   * @param depth - 缩进深度。
   * @returns 目录行元素（含展开后的子节点）。
   */
  function renderDirRow(node: TreeNode, depth: number): React.JSX.Element {
    const isOpen = !!expanded[node.path]
    const hasDoc = node.hasDoc || node.hasDocSrc
    return (
      <div key={node.path}>
        <div
          className={'fs-tr' + (isOpen ? ' fs-open' : '')}
          style={{ paddingLeft: 8 + depth * INDENT }}
          onClick={() => { props.onToggle(node.path, !isOpen); props.onOpen(node) }}
        >
          <span className="fs-slot fs-folder">
            {isOpen ? <IconFolderOpen16 /> : <IconFolderClose16 />}
          </span>
          <span className="fs-slot fs-chevslot">
            <IconChevronRightOutline14 className={isOpen ? 'fs-chev fs-chev-open' : 'fs-chev'} />
          </span>
          <span className="fs-title">{node.name}</span>
          {hasDoc
            ? (
              <span
                className="fs-docmark"
                title={t('a11yDocDir')}
                onClick={(e) => { e.stopPropagation(); props.onOpen(node) }}
              />
            )
            : null}
        </div>
        {isOpen ? renderChildren(node.path, depth) : null}
      </div>
    )
  }

  /**
   * 渲染文件行：点击即打开；角标按扩展名，文档蓝点仅有标记无事件（源行为，D-8 保留）。
   * @param node - 文件节点。
   * @param depth - 缩进深度。
   * @returns 文件行元素。
   */
  function renderFileRow(node: TreeNode, depth: number): React.JSX.Element {
    const isSel = selected && selected.path === node.path
    const hasDoc = node.hasDoc || node.hasDocSrc || node.hasDocTr
    return (
      <div
        key={node.path}
        className={'fs-tr' + (isSel ? ' sel' : '')}
        style={{ paddingLeft: 8 + depth * INDENT }}
        onClick={() => props.onOpen(node)}
      >
        <span className="fs-slot fs-file"><IconBrowseOutline16 /></span>
        <span className="fs-title">{node.name}</span>
        {/* 扩展名角标改用官方 Tag（tone=quiet：纯文字无底色，最接近原 .fs-badge 的观感）。
            className 只保留布局用的 flex:none，不再自带字号/底色/圆角（原样式已删除）。 */}
        {extBadge(node.name) ? <Tag tone="quiet" className="fs-exttag">{extBadge(node.name)}</Tag> : null}
        {hasDoc ? <span className="fs-docmark" title={t('a11yDocFiles')} /> : null}
      </div>
    )
  }

  /**
   * 按节点类型分派行渲染。
   * @param node - 树节点。
   * @param depth - 缩进深度。
   * @returns 行元素。
   */
  function renderRow(node: TreeNode, depth: number): React.JSX.Element {
    return node.type === 'directory' ? renderDirRow(node, depth) : renderFileRow(node, depth)
  }

  return (
    <div className="fs-panel">
      {tree.length === 0
        ? <div className="fs-empty">{t('emptyDir')}</div>
        : tree.map(n => renderRow(n, 0))}
    </div>
  )
}

// 查看模式（R3 起由「视图选择器」承载，不再是一排胶囊）：doc 按对象类型区分——文件夹→目录概览，
// 文件→文件摘要；annot→源码注解；tr→文章翻译（译文，仅项目内 md）；source→源码（预览+编辑）。
// 名称与 GLOSSARY.md 保持一致；label 文案由 t(labLabelKey(mode, isDir)) 取值（字典唯一真相源）。

/** useOpenedViewer 的返回契约（与迁移源 JSDoc `src/client/index.js:169-177` 同形，去掉死字段）。 */
interface ViewerState {
  source: ReadResponse | null
  docData: string | null
  annotData: string | null
  trData: string | null
  mode: ViewMode
  editMode: boolean
  edit: string
  dirty: boolean
  status: string
  fold: Fold
  hasSource: boolean
  modes: ViewMode[]
  canTranslate: boolean
  trBusy: boolean
  genState: GenState
  setMode: (mode: ViewMode) => void
  setEditMode: (on: boolean) => void
  changeEdit: (value: string) => void
  toggleEdit: () => void
  save: () => void
  runGen: (kind: GenKind) => void
  runTranslate: () => void
}

/**
 * 打开对象的状态与操作集：读源/读三类文档、生成任务轮询、翻译、保存、编辑态。
 *
 * 死字段已按决策 D-8 例外 a 删除（迁移源 `src/client/index.js` 中只写不读、无任何消费点）：
 * `cardDismissed`/`setCardDismissed`、`genStatus`、`isMdFile`、`isBookFile`
 * （后两者的局部变量仍保留，供 `canTranslate` 派生使用）。
 * @param opened - 当前打开节点（`/tree` 节点或空占位对象）。
 * @param onTrDone - 翻译成功后回调（docTrRel）；无则 null。
 * @returns 见 {@link ViewerState}。
 */
function useOpenedViewer(
  opened: OpenedNode,
  onTrDone: ((docTrRel: string) => void) | null,
): ViewerState {
  const [source, setSource] = React.useState<ReadResponse | null>(null)
  const [docData, setDocData] = React.useState<string | null>(null)
  const [annotData, setAnnotData] = React.useState<string | null>(null)
  const [trData, setTrData] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<ViewMode>('source')
  const [editMode, setEditMode] = React.useState(false)
  const [edit, setEdit] = React.useState('')
  const [dirty, setDirty] = React.useState(false)
  const [status, setStatus] = React.useState('')
  // 文件夹说明：ready(有内容) | missing(未生成→占位卡) | generating(生成中)
  const [fold, setFold] = React.useState<Fold>({ state: 'idle', content: '' })
  // 文件文档生成状态：'idle' | 'file'(生成 L2 中) | 'src'(生成 L3 中)
  const [genState, setGenState] = React.useState<GenState>('idle')
  // 翻译中标记（仅项目内 md 文档的翻译按钮用）。
  const [trBusy, setTrBusy] = React.useState(false)
  const aliveRef = React.useRef(true)

  const hasSource = opened.type !== 'directory'
  // md/markdown 类本身即文档：不生成 L2/L3（用户确认），仅源码类提供生成入口。
  const isMdFile = hasSource && isMd(extOf(opened.path || ''))
  // 书库内（.book/）文档不是翻译对象（用户确认：md 对象是项目文件内的，对 book 内的无效）。
  const isBookFile = hasSource && (opened.path === '.book' || String(opened.path || '').startsWith('.book/'))
  const canTranslate = isMdFile && !isBookFile
  // 视图固定顺序（R3）：源码 → 文件摘要 → 源码注解 → 文章翻译。数组只用于渲染
  // （视图选择器的下拉按此序排列，当前项除外），不再是默认视图的判据。
  const modes: ViewMode[] = []
  if (hasSource) modes.push('source')
  if (opened.hasDoc || docData != null) modes.push('doc')
  if (opened.hasDocSrc || annotData != null) modes.push('annot')
  if (canTranslate && (opened.hasDocTr || trData != null)) modes.push('tr')

  React.useEffect(() => {
    let alive = true
    aliveRef.current = true
    setSource(null); setDocData(null); setAnnotData(null); setTrData(null)
    setEditMode(false); setDirty(false); setStatus('')
    setFold({ state: 'idle', content: '' })
    setGenState('idle'); setTrBusy(false)
    // 点击文件后的默认视图：源码优先（R3）——有源码可看就进源码（预览/编辑）；
    // 无源码（目录节点）时沿用原有的「目录概览 → 源码注解」回退顺序，最终兜底落在 `doc`
    // 而不是 `source`：目录永远没有源码，而占位卡讲的正是「还没生成的目录概览」，
    // 按钮上写「源码」会与画面分离（R3.2 要求按钮文字恒等于当前显示的视图名）。
    setMode(hasSource ? 'source' : (opened.hasDoc ? 'doc' : (opened.hasDocSrc ? 'annot' : 'doc')))
    if (hasSource && opened.path) {
      api<ReadResponse>('/read?path=' + encodeURIComponent(opened.path))
        .then((d) => { if (alive) { setSource(d); setEdit(d.content || '') } })
        .catch((e: unknown) => { if (alive) setStatus(t('errReadFail') + errText(e)) })
    } else if (opened.path) {
      // 目录节点：hasDoc（/tree 下发）则经 /read 读目录概览文档；未生成则 missing → 占位卡。
      if (opened.hasDoc && opened.docRel) {
        api<ReadResponse>('/read?path=' + encodeURIComponent(opened.docRel))
          .then((d) => { if (alive) setFold({ state: 'ready', content: (d && d.content) || '' }) })
          .catch(() => { if (alive) setFold({ state: 'missing', content: '' }) })
      } else {
        setFold({ state: 'missing', content: '' })
      }
    }
    if (opened.hasDoc && opened.docRel) {
      api<ReadResponse>('/read?path=' + encodeURIComponent(opened.docRel))
        .then((d) => { if (alive) setDocData(d.content || '') })
        .catch(swallowStaleDocRead)
    }
    if (opened.hasDocSrc && opened.docSrcRel) {
      api<ReadResponse>('/read?path=' + encodeURIComponent(opened.docSrcRel))
        .then((d) => { if (alive) setAnnotData(d.content || '') })
        .catch(swallowStaleDocRead)
    }
    if (canTranslate && opened.hasDocTr && opened.docTrRel) {
      api<ReadResponse>('/read?path=' + encodeURIComponent(opened.docTrRel))
        .then((d) => { if (alive) setTrData(d.content || '') })
        .catch(swallowStaleDocRead)
    }
    return () => { alive = false; aliveRef.current = false }
  }, [opened.path])

  /**
   * 统一轮询生成任务状态；成功/失败前每 1.5s 查询一次，超 POLL_LIMIT_MS 置 error 停止。
   *
   * D-8 例外 b：迁移源未保存 `setTimeout` 句柄、卸载后不做清理。本实现对组件卸载可观察地
   * 等价（`aliveRef` 短路与源一致），但**不新增清理**——行为与源逐字一致，差异清单见交付报告。
   * @param taskId - gen-doc / translate 返回的任务 id。
   * @param onSuccess - 任务成功回调（收到任务对象）。
   * @param onError - 任务失败/超时/消失回调（收到错误文本）。
   */
  function pollTask(
    taskId: string,
    onSuccess: ((task: GenTask) => void) | null,
    onError: ((message: string) => void) | null,
  ): void {
    const deadline = Date.now() + POLL_LIMIT_MS
    const tick = (): void => {
      if (!aliveRef.current) return
      // 轮询上界：超时置 error 并不再发起下一次查询；任务本身仍可能成功，用户稍后刷新可见。
      if (Date.now() > deadline) {
        if (onError) onError(t('errPollTimeout'))
        return
      }
      api<GenStatusResponse>('/gen-status?id=' + encodeURIComponent(taskId))
        .then((r) => {
          if (!aliveRef.current) return
          const task = r && r.task
          if (!task) { if (onError) onError(t('errGenTaskGone') + taskId); return }
          if (task.status === 'success') { if (onSuccess) onSuccess(task); return }
          if (task.status === 'error') { if (onError) onError(task.error || t('errGenFail')); return }
          setTimeout(tick, 1500)
        })
        .catch((e: unknown) => {
          if (!aliveRef.current) return
          if (onError) onError(errText(e))
        })
    }
    setTimeout(tick, 800)
  }

  /**
   * 统一解读入口（R1 收编）：kind ∈ folder(目录概览/L1) | file(文件摘要/L2) | src(源码注解/L3)
   * | translate(文章翻译)。前三者 POST /gen-doc 触发后台子 agent → 轮询任务 → 成功后按
   * task.docRel 经 /read 读回文档，落到对应查看状态（folder→fold、file→docData+doc 模式、
   * src→annotData+annot 模式）；translate 不产出 L2/L3 文档，与前三者不是同一套调度，
   * 因此在入口处直接分派给 {@link runTranslate}（host 侧独立路由 `/translate`）。
   * @param kind - 要生成的文档类型，或 `translate`（文章翻译）。
   */
  function runGen(kind: GenKind): void {
    // 翻译：沿用原独立按钮的调度与状态（trBusy / trData / tr 模式），不写 L2/L3。
    if (kind === 'translate') { runTranslate(); return }
    if (!opened.path) return
    if (kind !== 'folder' && genState !== 'idle') return
    setStatus('')
    if (kind === 'folder') setFold({ state: 'generating', content: '' })
    else setGenState(kind)
    const reset = (): void => {
      if (kind === 'folder') setFold({ state: 'missing', content: '' })
      else setGenState('idle')
    }
    api<StartTaskResponse>('/gen-doc', jsonPost({ kind, path: opened.path })).then((r) => {
      const taskId = r && r.taskId
      if (!taskId) throw new Error(t('errGenNoTaskId'))
      pollTask(taskId, (task) => {
        if (!aliveRef.current) return
        const docRel = task && task.docRel
        if (!docRel) { reset(); setStatus(t('errGenNoDocRel')); return }
        api<ReadResponse>('/read?path=' + encodeURIComponent(docRel)).then((d) => {
          if (!aliveRef.current) return
          if (kind === 'folder') setFold({ state: 'ready', content: (d && d.content) || '' })
          else if (kind === 'file') { setDocData((d && d.content) || ''); setMode('doc'); setGenState('idle') }
          else { setAnnotData((d && d.content) || ''); setMode('annot'); setGenState('idle') }
        }).catch((e: unknown) => {
          if (!aliveRef.current) return
          reset()
          setStatus(t('errGenReadFail') + errText(e))
        })
      }, (err) => {
        if (!aliveRef.current) return
        reset()
        setStatus(t('errGenFailWith') + err)
      })
    }).catch((e: unknown) => {
      if (!aliveRef.current) return
      reset()
      setStatus(errText(e))
    })
  }

  /**
   * 翻译入口：仅项目内 md 文档。POST /translate 触发后台子 agent → 轮询任务 →
   * 成功后按 task.docRel 经 /read 读回译文，落到 trData 并切到「文章翻译」页签。
   * 与 runGen 互不干扰（翻译任务写入 genTasks 的 kind='translate'，同样经 gen-status 轮询）。
   */
  function runTranslate(): void {
    if (!canTranslate || !opened.path) return
    if (trBusy) return
    setStatus('')
    setTrBusy(true)
    api<StartTaskResponse>('/translate', jsonPost({ path: opened.path })).then((r) => {
      const taskId = r && r.taskId
      if (!taskId) throw new Error(t('errTrNoTaskId'))
      pollTask(taskId, (task) => {
        if (!aliveRef.current) return
        const docRel = task && task.docRel
        if (!docRel) {
          setTrBusy(false)
          setStatus(t('errTrNoDocRel'))
          return
        }
        api<ReadResponse>('/read?path=' + encodeURIComponent(docRel)).then((d) => {
          if (!aliveRef.current) return
          setTrBusy(false)
          setTrData((d && d.content) || '')
          setMode('tr')
          setStatus(t('okTrDone'))
          if (onTrDone) onTrDone(docRel)
        }).catch((e: unknown) => {
          if (!aliveRef.current) return
          setTrBusy(false)
          setStatus(t('errTrReadFail') + errText(e))
        })
      }, (err) => {
        if (!aliveRef.current) return
        setTrBusy(false)
        setStatus(t('errTrFail') + err)
      })
    }).catch((e: unknown) => {
      if (!aliveRef.current) return
      setTrBusy(false)
      setStatus(errText(e))
    })
  }

  /**
   * 保存编辑内容到 `/write`；成功置 `okSaved` 并退出编辑态（清 dirty）。
   */
  function save(): void {
    if (!hasSource) return
    api<unknown>('/write', jsonPost({ path: opened.path, content: edit }))
      .then(() => { setDirty(false); setStatus(t('okSaved')); setEditMode(false) })
      .catch((e: unknown) => setStatus(t('errSaveFail') + errText(e)))
  }

  /**
   * 编辑内容变更：同时更新 edit 与置 dirty（「● 未保存」的出现条件）。
   * @param value - textarea 当前值。
   */
  function changeEdit(value: string): void { setEdit(value); setDirty(true) }

  /** 在编辑态与查看态之间切换（不清除 dirty，源行为）。 */
  function toggleEdit(): void { setEditMode(!editMode) }

  return {
    source, docData, annotData, trData, mode, editMode, edit, dirty, status, fold, hasSource, modes,
    canTranslate, trBusy, genState,
    setMode, setEditMode, changeEdit, toggleEdit, save, runGen, runTranslate,
  }
}

/**
 * 文件夹占位卡：目录概览未生成时的引导卡（文件路径/名称来自 wire 数据，文案走字典）。
 * @param opened - 当前打开节点。
 * @returns 占位卡元素。
 */
function placeholderCard(opened: OpenedNode): React.JSX.Element {
  const folderName = opened.name || (opened.path === '.' ? t('rootDirName') : opened.path)
  const folderPath = opened.path === '.' ? opened.name || '.' : opened.path
  return (
    <div className="fs-folder-card">
      <div className="fs-folder-card-ti">{t('folderCardTitle')}</div>
      <div className="fs-folder-card-path">
        <span className="fs-folder-card-path-name">{folderName}</span>
        <span className="fs-folder-card-path-sep">{t('pathSep')}</span>
        <span className="fs-folder-card-path-rel">{folderPath}</span>
      </div>
      <div className="fs-folder-card-desc">{t('folderCardDesc1')}</div>
      <div className="fs-folder-card-desc">{t('folderCardDesc2')}</div>
    </div>
  )
}

// ---- 分栏字形（R4，规格 §2 的唯一例外）----
// 宿主 `packages/client/ui-dockkit/src/components/TabPanel.tsx` 的 `SplitGlyph`：面板外框环
// （`PANEL_FRAME`）与一条移到中心的竖线，合成一条 even-odd 路径。该组件与常量都未 export，
// dockkit 也不在插件的 client 外置白名单（`tsdown.config.ts` 的 `CLIENT_EXTERNALS`）里，
// 插件无法 import ⇒ 经用户裁决把两段路径**原样复制**进来（本文件里的两个常量由脚本从宿主
// 源码机械取出，未做人工转录）。代价：宿主将来改这个字形时这份副本不会跟随（已知并接受）。
/** 面板外框环（宿主 `PANEL_FRAME` 逐字副本）。 */
const SPLIT_PANEL_FRAME = 'M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM4.1828 14.0873L5.54303 14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715L4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873Z'
/** 移到中心的竖线（宿主 `SplitGlyph` 里的第二段路径逐字副本）。 */
const SPLIT_DIVIDER = 'M7.31989 1.88307H8.68012V14.1169H7.31989V1.88307Z'

/**
 * 分栏按钮的图标：16×16 的 DSH 分栏字形。写法与宿主那处一致（`fill="none"`、
 * `aria-hidden="true"`、`fill="currentColor"`、`fillRule`/`clipRule` 取 evenodd）。
 * @returns 图标元素。
 */
function SplitGlyph(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d={SPLIT_PANEL_FRAME + SPLIT_DIVIDER} fill="currentColor" />
    </svg>
  )
}

/** FsPane 的 props。 */
interface FsPaneProps {
  opened: OpenedNode
  viewer: ViewerState
}

/**
 * 查看器主体：按 viewer 状态渲染占位卡/生成中/加载中/Markdown/代码/编辑区。
 * @param props - 见 {@link FsPaneProps}。
 * @returns 查看区元素。
 */
function FsPane(props: FsPaneProps): React.JSX.Element {
  const opened = (props && props.opened) || {}
  const v = (props && props.viewer) || ({} as ViewerState)
  let body: React.ReactNode
  if (!v.hasSource) {
    // 文件夹节点：说明 / 占位卡 / 生成中。
    if (v.fold && v.fold.state === 'ready') body = renderMd(v.fold.content)
    else if (v.fold && v.fold.state === 'generating') body = <div className="fs-load">{t('genFolderBusy')}</div>
    else if (v.status) body = <div className="fs-load">{v.status}</div>
    else body = placeholderCard(opened)
  } else if (v.genState !== 'idle') {
    // 文件 L2/L3 生成中（轮询等待）。
    body = <div className="fs-load">{v.genState === 'file' ? t('genFileBusy') : t('genSrcBusy')}</div>
  } else if (v.mode === 'doc') {
    body = v.docData != null ? renderMd(v.docData) : <div className="fs-load">{t('loading')}</div>
  } else if (v.mode === 'annot') {
    body = v.annotData != null ? renderMd(v.annotData) : <div className="fs-load">{t('loading')}</div>
  } else if (v.mode === 'tr') {
    body = v.trData != null ? renderMd(v.trData) : <div className="fs-load">{t('loading')}</div>
  } else {
    if (v.status && !v.source) body = <div className="fs-load">{v.status}</div>
    else if (!v.source) body = <div className="fs-load">{t('loading')}</div>
    else if (v.editMode) {
      body = (
        <textarea
          className="fs-area"
          value={v.edit}
          onChange={e => v.changeEdit(e.target.value)}
        />
      )
    } else body = viewBody(v.source.content, v.source.ext)
  }
  return (
    <div className="fs-main">
      <div className="fs-bscroll">{body}</div>
    </div>
  )
}

/**
 * 分栏记录（R4）：按「打开对象的 path」索引，这就是「按文件各自记忆」——
 * 切到没开过分栏的文件/目录时查不到记录，自然回到全屏。
 *
 * `mode` 是**开启那一刻冻结**的视图类型（左侧之后切视图只影响左侧）；
 * `ratio` 是右侧窗格在内容区弹性宽度里的占比。关闭只把 `on` 置 false，
 * 冻结的视图类型与比例都留着，「拖拽比例同样按文件记忆」由此成立。
 */
interface SplitState {
  on: boolean
  mode: ViewMode
  ratio: number
}

/** 分栏比例的初值与上下限。它们是**比例**不是像素阈值——分档阈值全部在样式表的容器查询里。 */
const SPLIT_RATIO_DEFAULT = 0.5
const SPLIT_RATIO_MIN = 0.2
const SPLIT_RATIO_MAX = 0.8

/** FsView 的 props：`workspaces` 由注册处显式注入；槽位透传的其它字段被忽略。 */
interface FsViewProps {
  workspaces?: WorkspacesSurface | undefined
}

/** 顶栏气泡的悬停延迟（毫秒），全插件一个值 —— 调节点只有这一处。
 *
 * 为什么必须给延迟：primitives 的 `Tooltip` 把 `delayMs` 的默认值取成 **0**（`Tooltip.tsx` 的
 * `delayMs = 0` 形参默认），所以不传它就是「hover 即弹」。顶栏按钮排成一行，指针扫过去会一路
 * 弹气泡，用户反馈「很烦」。取 1000ms ≈ 1 秒：宿主测试里的惯例值是 500ms（`<Tooltip delayMs={500}>`），
 * 这里比它更「沉」一档，才符合用户原话「等几秒再显示，不要直接显示」；再长（如 2s）会让真有心看
 * 提示的人等得不耐烦，故折中在 1s。
 * **只延迟 hover**：`Tooltip` 的 focus 分支走的是 `cancelShow(); show()`，绕过计时器 ⇒
 * 键盘 Tab 到按钮时气泡立即出现，无障碍语义未被这一延迟动到。
 * 用户嫌快/慢时只改这一个数字，不必碰任何调用点。 */
const TIP_DELAY_MS = 1000

/** 顶栏气泡的默认方向：往上弹。
 *
 * 为什么是 `top` 而不是 primitives 的默认 `'right'`（`Tooltip.tsx` 的 `side = 'right'`）：
 * 顶栏下面紧挨着的就是用户正在读的正文/内容区，气泡一旦出现在下方就把它压住（用户截图反馈）；
 * 顶栏上方只有 DSH 自己的页签栏，被短暂遮住的代价小得多。
 * 另外 `Tooltip` 的视口自适应会在「请求的方向放不下」时**垂直翻面**（`fitsBelow` / `fitsAbove`）：
 * 默认的 `right` 一旦被右边界拒绝就会翻到 `bottom`，即翻到正文那一侧；而从 `top` 出发，
 * 只有当顶栏贴着视口顶端、上方放不下时才会翻成 `bottom`。
 * 仍是**参数**不是写死的：`tip()` 的 `side` 可按调用点覆盖，个别位置需要别的方向时不必改这里。 */
const TIP_SIDE: TooltipSide = 'top'

/**
 * 给一个顶栏按钮挂上 primitives 的 `Tooltip`（悬停/聚焦气泡）。
 *
 * **为什么需要外面这层原生 `<span>`（实测，不是推断）**：`Tooltip` 靠 `cloneElement(children, {ref})`
 * 拿到锚点（`lib/index.js` 的 `anchor = useRef(null)`），而 primitives 的 `Button` 是**普通函数组件、
 * 没有 `forwardRef`**（同版本 `Button.tsx` 的实现；宿主自己的 4 处 `Tooltip` 也一律包原生
 * `<button>` / `<span>`，从不包 `Button`）。本项目跑 React **18.3.1**，往函数组件上挂 `ref` 只会
 * 得到一条警告（`Function components cannot be given refs`）且 `anchor.current` 恒为 null ——
 * 于是气泡**永远不渲染**。所以锚点必须是原生元素：按钮外面加一层只做收缩包裹的 `.fs-tipwrap`。
 * 这一层不改变任何被测量盒子的几何（3857 档逐档实测 0 差异，见
 * `docs/agent/reports/2026-09-12-collapse-split-edit-merge.md` §7.2）。
 *
 * 气泡替代的是原生 `title`：原生气泡的宽度/底色/位置/层级全不受页面控制，会在正文上压一条
 * 又宽又扁的深色长条（用户截图的那条就是它），换成 `Tooltip` 才是受控浮层。
 * 延迟与方向也在这里统一：`TIP_DELAY_MS`（悬停不立即弹）与 `TIP_SIDE`（往上弹，避开正文），
 * 调用点只传文案，不必各写一遍。
 * @param btn - 要挂气泡的按钮元素。
 * @param label - 气泡文案（纯图标态下它也是可读的那一份提示；可访问名另由 `aria-label` 给出）。
 * @param key - 用在数组子节点里时的 React key（`tip()` 自己生成元素，没处传 key）。
 * @param side - 气泡方向；缺省 {@link TIP_SIDE}（`top`），个别调用点可覆盖。
 * @returns 包好气泡的锚点元素。
 */
function tip(btn: React.JSX.Element, label: string, key?: string, side: TooltipSide = TIP_SIDE): React.JSX.Element {
  return (
    <Tooltip key={key} label={label} side={side} delayMs={TIP_DELAY_MS}>
      <span className="fs-tipwrap">{btn}</span>
    </Tooltip>
  )
}

/**
 * 文件系统页签主视图：工作区切换 + 文件树（可折叠/拖宽）+ 查看/编辑器。
 * @param props - 见 {@link FsViewProps}。
 * @returns 页签主视图元素。
 */
function FsView(props: FsViewProps): React.JSX.Element {
  const workspaces = props && props.workspaces
  const [collapsed, setCollapsed] = React.useState(false)
  const [treeW, setTreeW] = React.useState(280)
  const [opened, setOpened] = React.useState<TreeNode | null>(null)
  const [rootName, setRootName] = React.useState('')
  const [rootPath, setRootPath] = React.useState('')
  const [tree, setTree] = React.useState<TreeNode[]>([])
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const [cache, setCache] = React.useState<Record<string, TreeNode[]>>({})
  const [dragging, setDragging] = React.useState(false)
  // 分栏（R4）：按打开对象的 path 记账（开关 / 冻结的视图类型 / 分栏比例），见 {@link SplitState}。
  const [splits, setSplits] = React.useState<Record<string, SplitState>>({})
  const [draggingSplit, setDraggingSplit] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [wsItems, setWsItems] = React.useState<WorkspaceItem[]>([])
  const [curWsId, setCurWsId] = React.useState('')

  /**
   * 刷新/切换项目根：可选 set-root → 读 root → 读根树，并重置展开态/缓存/打开对象。
   * @param path - 新的项目根绝对路径；省略则只重读当前根（刷新按钮）。
   */
  function refreshRoot(path?: string): Promise<void> {
    const prep = path
      ? api<unknown>('/set-root', jsonPost({ path }))
      : Promise.resolve({ ok: true })
    return prep.then(() => api<RootResponse>('/root')).then((r) => {
      setRootName(basename(r.root))
      setRootPath(r.root)
      return api<TreeResponse>('/tree?path=' + encodeURIComponent('.'))
    }).then((task) => {
      setTree(task.list || [])
      setExpanded({})
      setCache({})
      setOpened(null)
      setStatus('')
    }).catch((e: unknown) => setStatus(t('errLoadFail') + errText(e)))
  }

  React.useEffect(() => {
    let alive = true
    const saved = loadUi()
    if (saved) {
      setTreeW(saved.treeW || 280)
      setCollapsed(!!saved.collapsed)
      setCurWsId(saved.curWsId || '')
      const prep = saved.rootPath
        ? api<unknown>('/set-root', jsonPost({ path: saved.rootPath }))
        : Promise.resolve({ ok: true })
      prep.then(() => api<RootResponse>('/root')).then((r) => {
        if (!alive) return null
        setRootPath(r.root)
        setRootName(basename(r.root))
        return api<TreeResponse>('/tree?path=' + encodeURIComponent('.'))
      }).then((task) => {
        if (!alive || !task) return null
        setTree(task.list || [])
        const exp = Array.isArray(saved.expanded) ? saved.expanded : []
        const expMap: Record<string, boolean> = {}
        exp.forEach((p) => { expMap[p] = true })
        setExpanded(expMap)
        setOpened(saved.opened || null)
        return exp
      }).then((exp) => {
        if (!alive || !exp || !exp.length) return
        Promise.all(exp.map(p => api<TreeResponse>('/tree?path=' + encodeURIComponent(p)).catch(() => ({ list: [] }))))
          .then((rs) => {
            if (!alive) return
            const c: Record<string, TreeNode[]> = {}
            exp.forEach((p, i) => { c[p] = (rs[i] && rs[i].list) || [] })
            setCache(c)
          })
      }).catch((e: unknown) => { if (alive) setStatus(t('errRestoreFail') + errText(e)) })
    } else {
      refreshRoot()
    }
    if (workspaces && workspaces.list) {
      const snap = workspaces.list.getSnapshot()
      setWsItems((snap && snap.items) ? snap.items : [])
      const unsub = workspaces.list.subscribe(() => {
        if (!alive) return
        const s = workspaces.list.getSnapshot()
        setWsItems((s && s.items) ? s.items : [])
      })
      return () => { alive = false; unsub() }
    }
    return () => { alive = false }
  }, [])

  /**
   * 切换工作区：记录选中 id 并把项目根切到该工作区路径。
   * @param id - 工作区 workspaceId。
   */
  function selectWs(id: string): void {
    if (!id) return
    const ws = wsItems.find(w => w.workspaceId === id)
    if (!ws) return
    setCurWsId(id)
    refreshRoot(ws.path)
  }

  /**
   * 目录展开/折叠：首次展开时懒加载子节点并写缓存；折叠不删缓存（源行为）。
   * @param path - 目录相对路径。
   * @param open - 目标展开态。
   */
  function toggleDir(path: string, open: boolean): void {
    if (open && !cache[path]) {
      api<TreeResponse>('/tree?path=' + encodeURIComponent(path)).then((task) => {
        setExpanded(s => ({ ...s, [path]: true }))
        setCache(s => ({ ...s, [path]: task.list || [] }))
      }).catch(swallowTreeLoadFailure)
    } else {
      setExpanded(s => ({ ...s, [path]: open }))
    }
  }

  // 关键状态变化时持久化，切走界面/刷新后恢复上次视图。
  // 初始空态（尚无 root/opened/展开目录）不覆盖已有存档。
  React.useEffect(() => {
    const hasContent = rootPath || opened || Object.keys(expanded).some(p => expanded[p])
    if (!hasContent) return
    saveUi({ rootPath, curWsId, treeW, collapsed, opened, expanded: Object.keys(expanded).filter(p => expanded[p]) })
  }, [rootPath, curWsId, treeW, collapsed, opened, expanded])

  /**
   * 开始拖拽分隔条调整树宽（clamp 180–420），并挂 document 级移动/抬起监听。
   * @param e - 分隔条上的 mousedown 事件。
   */
  function startDrag(e: React.MouseEvent<HTMLDivElement>): void {
    e.preventDefault()
    setDragging(true)
    const startX = e.clientX
    const startW = treeW
    function onMove(ev: MouseEvent): void {
      const w = startW + (ev.clientX - startX)
      setTreeW(Math.max(180, Math.min(420, w)))
    }
    function onUp(): void {
      setDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // 翻译成功回调：刷新父目录 tree（圆点/按钮文案「重新翻译」立即出现）并更新选中节点标记。
  const onTrDone = React.useCallback((docTrRel: string): void => {
    const rel = opened && opened.path
    if (!rel) return
    setOpened(prev => prev ? { ...prev, hasDocTr: true, docTrRel } : prev)
    const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.'
    api<TreeResponse>('/tree?path=' + encodeURIComponent(parent)).then((task) => {
      const list = (task && task.list) || []
      if (parent === '.') { setTree(list); setCache(s => ({ ...s, '.': list })) }
      else setCache(s => ({ ...s, [parent]: list }))
    }).catch(swallowTreeLoadFailure)
  }, [opened && opened.path])
  const viewer = useOpenedViewer(opened || {}, onTrDone)
  // 未保存内容的离开提示（C）：编辑内容只活在内存里（`UiState` 只持久化
  // rootPath / curWsId / treeW / collapsed / opened / expanded），所以刷新或关标签页会让它**全丢**
  // —— 文件本身无损，丢的是那份还没写盘的编辑。`dirty` 期间就挂 `beforeunload`，变回 false 时卸载
  // （依赖 `dirty`，每次翻转重挂一次，不常驻监听）。
  // **覆盖边界（如实写明）**：它只拦「刷新 / 关闭标签页 / 关窗」这类**页面级离开**；
  //   * **拦不住页内切文件、切工作区、切视图** —— 那些走的是 React 状态切换，根本不触发
  //     `beforeunload`（G-4 的「切换文件静默丢弃未保存编辑」因此照旧）。
  //   * 要盖住页内切换得加应用内确认（弹窗 / 拦截 onOpen），本段不做。
  // 现代浏览器忽略自定义文案，只显示自家的通用确认话术；`preventDefault()` 是现行规范要求的写法，
  // `returnValue` 只为老浏览器（它们只看这个字段）保留。
  React.useEffect(() => {
    if (!viewer.dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent): void {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [viewer.dirty])
  const [wsMenuOpen, setWsMenuOpen] = React.useState(false)
  // 解读选择下拉（R1）：当前对象可用的解读入口（未生成→生成；已生成→重新生成，覆盖重写）。
  const [genMenuOpen, setGenMenuOpen] = React.useState(false)
  // 视图选择器下拉（R3）：悬停展开，列出其余已具备的视图。
  const [viewMenuOpen, setViewMenuOpen] = React.useState(false)
  const genItems = React.useMemo<GenItem[]>(() => {
    if (!opened) return []
    // 目录节点：只有「目录概览」一种解读产物。
    if (opened.type === 'directory')
      return [{ id: 'folder', label: opened.hasDoc ? t('genFolderRegen') : t('genFolder') }]
    // markdown 本身即文档：不生成 L2/L3（host 侧直接拒绝）。只有项目内非书库的 md 可翻译，
    // 书库内（.book/）md 没有任何解读入口 —— 菜单项为空，按钮与现状一样不弹菜单。
    if (isMd(extOf(opened.path || ''))) {
      if (!viewer.canTranslate) return []
      // 翻译进行中改读「翻译中…」并禁用，等价于原独立按钮的 disabled 态。
      return [{
        id: 'translate',
        label: viewer.trBusy ? t('btnTrLoading') : (opened.hasDocTr ? t('btnTrRegen') : t('btnTr')),
        disabled: viewer.trBusy,
      }]
    }
    const items: GenItem[] = [
      { id: 'file', label: opened.hasDoc ? t('genFileRegen') : t('genFile') },
    ]
    items.push({ id: 'src', label: opened.hasDocSrc ? t('genSrcRegen') : t('genSrc') })
    return items
  }, [opened, viewer.canTranslate, viewer.trBusy])
  // 菜单项随当前对象自动适配（R1）：切到「没有解读入口」的对象时收起残留的下拉，
  // 否则上一份文件留下的空菜单会挂在新文件上（md 与 .book/ 内的 md 都会走到这里）。
  React.useEffect(() => {
    if (!genItems.length) setGenMenuOpen(false)
  }, [genItems])
  // 翻译进行中（R1 收编后的常驻可见性）：独立翻译按钮删掉后，「翻译中」原本只在菜单项里可见，
  // 菜单关着就看不出来。这里让按钮自身进入忙碌态 —— 换成 IconLoadingOutline16、文案改「翻译中…」
  // 并禁用，菜单开着或关着都能一眼看到（菜单项仍是同一份 disabled 事实）。
  const genBusy = !!(viewer.canTranslate && viewer.trBusy)
  const genLabel = genBusy ? t('btnTrLoading') : t('btnGen')
  // 窄档（R2）：三个按钮的可见文字收进 `.fs-btnlabel`，由样式表按容器实测宽度隐藏；
  // 文字节点仍在 DOM 里，纯图标时的可访问名由 aria-label 保证（Button 透传原生属性）。
  // 气泡统一走 primitives 的 `Tooltip`（`tip()` 说明为什么锚点要加一层原生 span），
  // 相应地**去掉 `title`**：留着它会同时冒出原生那条深色长条，正是本次要消掉的「双气泡」。
  // 例外只有一个：**悬停即展开下拉的锚点不挂气泡**（解读选择与视图选择器）——它们的悬停手势
  // 已经被下拉占用（外层 `.fs-genwrap` / `.fs-viewwrap` 的 `onMouseEnter` 开菜单），再挂气泡就是
  // 悬停同时弹两个浮层。这两处改为只留 `aria-label` + 可见文字/下拉本身作可读提示。
  // 解读选择的旧 `title`（即 `a11yGen` 那条长文案）就是用户截图里压在正文上的深色长条。
  const genAnchor = (
    <Button
      size="sm"
      icon={genBusy ? <IconLoadingOutline16 /> : <IconPlusOutline16 />}
      onClick={() => { if (genItems.length) setGenMenuOpen(true) }}
      disabled={genBusy}
      aria-label={genLabel}
    >
      <span className="fs-btnlabel">{genLabel}</span>
    </Button>
  )
  // 浮层一律 portal 到 body：`.fs-hbar` 与 `.fs-hbar-mid` 都带 `overflow:hidden`（第一段为
  // 消跨列重叠加的兜底裁剪），而 `Menu` 默认是**内联**渲染（`portal = false`，见 primitives
  // `lib/types/Menu.d.ts` 与 `lib/index.js` 的 `portal ? createPortal(list, document.body) : list`）
  // ⇒ `.mr-list` 是这两条裁剪声明的后代，绝对定位在锚点下方 4px 的面板会被裁剪盒切掉大半
  //（实测可见高只剩 0–6px，视图选择器那一份在全部 3306 档里**整块不可见**），
  // 用户看到的就是「鼠标放上去看不到下拉」。
  // portal **不改变** hover 收起语义：React 的 enter/leave 按 fiber 树判定（不是几何），portal
  // 出去的面板在 React 树里仍是锚点的后代，指针移进面板不会触发锚点的 `pointerleave`
  //（用真实 react-dom 18 复现过：移到面板 0 次 leave，移到 React 树外的裸元素则必然 leave）。
  // 所以 `closeOnPointerLeave` 照旧保留。
  const genMenu = (
    <Menu
      open={genMenuOpen}
      anchor={genAnchor}
      items={genItems}
      portal
      closeOnPointerLeave
      onSelect={(id) => {
        viewer.runGen(id as GenKind)
        setGenMenuOpen(false)
      }}
      onClose={() => setGenMenuOpen(false)}
    />
  )
  // hover 展开：鼠标放到「解读选择」自动弹出选项框，移开自动收起（关闭交给 closeOnPointerLeave）。
  const genWrap = (
    <div
      className="fs-genwrap"
      onMouseEnter={() => { if (genItems.length) setGenMenuOpen(true) }}
    >
      {genMenu}
    </div>
  )
  const curWs = wsItems.find(w => w.workspaceId === curWsId)
  const curWsName = (curWs && curWs.title) || rootName || t('pickWs')
  // 折叠/刷新是**常驻纯图标**（这两个按钮没有 `.fs-btnlabel`，任何宽度下都只有图标），
  // 所以它们的提示只能靠气泡与可访问名 —— 补上原先缺的 `aria-label`（规格 §2 的现行口径：
  // 纯图标按钮 = `Button size icon` + `aria-label`；源码文本从 `title` 移到气泡里）。
  const foldBtn = tip(
    <Button
      size="sm"
      icon={<IconPanelLeftOutline16 />}
      onClick={() => setCollapsed(!collapsed)}
      aria-label={collapsed ? t('a11yExpandTree') : t('a11yCollapseTree')}
    />,
    collapsed ? t('a11yExpandTree') : t('a11yCollapseTree'),
  )
  // 工作区名也收进 label 层（本段第三档）：它比右列三个按钮更晚才让位，因为它是「当前在
  // 看哪个工作区」的标识，容器还放得下就用文字（见样式表里那条更窄的档）。
  // 文字被藏起来时，可访问名由恒定的 aria-label 给出；长名本来就被
  // `.fs-wsbtn{max-width:220px}` 截断，气泡顺带补全完整名。
  const wsAnchor = tip((
    <Button
      className="fs-wsbtn"
      icon={<IconFolderOpenOutline16 />}
      onClick={() => setWsMenuOpen(true)}
      aria-label={curWsName}
    >
      <span className="fs-btnlabel fs-wslabel">{curWsName}</span>
    </Button>
  ), curWsName)
  const wsMenu = (
    <Menu
      open={wsMenuOpen}
      anchor={wsAnchor}
      items={wsItems.map(w => ({ id: w.workspaceId, label: (w.title || basename(w.path)) + t('wsItemSep') + w.path }))}
      // 与「解读选择」同一个理由：内联面板会被 `.fs-hbar{overflow:hidden}` 裁掉（它本来就是
      // 点击式菜单，没有 hover 收起，所以 portal 不带任何交互代价）。
      portal
      onSelect={(id) => { selectWs(id); setWsMenuOpen(false) }}
      onClose={() => setWsMenuOpen(false)}
    />
  )
  // 刷新也是常驻纯图标：同样补 `aria-label` + 气泡（原先只有 `title`）。
  const refreshBtn = tip(
    <Button
      size="sm"
      icon={<IconRefreshOutline16 />}
      onClick={() => refreshRoot()}
      aria-label={t('a11yRefresh')}
    />,
    t('a11yRefresh'),
  )
  // 视图选择器（R3）：单个按钮 + 悬停下拉，取代原来一排 Pill。
  // 按钮文字恒等于当前视图名（`labLabelKey(viewer.mode)`），与所显示内容不分离；点击按钮主体
  // 即确认按钮所示视图 —— `setMode` 传同一个 mode，React 同值 bail out，是真正的 no-op
  // （用户明确要求：不伴随 `setEditMode(false)`，否则「点击」就成了会改变显示的操作）。
  // 下拉只列「其余已具备」的视图，顺序沿用 viewer.modes 的固定顺序：
  // 源码 → 文件摘要 → 源码注解 → 文章翻译。
  const viewIsDir = !!(opened && opened.type === 'directory')
  const viewItems = viewer.modes
    .filter(m => m !== viewer.mode)
    .map(m => ({ id: m, label: t(labLabelKey(m, viewIsDir)) }))
  const viewWrap = opened
    ? (
      <div className="fs-viewwrap" onMouseEnter={() => { if (viewItems.length) setViewMenuOpen(true) }}>
        <Menu
          open={viewMenuOpen}
          anchor={(
            <Button
              className="fs-viewbtn"
              size="sm"
              onClick={() => viewer.setMode(viewer.mode)}
              // 这里**不挂气泡**（也不留 `title`）：悬停这个按钮就是展开视图下拉的手势
              // （外层 `.fs-viewwrap` 的 `onMouseEnter`），再挂气泡会同时弹两个浮层。
              // 它的可读提示因此来自按钮上那串恒等于当前视图名的文字 + 悬停即现的下拉。
            >
              {t(labLabelKey(viewer.mode, viewIsDir))}
            </Button>
          )}
          items={viewItems}
          // 同「解读选择」：视图中列也带 `overflow:hidden`（第一段为防视图选择器画到右列加的），
          // 内联面板会被整块裁掉，故一并 portal —— hover 收起语义不受影响（理由同上）。
          portal
          closeOnPointerLeave
          // 选下拉项：切换视图并退出编辑态（沿用原 Pill 的行为）。
          onSelect={(m) => { viewer.setMode(m as ViewMode); viewer.setEditMode(false); setViewMenuOpen(false) }}
          onClose={() => setViewMenuOpen(false)}
        />
      </div>
    )
    : null
  // 顶栏路径：从项目头（root）开始显示完整路径，如 dsh-plugin-file-system/src/shared/locale.js；
  // 打开的是项目根目录（path 为 '.'）时只显示项目名，避免出现「名称/.」。
  const openedPath = opened ? (opened.path || '') : ''
  const openedFullPath = openedPath && openedPath !== '.'
    ? (rootName ? rootName + '/' + openedPath : openedPath)
    : (rootName || openedPath)
  const pathLabel = opened ? <div className="fs-hd-path">{openedFullPath}</div> : null
  // 编辑与保存**合成同一个按钮**（用户裁决 B）：平时点它进编辑态，有未保存内容时点它保存。
  // 能合并的依据是「保存即回到查看态」本来就闭环 —— `save()` 里带着 `setEditMode(false)`，
  // 所以合并不存在「卡在编辑态」的死角；而平常（查看）状态下「保存」按钮点下去也没有用途。
  // 图标与文案随态切换，两个图标都来自 primitives（编辑＝铅笔、保存＝DSH 保存惯例的 ✓）。
  // 合并后不再有独立的「查看」按钮：它原本只做「不保存就退回查看态」，而那条路径已由
  // 保存/切视图覆盖（代价见报告：编辑内容**没有**「放弃编辑」入口）。这一点在改成 `canSave`
  // 之后**更彻底**：只要还有未保存内容，按钮就直达保存，退回查看态不再有专用入口。
  // 判据是 `canSave`，而不是只看 `editMode`（用户裁决 2.2）：视图选择器的下拉 `onSelect` 会
  // `setEditMode(false)`（R3 既有行为），而 `edit` 只在**切换文件**时重播种 ⇒ 「进过编辑态、
  // 留了改动、又退回查看态」时 `dirty` 仍在而 `editMode` 已为 false。只看 `editMode` 的话按钮
  // 显示「编辑」，保存要点两下（先回编辑态、再点同一个按钮）；`canSave` 让这一态直接显示
  // 「✓ 保存」，点一下即落地。代价：编辑态与「脏查看态」现在共用同一个外观。
  // 文字进 `.fs-btnlabel` 由样式表按容器宽度隐藏，纯图标态的可访问名靠恒定的 aria-label。
  const canSave = viewer.editMode || viewer.dirty
  const editActions = (opened && viewer.hasSource && viewer.mode === 'source')
    ? [
      viewer.dirty ? <span key="dirty" className="fs-dirty">{t('a11yDirty')}</span> : null,
      tip((
        <Button
          icon={canSave ? <IconCheckOutline16 /> : <IconEditOutline16 />}
          onClick={canSave ? viewer.save : viewer.toggleEdit}
          aria-label={canSave ? t('btnSave') : t('btnEdit')}
        >
          <span className="fs-btnlabel">{canSave ? t('btnSave') : t('btnEdit')}</span>
        </Button>
      ), canSave ? t('btnSave') : t('btnEdit'), 'edit'),
    ]
    : null

  // ---- 分栏（R4）----
  // 语义（上游裁决，照此实现）：右侧副本 = **视图类型冻结、内容数据实时、强制只读**。
  //   冻结：视图类型在开启那一刻记进该 path 的 `SplitState.mode`，左侧之后切视图只影响左侧；
  //   实时：数据字段（source / docData / annotData / trData / fold）共用同一个 viewer，
  //         左侧编辑保存后右侧内容跟着刷新；
  //   只读：`editMode` 恒为 false ⇒ `FsPane` 天然只走查看分支，没有编辑区、没有保存/生成入口
  //         （本段不为右侧新写任何渲染分支，右侧就是同一个 FsPane）。
  // 它不是「历史快照」：右侧没有自己的一份数据副本。
  const splitState = openedPath ? splits[openedPath] : undefined
  const splitOn = !!(splitState && splitState.on)
  const splitViewer: ViewerState | null = (splitState && splitState.on)
    ? { ...viewer, mode: splitState.mode, editMode: false }
    : null
  // 右侧窗格只改 flex-grow：它与 `.fs-main{flex:1}` 同为 `flex-basis:0`，故两侧宽度比 = grow 比，
  // 占比 p 对应 grow = p / (1 − p)（p ∈ [0.2, 0.8]，分母恒不为 0）。
  const splitGrow = splitState ? splitState.ratio / (1 - splitState.ratio) : 1

  /**
   * 分栏开关：同一个按钮再点一次即关闭（R4）。开启时把当前视图类型冻结进该 path 的记录
   * ——「把当前显示的视图复制一份只读副本到右侧」；关闭只把 `on` 置 false，比例与冻结的
   * 视图类型都留着，再开时沿用（「拖拽比例同样按文件记忆」）。
   */
  function toggleSplit(): void {
    if (!openedPath) return
    setSplits((s) => {
      const current = s[openedPath]
      const on = !(current && current.on)
      return {
        ...s,
        [openedPath]: {
          on,
          // 开启时冻结当前视图类型；关闭时 `current` 必然存在，保留原来那一份。
          mode: current && !on ? current.mode : viewer.mode,
          ratio: current ? current.ratio : SPLIT_RATIO_DEFAULT,
        },
      }
    })
  }

  /**
   * 右侧分栏的拖拽（R4）：与左侧树宽同一套做法（document 级监听、按 G-7 既有行为不做卸载
   * 清理），差别只在记的是**占比**而不是像素宽度 —— 窗口缩放后仍按比例复原。
   * @param e - 右侧分隔条上的 mousedown 事件。
   */
  function startSplitDrag(e: React.MouseEvent<HTMLDivElement>): void {
    if (!openedPath) return
    e.preventDefault()
    const startX = e.clientX
    const pane = e.currentTarget.nextElementSibling
    const leftPane = e.currentTarget.previousElementSibling
    if (!(pane instanceof HTMLElement) || !(leftPane instanceof HTMLElement)) return
    const startRight = pane.getBoundingClientRect().width
    const startLeft = leftPane.getBoundingClientRect().width
    // 两侧同为 `flex:1 1 0`，拖拽期间弹性宽之和不变 ⇒ 占比的分母就是这个和，而不是「新右宽 + 左宽」。
    const total = startRight + startLeft
    if (!(total > 0)) return
    setDraggingSplit(true)
    function onMove(ev: MouseEvent): void {
      const right = startRight - (ev.clientX - startX)
      const ratio = Math.max(SPLIT_RATIO_MIN, Math.min(SPLIT_RATIO_MAX, right / total))
      setSplits((s) => {
        const current = s[openedPath]
        if (!current) return s
        return { ...s, [openedPath]: { ...current, ratio } }
      })
    }
    function onUp(): void {
      setDraggingSplit(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // 分栏按钮（R4）：放右列 —— 顶栏分工是「左＝环境、中＝状态、右＝操作」。它与右列三个按钮
  // 共用同一套窄档收纳（文字进 `.fs-btnlabel`，≤672px 的档只留图标），可访问名由恒定的
  // aria-label 给出；没有打开对象时不可用（没有可复制的视图）。
  // 分栏按钮：气泡文案是 `a11ySplit`（说清「再点一次关闭」这个非通用交互），而按钮自己的
  // 可访问名仍是恒定的 `btnSplit`（与它可见的「分栏」二字一致）。
  const splitBtn = tip((
    <Button
      size="sm"
      icon={<SplitGlyph />}
      onClick={toggleSplit}
      disabled={!opened}
      aria-label={t('btnSplit')}
    >
      <span className="fs-btnlabel">{t('btnSplit')}</span>
    </Button>
  ), t('a11ySplit'))
  const splitBar = splitOn
    ? <div className={'fs-split' + (draggingSplit ? ' active' : '')} onMouseDown={startSplitDrag} />
    : null
  const splitPane = (opened && splitOn && splitViewer)
    ? (
      <div className="fs-splitpane" style={{ flexGrow: splitGrow }}>
        <FsPane opened={opened} viewer={splitViewer} key={'split-' + openedPath} />
      </div>
    )
    : null

  const editor = opened
    ? <FsPane opened={opened} viewer={viewer} key={opened.path} />
    : (
      <div className="fs-main">
        {status ? <div className="fs-load">{status}</div> : null}
      </div>
    )

  // 右侧分栏（R4）的两件套：分隔条 + 只读副本窗格。它们与「文件树折叠」是两个互不相干的开关，
  // 所以**两个分支都必须渲染**——先前只把它们写进「未折叠」分支，于是折叠文件树之后再点「分栏」，
  // 开关状态翻转了、右侧窗格却不出现（`splitOn` 为真而 `.fs-splitpane` 不在 DOM 里）。
  // 三者的兄弟顺序在两处必须一致（editor → splitBar → splitPane）：拖拽回调正是靠
  // `previousElementSibling` / `nextElementSibling` 取左右窗格来测宽度的。
  const splitParts = <>{splitBar}{splitPane}</>

  let body: React.JSX.Element
  if (!collapsed) {
    const side = (
      <div className="fs-side" style={{ width: treeW }}>
        <FsTree
          tree={tree}
          expanded={expanded}
          cache={cache}
          selected={opened}
          onToggle={toggleDir}
          onOpen={n => setOpened(n)}
        />
      </div>
    )
    const split = <div className={'fs-split' + (dragging ? ' active' : '')} onMouseDown={startDrag} />
    body = <div className="fs-body">{side}{split}{editor}{splitParts}</div>
  } else {
    body = <div className="fs-body">{editor}{splitParts}</div>
  }

  const hbar = (
    <div className="fs-hbar">
      <div className="fs-hbar-left">
        {wsMenu}
        <div className="fs-hd-actions">{refreshBtn}{foldBtn}</div>
      </div>
      <div className="fs-hbar-mid">
        {viewWrap}
        <div className="fs-hbar-path">{pathLabel}</div>
      </div>
      {/* 翻译入口（R1）已并入「解读选择」菜单：这里原来是独立翻译按钮 trBtn 的位置。 */}
      <div className="fs-hbar-right">{splitBtn}{genWrap}{editActions}</div>
    </div>
  )

  return (
    <div className="fs-wrap" data-conversation-composer-overlay="">
      {hbar}
      {body}
    </div>
  )
}

// ---- 样式 ----
// 迁移源 `src/client/index.js:695-753` 逐字保留；按决策 D-8 例外 a 删除 4 个
// 无任何 JS 引用的死类（`.fs-folder-gen` / `.fs-card-actions` / `.fs-card-src` / `.fs-card-err`）。
// R1/R3 段另删两处随 JSX 改动失效的类：`.fs-tabs`（胶囊组被视图选择器取代）与
// `.fs-badge`（扩展名角标改用 primitives 的 Tag）；同时新增 `.fs-viewwrap` 与 `.fs-exttag`，
// 两者只承担布局（flex 项定位），字号底色等观感一律交给 primitives。
// 上述删除之外，顶栏与左侧树为修窄宽度重叠另有偏差：`.fs-hbar` 改 auto/minmax(0,1fr)/auto
// 分列并加裁剪兜底，左右列去掉 `min-width:0`（保留 min-content 下限），`.fs-hbar-mid` 加
// `overflow:hidden`（防视图选择器画到右列），`.fs-side` 加 `max-width:50%`。
const CSS = [
  '.fs-wrap{display:flex;flex-direction:column;height:100%;font-size:13px;color:var(--dsw-alias-label-primary,#0f1115);overflow:hidden;min-height:0;box-sizing:border-box;padding:2px 14px 8px;--fs-bottom-clearance:calc(var(--dsh-composer-height,152px) + 16px)}',
  '.fs-hbar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:0 10px;flex:none;min-width:0;padding:6px 0;overflow:hidden;container-type:inline-size}',
  // 上面这条 `overflow:hidden` 是跨列重叠归零的兜底裁剪，但它同时是**祖先裁剪盒**：任何从顶栏
  // 溢出的浮层都会被切掉（`Menu` 的下拉是绝对定位在锚点下方 4px 的 `.mr-list`，首当其冲）。
  // 因此顶栏三处 `Menu` 一律走 `portal`（挂到 `document.body`、fixed 定位、z-index 1100），
  // 别改回内联渲染 —— 内联就是「鼠标放上去看不到下拉」的成因；`.fs-hbar-mid` 那条同理。
  '.fs-hbar-left{justify-self:start;display:flex;align-items:center;gap:8px}',
  '.fs-hd-actions{flex:none;display:flex;align-items:center;gap:2px;min-width:0}',
  // 顶栏气泡（`Tooltip`）的锚点层：`Tooltip` 需要一个能挂 ref 的**原生**元素
  //（primitives 的 `Button` 是普通函数组件，React 18 下挂不上 ref，见 `tip()` 的注释），
  // 所以每个挂气泡的按钮外面包这一层。它只做收缩包裹（inline-flex + 居中），
  // 让按钮照旧当 flex 项参与列宽分配 —— 与 `Menu` 自己那层 `.mr` root 同一个做法
  //（`.mr` 的 `position:relative;display:inline-flex`，探针已按「宽度与裸按钮等价」处理）。
  // 它不写 `min-width:0`：写了会把内层按钮的 min-content 下限抹掉，回到「按钮溢出压兄弟」的老问题。
  '.fs-tipwrap{display:inline-flex;align-items:center}',
  '.fs-wsbtn{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.fs-hbar-mid{display:flex;align-items:center;gap:10px;min-width:0;overflow:hidden}',
  '.fs-hbar-path{flex:1;min-width:0;display:flex;align-items:center;justify-content:center}',
  '.fs-hd-path{display:inline-block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.85));font-size:12px;line-height:20px}',
  '.fs-hbar-right{justify-self:end;display:flex;align-items:center;gap:6px}',
  // `.fs-genwrap` 刻意**不给** `min-width:0`：给了它，flex 会把包装压到近 0 宽，而里面 36px 的
  // 「解读选择」按钮会溢出盖住同列的「● 未保存」标记（实测相交 411px²，即 `PROGRESS.md` §5 #9）；
  // 不给它，包装保住按钮的 min-content，代价是右列整体更早触底（实测下界由面板 284px 升到 314px，
  // 仍在门禁的 360px 以内），换来同列重叠从 153 档/场景降到 0。
  '.fs-genwrap{display:inline-flex;align-items:center}',
  '.fs-viewwrap{display:inline-flex;align-items:center;min-width:0;flex:none}',
  // 窄档（R2）：按钮的可见文字统一收进 `.fs-btnlabel`，由容器查询隐藏 —— 文字节点留在 DOM 里，
  // 纯图标态的可访问名交给各按钮的 aria-label。`.fs-btnlabel` 只做不换行（宽度随文字自然）。
  '.fs-btnlabel{white-space:nowrap}',
  // 分档阈值就写在这里，是唯一的真相源；JS 不持有任何像素常量。
  // 第一档（右列四个按钮图标化，含 R4 的分栏）：这一档要解决的不再是「右列被整块裁掉」，
  // 而是四段文字一起把中列挤到 0 —— 实测最坏场景（长工作区名 + 长路径 + 四字视图名 +
  // 五字菜单项）在面板 701–720 这 20 档里中列视图名被 `.fs-hbar-mid{overflow:hidden}` 裁掉，
  // 右列同时出现部分裁切；收掉这四个按钮的文字后该窗口整段消失（S2/S6 的中列被裁区间
  // 由面板 200–720 收到 200–400）。
  // 阈值 760 的标定：窗口上界是面板 720 ⇒ 阈值不得低于 hbar 692px（= 720 − `.fs-wrap`
  // 左右内边距 28px）；按同样的约 8% 字体余量取整为 760。逐档 diff 实测过：760 相对 672
  // **没有任何一档变差**（变差 0 档），只有 701–720 变好。
  // 用容器查询而不是「测出溢出再打标记」是刻意的：阈值只随容器宽度单调变化，
  // 不会因为图标化让内容变窄而反复撤销标记（滞回振荡）。
  // 这里排除 `.fs-wslabel`：工作区名不属于本档，它比这四个按钮晚一档才让位。
  '@container (max-width:760px){.fs-btnlabel:not(.fs-wslabel){display:none}}',
  // 第二档（工作区名让位）：四个按钮图标化后，左列工作区按钮所在的 `Menu` 根 `span`
  // 成了唯一的 min-content 大头 —— 它把左列顶到 284.8px，中列被 `minmax(0,1fr)` 让到 0、
  // 右列被挤出容器整块裁掉。收掉它的文字后左列降到 126px，最坏场景的右列下界由面板 459px 压到 314px。
  // 阈值 550 的标定（第三段 b 由 470 上调，上游裁决）：470 时工作区名在面板 499px 就恢复可见，
  // 而右列元素要到面板 535px 才完全不被裁 ⇒ 499–534 这 36 档里保存按钮右边缘缺 17px
  // （可点，属视觉级残缺；基线 S1 19 档 / S2 36 档，合计 110 档）。阈值提到 550（面板 578px）后，
  // 工作区名可见区间整段落在「右列完整」的区间里：499–534 的残缺全部消失（0 档），中列被裁
  // 区间同时由面板 200–517 收窄到 200–358（只上调阈值、不含分栏按钮时的隔离实测）。
  // 两档之间不许留缝：实测阈值取 428px 时，缝里的面板 457–459px 会重新出现右列被裁；
  // 550 远在其上，缝的条件（工作区名可见区间跨过右列完整下界）不成立。
  '@container (max-width:550px){.fs-wslabel{display:none}}',
  '.fs-chev{transition:transform 150ms var(--ds-ease-in-out,ease)}',
  '.fs-chev-open{transform:rotate(90deg)}',
  '.fs-body{display:flex;flex-direction:row;flex:1;min-height:0}',
  '.fs-side{display:flex;flex-direction:column;min-height:0;max-width:50%;border-right:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2))}',
  '.fs-panel{flex:1;min-height:0;overflow:auto;padding:4px;padding-bottom:var(--fs-bottom-clearance,0px)}',
  '.fs-split{flex:none;width:5px;cursor:col-resize;background:transparent;transition:background 120ms}',
  '.fs-split:hover,.fs-split.active{background:rgba(127,127,127,.12)}',
  '.fs-tr{display:flex;align-items:center;gap:6px;height:34px;box-sizing:border-box;padding:0 8px;border-radius:8px;cursor:pointer;user-select:none;white-space:nowrap;color:var(--dsw-alias-label-primary,#0f1115);position:relative}',
  '.fs-tr:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.fs-tr.sel{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18))}',
  '.fs-slot{flex:none;width:16px;height:20px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}',
  '.fs-folder{color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}',
  '.fs-tr.fs-open .fs-folder{color:var(--dsw-alias-state-business-primary,#3b82f6)}',
  '.fs-chevslot{display:none;color:var(--dsw-alias-label-caption,#adb2b8)}',
  '.fs-tr:hover .fs-chevslot{display:inline-flex}',
  '.fs-tr:hover .fs-folder{display:none}',
  '.fs-chev{transition:transform 150ms var(--ds-ease-in-out,ease)}',
  '.fs-chev-open{transform:rotate(90deg)}',
  '.fs-title{min-width:0;overflow:hidden;text-overflow:ellipsis;flex:1;font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115)}',
  // 扩展名角标改用官方 Tag（tone=quiet：纯文字无底色）；这里只留布局用的 flex:none，
  // 字号/行高/底色/圆角一律交给 primitives（原 .fs-badge 全部样式已删除）。
  '.fs-exttag{flex:none}',
  '.fs-empty{padding:16px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}',
  '.fs-main{flex:1;min-width:0;overflow:hidden;display:flex;flex-direction:column;padding-bottom:var(--fs-bottom-clearance,0px)}',
  // 右侧分栏窗格（R4）：只是 `.fs-main` 的外壳，用它给右侧单独分宽度。它与 `.fs-main` 同为
  // `flex:1 1 0`（宽度比 = flex-grow 比），占比由 JSX 的 inline `flexGrow` 给（p ⇒ p/(1−p)）。
  '.fs-splitpane{flex:1 1 0;min-width:0;display:flex;flex-direction:column}',
  '.fs-bscroll{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}',
  '.fs-fmcard{margin:0 0 12px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.06));padding:10px 14px}',
  '.fs-fmhead{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8));font-weight:600;margin-bottom:6px}',
  '.fs-fmrow{display:flex;gap:8px;padding:2px 0;font-size:12px;line-height:20px}',
  '.fs-fmkey{flex:none;min-width:120px;color:var(--dsw-alias-state-business-primary,#3b82f6);font-family:ui-monospace,monospace}',
  '.fs-fmval{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary,#0f1115)}',
  '.fs-vbody{flex:1;min-height:0;overflow:auto;padding:6px 14px var(--fs-bottom-clearance,0px)}',
  '.fs-code{margin:0;padding:12px;padding-bottom:var(--fs-bottom-clearance,0px);white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:12px;flex:1;overflow:auto;line-height:1.6}',
  '.fs-area{flex:1;padding:12px;padding-bottom:var(--fs-bottom-clearance,0px);border:none;outline:none;background:transparent;color:inherit;font-family:ui-monospace,monospace;font-size:13px;resize:none;line-height:1.6}',
  '.fs-dirty{color:#e0a020;font-size:11px;flex:none}',
  '.fs-load{flex:1;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8));font-size:12px}',
  '.fs-docmark{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#3b82f6);opacity:.9;cursor:pointer;flex-shrink:0}',
  '.fs-folder-card{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:40px;text-align:center;overflow:auto;color:var(--dsw-alias-label-secondary,rgba(15,17,21,.65))}',
  '.fs-folder-card-ti{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}',
  '.fs-folder-card-desc{font-size:13px;max-width:420px;line-height:1.6}',
  '.fs-folder-card-path{font-size:13px;color:var(--dsw-alias-label-secondary,rgba(15,17,21,.65));display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:center;max-width:560px}',
  '.fs-folder-card-path-name{font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}',
  '.fs-folder-card-path-sep{color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}',
  '.fs-folder-card-path-rel{color:var(--dsw-alias-label-secondary,rgba(15,17,21,.65));word-break:break-all}',
].join('\n')

/**
 * 挂载 client 半边：注入样式表 + 注册 conversation.view 槽位（id `fs`、order 12）。
 * @param ctx - 运行时提供的客户端上下文。
 */
export function apply(ctx: Context): void {
  const slots = ctx.get('slots') as SlotsSurface | undefined
  if (slots === undefined) throw new Error('slots service missing — client cannot register conversation.view')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'fs'
    tag.textContent = CSS
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'fs styles')
  slots.inject('conversation.view', () => slots.register({
    name: 'conversation.view',
    id: 'fs',
    order: 12,
    label: () => t('slotLabel'),
    // The workspaces service is read on every render, exactly as the migration
    // source did (`src/client/index.js:770` read it inside the view callback).
    // Capturing it once at apply time would freeze whatever the registry held
    // then and never pick up a later registration.
  }, props => <FsView {...props} workspaces={ctx.get('workspaces') as WorkspacesSurface | undefined} />))
}
