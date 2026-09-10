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
 * label text, click handlers, `active`/`disabled` state, `open` menus and the
 * rendered children — so a spec can drive the plugin's own logic (tree expand,
 * open, edit, tabs, menus) without asserting anything about the real
 * primitives' markup.
 */
import { createElement } from 'react'
import type { ReactNode } from 'react'

/** Props of the stand-in button. */
interface StubButtonProps {
  children?: ReactNode
  icon?: ReactNode
  onClick?: () => void
  title?: string
  disabled?: boolean
  className?: string
}

/**
 * Stand-in `<button>`; `title` and `disabled` pass through so specs can select
 * and assert on them.
 * @param props - see {@link StubButtonProps}.
 * @returns the button element.
 */
export function Button(props: StubButtonProps): ReactNode {
  return createElement('button', {
    className: props.className,
    title: props.title,
    disabled: props.disabled,
    onClick: props.onClick,
  }, props.icon, props.children)
}

/** Props of the stand-in pill (view-mode tab). */
interface StubPillProps {
  children?: ReactNode
  active?: boolean
  onClick?: () => void
}

/**
 * Stand-in view-mode tab; the active state lands in `data-active`.
 * @param props - see {@link StubPillProps}.
 * @returns the tab element.
 */
export function Pill(props: StubPillProps): ReactNode {
  return createElement('button', {
    className: 'stub-pill',
    'data-active': String(!!props.active),
    onClick: props.onClick,
  }, props.children)
}

/** One stand-in menu row. */
interface StubMenuItem {
  id: string
  label: ReactNode
}

/** Props of the stand-in menu. */
interface StubMenuProps {
  open: boolean
  anchor: ReactNode
  items: readonly StubMenuItem[]
  onSelect?: ((id: string) => void) | undefined
  onClose?: (() => void) | undefined
  closeOnPointerLeave?: boolean | undefined
}

/**
 * Stand-in anchored menu: always renders the anchor, and renders one clickable
 * row per item while `open`.
 * @param props - see {@link StubMenuProps}.
 * @returns the anchor wrapper with the conditional list.
 */
export function Menu(props: StubMenuProps): ReactNode {
  const rows = props.items.map(item => createElement('button', {
    key: item.id,
    className: 'stub-menu-item',
    onClick: () => { if (props.onSelect) props.onSelect(item.id) },
  }, item.label))
  const list = props.open
    ? createElement('div', { className: 'stub-menu' }, [
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
  return createElement('div', { className: 'stub-menu-wrap' }, props.anchor, list)
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
export const IconChevronRightOutline14 = stubIcon('IconChevronRightOutline14')
export const IconEditOutline16 = stubIcon('IconEditOutline16')
export const IconFolderClose16 = stubIcon('IconFolderClose16')
export const IconFolderOpen16 = stubIcon('IconFolderOpen16')
export const IconFolderOpenOutline16 = stubIcon('IconFolderOpenOutline16')
export const IconPanelLeftOutline16 = stubIcon('IconPanelLeftOutline16')
export const IconPlusOutline16 = stubIcon('IconPlusOutline16')
export const IconRefreshOutline16 = stubIcon('IconRefreshOutline16')
