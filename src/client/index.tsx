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
  Button, CodeBlock, IconBrowseOutline16, IconChevronRightOutline14, IconEditOutline16,
  IconFolderClose16, IconFolderOpen16, IconFolderOpenOutline16, IconPanelLeftOutline16,
  IconPlusOutline16, IconRefreshOutline16, MarkdownText, Menu, Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
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

/** 生成解读的三种文档类型：folder=目录概览(L1) / file=文件摘要(L2) / src=源码注解(L3)。 */
type GenKind = 'folder' | 'file' | 'src'

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
        {extBadge(node.name) ? <span className="fs-badge">{extBadge(node.name)}</span> : null}
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

// 查看模式页签（「预览 + 解读」框架）：doc 按对象类型区分——文件夹→目录概览，文件→文件摘要；
// annot→源码注解；tr→文章翻译（译文，仅项目内 md）；source→源码（预览+编辑）。名称与 GLOSSARY.md 保持一致。
// label 文案由 t(labLabelKey(mode, isDir)) 取值（字典唯一真相源）。

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
  const modes: ViewMode[] = []
  if (opened.hasDoc || docData != null) modes.push('doc')
  if (opened.hasDocSrc || annotData != null) modes.push('annot')
  if (canTranslate && (opened.hasDocTr || trData != null)) modes.push('tr')
  if (hasSource) modes.push('source')

  React.useEffect(() => {
    let alive = true
    aliveRef.current = true
    setSource(null); setDocData(null); setAnnotData(null); setTrData(null)
    setEditMode(false); setDirty(false); setStatus('')
    setFold({ state: 'idle', content: '' })
    setGenState('idle'); setTrBusy(false)
    // 点击文件优先显示顺序：文件摘要 → 原文(源码) → 源码注解。有文件摘要默认进 doc；否则默认原文。
    setMode(opened.hasDoc ? 'doc' : (hasSource ? 'source' : (opened.hasDocSrc ? 'annot' : 'source')))
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
   * 统一生成入口：kind ∈ folder(目录概览/L1) | file(文件摘要/L2) | src(源码注解/L3)。
   * POST /gen-doc 触发后台子 agent → 轮询任务 → 成功后按 task.docRel 经 /read 读回文档，
   * 落到对应查看状态（folder→fold、file→docData+doc 模式、src→annotData+annot 模式）。
   * @param kind - 要生成的文档类型。
   */
  function runGen(kind: GenKind): void {
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

/** FsView 的 props：`workspaces` 由注册处显式注入；槽位透传的其它字段被忽略。 */
interface FsViewProps {
  workspaces?: WorkspacesSurface | undefined
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
  const [wsMenuOpen, setWsMenuOpen] = React.useState(false)
  // 整合生成下拉：当前对象可生成的文档类型（未生成→生成；已生成→重新生成，覆盖重写）。
  const [genMenuOpen, setGenMenuOpen] = React.useState(false)
  const isSelFile = !!(opened && opened.type !== 'directory')
  const isSelMd = isSelFile && isMd(extOf(opened.path || ''))
  const genItems = React.useMemo<{ id: GenKind; label: string }[]>(() => {
    if (!opened) return []
    if (opened.type === 'directory')
      return [{ id: 'folder', label: opened.hasDoc ? t('genFolderRegen') : t('genFolder') }]
    if (isSelMd) return []
    const items: { id: GenKind; label: string }[] = [
      { id: 'file', label: opened.hasDoc ? t('genFileRegen') : t('genFile') },
    ]
    items.push({ id: 'src', label: opened.hasDocSrc ? t('genSrcRegen') : t('genSrc') })
    return items
  }, [opened, isSelMd])
  const genAnchor = (
    <Button
      size="sm"
      icon={<IconPlusOutline16 />}
      onClick={() => { if (genItems.length) setGenMenuOpen(true) }}
      title={t('a11yGen')}
    >
      {t('btnGen')}
    </Button>
  )
  const genMenu = (
    <Menu
      open={genMenuOpen}
      anchor={genAnchor}
      items={genItems}
      closeOnPointerLeave
      onSelect={(id) => {
        viewer.runGen(id as GenKind)
        setGenMenuOpen(false)
      }}
      onClose={() => setGenMenuOpen(false)}
    />
  )
  // hover 展开：鼠标放到「生成解读」自动弹出选项框，移开自动收起（关闭交给 closeOnPointerLeave）。
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
  const foldBtn = (
    <Button
      size="sm"
      icon={<IconPanelLeftOutline16 />}
      onClick={() => setCollapsed(!collapsed)}
      title={collapsed ? t('a11yExpandTree') : t('a11yCollapseTree')}
    />
  )
  const wsAnchor = (
    <Button
      className="fs-wsbtn"
      icon={<IconFolderOpenOutline16 />}
      onClick={() => setWsMenuOpen(true)}
    >
      {curWsName}
    </Button>
  )
  const wsMenu = (
    <Menu
      open={wsMenuOpen}
      anchor={wsAnchor}
      items={wsItems.map(w => ({ id: w.workspaceId, label: (w.title || basename(w.path)) + t('wsItemSep') + w.path }))}
      onSelect={(id) => { selectWs(id); setWsMenuOpen(false) }}
      onClose={() => setWsMenuOpen(false)}
    />
  )
  const refreshBtn = (
    <Button
      size="sm"
      icon={<IconRefreshOutline16 />}
      onClick={() => refreshRoot()}
      title={t('a11yRefresh')}
    />
  )
  const tabs = opened
    ? (
      <div className="fs-tabs">
        {viewer.modes.map(m => (
          <Pill
            key={m}
            active={viewer.mode === m}
            onClick={() => { viewer.setMode(m); viewer.setEditMode(false) }}
          >
            {t(labLabelKey(m, opened.type === 'directory'))}
          </Pill>
        ))}
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
  const editActions = (opened && viewer.hasSource && viewer.mode === 'source')
    ? [
      viewer.dirty ? <span key="dirty" className="fs-dirty">{t('a11yDirty')}</span> : null,
      <Button key="edit" icon={<IconEditOutline16 />} onClick={viewer.toggleEdit}>{viewer.editMode ? t('btnView') : t('btnEdit')}</Button>,
      <Button key="save" onClick={viewer.save}>{t('btnSave')}</Button>,
    ]
    : null
  // 翻译按钮：仅项目内 md 文档（书库内 .book/ 文档不翻译，用户确认）。已译 → 重新翻译。
  const trBtn = (opened && viewer.canTranslate)
    ? (
      <Button
        size="sm"
        onClick={() => viewer.runTranslate()}
        disabled={viewer.trBusy}
        title={viewer.trBusy ? t('a11yTrLoading') : (opened.hasDocTr ? t('a11yTrRegen') : t('a11yTrNew'))}
      >
        {viewer.trBusy ? t('btnTrLoading') : (opened.hasDocTr ? t('btnTrRegen') : t('btnTr'))}
      </Button>
    )
    : null

  const editor = opened
    ? <FsPane opened={opened} viewer={viewer} key={opened.path} />
    : (
      <div className="fs-main">
        {status ? <div className="fs-load">{status}</div> : null}
      </div>
    )

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
    body = <div className="fs-body">{side}{split}{editor}</div>
  } else {
    body = <div className="fs-body">{editor}</div>
  }

  const hbar = (
    <div className="fs-hbar">
      <div className="fs-hbar-left">
        {wsMenu}
        <div className="fs-hd-actions">{refreshBtn}{foldBtn}</div>
      </div>
      <div className="fs-hbar-mid">
        <div className="fs-tabs">{tabs}</div>
        <div className="fs-hbar-path">{pathLabel}</div>
      </div>
      <div className="fs-hbar-right">{trBtn}{genWrap}{editActions}</div>
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
const CSS = [
  '.fs-wrap{display:flex;flex-direction:column;height:100%;font-size:13px;color:var(--dsw-alias-label-primary,#0f1115);overflow:hidden;min-height:0;box-sizing:border-box;padding:2px 14px 8px;--fs-bottom-clearance:calc(var(--dsh-composer-height,152px) + 16px)}',
  '.fs-hbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:0 10px;flex:none;min-width:0;padding:6px 0}',
  '.fs-hbar-left{justify-self:start;display:flex;align-items:center;gap:8px;min-width:0}',
  '.fs-hd-actions{flex:none;display:flex;align-items:center;gap:2px;min-width:0}',
  '.fs-wsbtn{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.fs-hbar-mid{display:flex;align-items:center;gap:10px;min-width:0}',
  '.fs-tabs{flex:none;display:flex;align-items:center;gap:4px}',
  '.fs-hbar-path{flex:1;min-width:0;display:flex;align-items:center;justify-content:center}',
  '.fs-hd-path{display:inline-block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.85));font-size:12px;line-height:20px}',
  '.fs-hbar-right{justify-self:end;display:flex;align-items:center;gap:6px;min-width:0}',
  '.fs-genwrap{display:inline-flex;align-items:center;min-width:0}',
  '.fs-chev{transition:transform 150ms var(--ds-ease-in-out,ease)}',
  '.fs-chev-open{transform:rotate(90deg)}',
  '.fs-body{display:flex;flex-direction:row;flex:1;min-height:0}',
  '.fs-side{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2))}',
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
  '.fs-badge{flex:none;font-size:10px;line-height:16px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));border-radius:4px;padding:0 5px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}',
  '.fs-empty{padding:16px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}',
  '.fs-main{flex:1;min-width:0;overflow:hidden;display:flex;flex-direction:column;padding-bottom:var(--fs-bottom-clearance,0px)}',
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
