// 宿主内部包 `@deepseek-ai/dsh-client-ui-primitives` 的最小类型契约（vendored）。
//
// 为什么需要它
// ------------
// 该包**不是 npm registry 上的发布包**：它是 deepseek-harness 主仓的 workspace 成员
// （`packages/client/ui-primitives`，产物 `lib/types/index.d.ts` + `lib/index.js`），
// 只随 DSH 安装分发。本仓在 `package.json` 里把它声明为 **optional peer**，
// 而 optional peer 不会被 `npm install` 安装；因此 clone + `npm install` 之后，
// `tsc -p tsconfig.client.json` 会以 TS2307 失败——门禁不可复现。
//
// 运行时并不受此影响：client 半边被打包成 `client/client.js` 后由 web shell 的
// 冻结模块表（seed 表）解析该模块，不经过 node_modules。这纯粹是**类型期**问题，
// 所以本文件只补类型，不补实现。
//
// 维护约定
// --------
// * 真源：`deepseekHARNESS/packages/client/ui-primitives/src/**`，经 `pnpm run build`
//   发射到该包 `lib/types/**`。
// * 本文件**只声明本仓 `src/client/index.tsx` 实际用到的导出**，逐字段与真源对齐
//   （含 `exactOptionalPropertyTypes` 需要的显式 `| undefined`）。新增用到的导出时
//   必须同步补齐，否则类型检查会以 TS2305 失败——这是刻意的：漂移即报警。
// * 上游改签名而本文件未同步时**不会自动报警**（`paths` 优先于 node_modules 解析）。
//   代价与检测方式见交付报告「局限与已知代价」。
//
// 与真源的差异（仅此两处，均不改变调用点可见的类型）
// --------------------------------------------------
// 1. 去掉真源里的 `import 'katex/dist/katex.min.css'` 副作用导入：katex 是
//    ui-primitives 的 devDependency，本仓不装它，保留会让类型检查失败。
// 2. 把真源 `index.d.ts` 的 re-export 结构（`./Button.tsx` 等）拍平成单文件。

import type { ButtonHTMLAttributes, MemoExoticComponent, ReactNode, Ref } from 'react'

// ---- icons（真源 `src/icons/props.ts`）----

/** Shared props for every ic_ds_* icon component. */
export interface IconProps {
  /** Square edge in px; defaults to the glyph's own drawn size. */
  size?: number | undefined
  /** Extra class for layout placement; color rides currentColor. */
  className?: string | undefined
}

export declare const IconBrowseOutline16: (props: IconProps) => import('react').JSX.Element
export declare const IconChevronRightOutline14: (props: IconProps) => import('react').JSX.Element
export declare const IconEditOutline16: (props: IconProps) => import('react').JSX.Element
export declare const IconFolderClose16: (props: IconProps) => import('react').JSX.Element
export declare const IconFolderOpen16: (props: IconProps) => import('react').JSX.Element
export declare const IconFolderOpenOutline16: (props: IconProps) => import('react').JSX.Element
export declare const IconPanelLeftOutline16: (props: IconProps) => import('react').JSX.Element
export declare const IconPlusOutline16: (props: IconProps) => import('react').JSX.Element
export declare const IconRefreshOutline16: (props: IconProps) => import('react').JSX.Element

// ---- Button（真源 `src/Button.tsx`）----

/** Visual variant, each backed by its --dsw-alias-button-* token family. */
export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'

export declare function Button(props: {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  icon?: ReactNode
  className?: string | undefined
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>): import('react').JSX.Element

// ---- Pill（真源 `src/Pill.tsx`）----

export declare function Pill(props: {
  active?: boolean
  className?: string | undefined
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>): import('react').JSX.Element

// ---- Menu（真源 `src/Menu.tsx`）----

/** Selectable row (optionally with a nested submenu). */
export interface MenuItem {
  id: string
  label: ReactNode
  disabled?: boolean
  icon?: ReactNode
  danger?: boolean
  submenu?: readonly MenuItem[]
}

/** Hairline between item groups (not selectable). */
export interface MenuSeparator {
  type: 'separator'
  id: string
}

/** Non-interactive heading row above a group of items. */
export interface MenuLabel {
  type: 'label'
  id: string
  text: string
}

/** One primary-menu entry: a row, a separator, or a heading label. */
export type MenuEntry = MenuItem | MenuSeparator | MenuLabel

export declare function Menu(props: {
  open: boolean
  autoFocus?: boolean
  anchor: ReactNode
  items: readonly MenuEntry[]
  footer?: readonly MenuEntry[]
  selectedId?: string | undefined
  selectedIds?: readonly string[] | undefined
  onSelect: (id: string) => void
  onClose: () => void
  align?: 'start' | 'end'
  side?: 'bottom' | 'top' | 'right'
  portal?: boolean
  closeOnPointerLeave?: boolean
  dense?: boolean
  compact?: boolean
  selection?: 'check' | 'fill'
  getAnchorRect?: () => DOMRect | null
  className?: string | undefined
}): import('react').JSX.Element

// ---- CodeBlock（真源 `src/markdown/CodeBlock.tsx`）----

export interface CodeBlockProps {
  /** The source text, rendered verbatim (trailing newline trimmed for display). */
  code: string
  /** Grammar hint (markdown fence info string or a fixed caller id); unknown = plain. */
  lang?: string | undefined
  /** The code is still growing (a streaming markdown fence). */
  streaming?: boolean | undefined
  /** Extra class merged onto the wrapper. */
  className?: string | undefined
  /** Ref for the stable source-content wrapper. */
  contentRef?: Ref<HTMLDivElement> | undefined
  /** Show a numbered gutter without adding numbers to copied source. Defaults to false. */
  lineNumbers?: boolean | undefined
  /** Copy-button idle label; the owner passes localized copy. */
  copyLabel: string
  /** Copy-button label during the post-copy confirmation window. */
  copiedLabel: string
}

export declare function CodeBlock(props: CodeBlockProps): import('react').JSX.Element

// ---- MarkdownText（真源 `src/markdown/MarkdownText.tsx` + `src/markdown/render.tsx`）----

/** Copy-button labels forwarded to fence CodeBlocks. */
export interface MarkdownCodeLabels {
  /** Copy-button idle label. */
  copyLabel: string
  /** Copy-button label during the post-copy confirmation window. */
  copiedLabel: string
}

/** Localized chrome for a Markdown document. */
export interface MarkdownLabels {
  code: MarkdownCodeLabels
  footnotes: string
}

/** Local-path image vocabulary for image destinations. */
export interface MarkdownPathImages {
  /**
   * Resolve one authored image destination.
   * @param value - The destination exactly as the markdown author wrote it.
   * @returns A displayable absolute URL, or undefined when the destination
   * names no displayable image — it then stays inert alt text.
   */
  resolve(value: string): string | undefined
}

/** File-mention affordance for inline code. */
export interface MarkdownFileMentions {
  /**
   * Resolve one inline-code token.
   * @param value - The authored token, exactly as written.
   * @returns The opener with its accessible label and full-path title, or
   * undefined when the token names no known file — it then stays inert code.
   */
  resolve(value: string): {
    open: () => void
    label: string
    title: string
  } | undefined
}

export declare const MarkdownText: MemoExoticComponent<(props: {
  text: string
  streaming?: boolean
  labels: MarkdownLabels
  fileMentions?: MarkdownFileMentions | undefined
  pathImages?: MarkdownPathImages | undefined
}) => import('react').JSX.Element>
