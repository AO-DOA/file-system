/**
 * Test stand-in for `@deepseek-ai/dsh-client-ui-primitives`.
 *
 * The real package is a harness workspace package: its built `lib/index.js`
 * pulls in CSS modules, `shiki`, `katex` and a dozen sibling packages, none of
 * which resolve outside the harness tree — importing it under vitest would fail
 * on module resolution rather than on anything this plugin owns. Specs therefore
 * mount these light components instead, through `vi.mock`.
 *
 * The stand-ins keep exactly the surface `src/client/index.tsx` consumes —
 * label text, click handlers, `disabled` state, `open` menus, a tag's tone and
 * the rendered children — so a spec can drive the plugin's own logic (tree
 * expand, open, edit, view switching, menus) without asserting anything about
 * the real primitives' markup.
 */
import { createElement } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/** Props of the stand-in button. */
interface StubButtonProps {
  children?: ReactNode
  icon?: ReactNode
  onClick?: () => void
  title?: string
  disabled?: boolean
  className?: string
  /** Narrow-band icon buttons carry their accessible name here (R2). */
  'aria-label'?: string
}

/**
 * Stand-in `<button>`; `title`, `disabled` and `aria-label` pass through so
 * specs can select and assert on them.
 * @param props - see {@link StubButtonProps}.
 * @returns the button element.
 */
export function Button(props: StubButtonProps): ReactNode {
  return createElement('button', {
    className: props.className,
    title: props.title,
    disabled: props.disabled,
    'aria-label': props['aria-label'],
    onClick: props.onClick,
  }, props.icon, props.children)
}

/** Props of the stand-in tag (the extension badge on a tree row). */
interface StubTagProps {
  tone?: string
  className?: string | undefined
  children?: ReactNode
}

/**
 * Stand-in read-only tag: the label stays as text and the tone lands in
 * `data-tone`, so a spec can assert which palette the call site picked without
 * asserting the real primitives' markup. `stub-tag` leads the class list so the
 * element stays selectable, with any layout class the caller passed appended.
 * @param props - see {@link StubTagProps}.
 * @returns the tag element.
 */
export function Tag(props: StubTagProps): ReactNode {
  const className = props.className ? 'stub-tag ' + props.className : 'stub-tag'
  return createElement('span', { className, 'data-tone': props.tone || '' }, props.children)
}

/** One stand-in menu row. */
interface StubMenuItem {
  id: string
  label: ReactNode
  disabled?: boolean
}

/** Props of the stand-in menu. */
interface StubMenuProps {
  open: boolean
  anchor: ReactNode
  items: readonly StubMenuItem[]
  onSelect?: ((id: string) => void) | undefined
  onClose?: (() => void) | undefined
  closeOnPointerLeave?: boolean | undefined
  /** Real-menu `portal`: mount the panel on `document.body` instead of beside the anchor. */
  portal?: boolean | undefined
}

/**
 * Stand-in anchored menu: always renders the anchor, and renders one clickable
 * row per item while `open`.
 *
 * `portal` reproduces the real menu's mount point rather than ignoring it: the
 * real in-place panel (`.mr-list`) is an absolutely positioned descendant of the
 * toolbar, so the toolbar's own `overflow:hidden` clips it — the defect this
 * fixture has to keep observable. Specs therefore assert on the panel's ancestor
 * chain, which is only meaningful if the stand-in moves the panel for real.
 * @param props - see {@link StubMenuProps}.
 * @returns the anchor wrapper with the conditional list.
 */
export function Menu(props: StubMenuProps): ReactNode {
  const rows = props.items.map(item => createElement('button', {
    key: item.id,
    className: 'stub-menu-item',
    disabled: !!item.disabled,
    // The real menu never calls `onSelect` for a disabled row; refusing here
    // keeps the stand-in's observable behaviour identical.
    onClick: () => { if (!item.disabled && props.onSelect) props.onSelect(item.id) },
  }, item.label))
  const list = props.open
    ? createElement('div', {
      className: 'stub-menu',
      // 悬停收起语义的观测点：真实 Menu 只在 `closeOnPointerLeave` 时把指针 grace 挂在锚点上。
      // 本轮把三个菜单改成 portal，但这条语义必须保持不变，所以桩把标记渲染出来供断言。
      'data-close-on-pointer-leave': props.closeOnPointerLeave ? '1' : '',
    }, [
      // The real menu closes itself on outside click / Escape; this button gives
      // specs a way to drive the owner's `onClose` handler.
      createElement('button', {
        key: '__close',
        className: 'stub-menu-close',
        onClick: () => { if (props.onClose) props.onClose() },
      }, 'close'),
      ...rows,
    ])
    : null
  const placed = props.portal && list !== null ? createPortal(list, document.body) : list
  return createElement('div', { className: 'stub-menu-wrap' }, props.anchor, placed)
}

/** Props of the stand-in tooltip. */
interface StubTooltipProps {
  label: string | (() => string)
  side?: string
  delayMs?: number
  disabled?: boolean
  maxWidth?: number
  children: ReactNode
}

/**
 * Stand-in hover tooltip: renders the anchor **unchanged** and publishes the
 * wiring on a wrapper span.
 *
 * What it does reproduce: which bubble text is attached to which anchor, and
 * whether the bubble is suppressed (`disabled`). That is the part the plugin
 * owns — and the reason the real `Tooltip` is used at all is that its bubble is
 * a controlled, `position:fixed` surface instead of the native `title` bar, so
 * specs also assert the anchors carry no `title`.
 *
 * What it deliberately does NOT reproduce: the hover/focus lifecycle and the
 * bubble's placement. The real one mounts the bubble only while hovered and
 * positions it from the cloned child's rect — geometry that jsdom has no layout
 * for. Do not read a passing spec here as evidence about how the bubble looks;
 * the geometry probe (report §D) is the evidence for that.
 * @param props - see {@link StubTooltipProps}.
 * @returns the anchor wrapped in a label-carrying span.
 */
export function Tooltip(props: StubTooltipProps): ReactNode {
  const label = typeof props.label === 'function' ? props.label() : props.label
  return createElement('span', {
    className: 'stub-tooltip',
    'data-label': label,
    'data-side': props.side || 'right',
    'data-disabled': props.disabled ? '1' : '',
  }, props.children)
}

/** Props of the stand-in markdown renderer. */
interface StubMarkdownProps {
  text: string
  labels?: unknown
}

/**
 * Stand-in markdown body; the source text lands in the DOM verbatim so a spec
 * can assert which document was rendered.
 * @param props - see {@link StubMarkdownProps}.
 * @returns the body element.
 */
export function MarkdownText(props: StubMarkdownProps): ReactNode {
  return createElement('div', { className: 'stub-md' }, props.text)
}

/** Props of the stand-in code block. */
interface StubCodeProps {
  code: string
  lang?: string | undefined
}

/**
 * Stand-in highlighted code block.
 * @param props - see {@link StubCodeProps}.
 * @returns the code element.
 */
export function CodeBlock(props: StubCodeProps): ReactNode {
  return createElement('pre', { className: 'stub-code', 'data-lang': props.lang || '' }, props.code)
}

/** Props of the stand-in icons. */
interface StubIconProps {
  size?: number
  className?: string | undefined
}

/**
 * Build one stand-in icon component.
 * @param name - icon name, surfaced as `data-icon`.
 * @returns the icon component.
 */
function stubIcon(name: string): (props: StubIconProps) => ReactNode {
  return function Icon(props: StubIconProps): ReactNode {
    return createElement('span', { className: props.className, 'data-icon': name })
  }
}

export const IconBrowseOutline16 = stubIcon('IconBrowseOutline16')
export const IconCheckOutline16 = stubIcon('IconCheckOutline16')
export const IconChevronRightOutline14 = stubIcon('IconChevronRightOutline14')
export const IconEditOutline16 = stubIcon('IconEditOutline16')
export const IconFolderClose16 = stubIcon('IconFolderClose16')
export const IconFolderOpen16 = stubIcon('IconFolderOpen16')
export const IconFolderOpenOutline16 = stubIcon('IconFolderOpenOutline16')
export const IconLoadingOutline16 = stubIcon('IconLoadingOutline16')
export const IconPanelLeftOutline16 = stubIcon('IconPanelLeftOutline16')
export const IconPlusOutline16 = stubIcon('IconPlusOutline16')
export const IconRefreshOutline16 = stubIcon('IconRefreshOutline16')
