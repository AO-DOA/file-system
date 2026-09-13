/**
 * jsdom component spec for the client half (`src/client/index.tsx`).
 *
 * The client entry exports only `name` / `inject` / `apply`, so every case here
 * drives it the way the runtime does: mount `apply` on a stand-in client context,
 * take the view function it registers on `conversation.view`, and render that.
 * Assertions then read the DOM the plugin produced and the `/api/fs/*` calls it
 * made, never its internals.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is replaced by
 * `tests/fixtures/primitives-stub.ts`: the real package's bundle only resolves
 * inside the harness tree, and nothing under test here is the primitives' markup.
 *
 * Two source behaviours shape several assertions below, both preserved verbatim
 * from the migration source (decisions D-8/D-9):
 *   * `viewer.status` is only painted while the pane is empty or in source mode
 *     without content — so 「已保存」/失败文本 do NOT appear once source content
 *     is loaded (baseline §附加 item 7);
 *   * a `FileRow`'s doc marker carries no click handler (baseline §C-4).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { apply } from '../src/client/index.tsx'
import { ZH } from '../src/shared/locale.ts'

/**
 * Read one dictionary entry.
 *
 * `ZH` keeps a literal object type (no index signature) so host-side reads stay
 * plain `string`; read through the `Record<string, string>` view here, where
 * every index read is `string | undefined`; this narrows it once, and a missing
 * key fails loudly instead of flowing `undefined` into an assertion.
 * @param key - dictionary key.
 * @returns the localized string.
 */
function L(key: string): string {
  const value = (ZH as Record<string, string>)[key]
  if (value === undefined) throw new Error('missing locale key: ' + key)
  return value
}

/**
 * Every rendered `Tooltip`'s props — the one thing the stand-in cannot publish.
 *
 * The fixture turns `label` / `side` / `disabled` into DOM attributes but drops
 * `delayMs`, and the hover delay is precisely what this round changes: it decides
 * whether sweeping the pointer across the toolbar pops bubbles. Recording the
 * props turns that wiring into an assertable fact.
 *
 * What it does NOT verify: the real primitives' timing. The real `Tooltip` runs
 * `setTimeout(show, delayMs)` for hover and `cancelShow(); show()` for focus
 * (`Tooltip.tsx`), and jsdom has neither layout nor a real pointer — the report
 * quotes that source instead of claiming a run.
 */
const tooltipProps = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const stub = await import('./fixtures/primitives-stub')
  return {
    ...stub,
    // Wrapping (rather than extending) the fixture keeps it untouched: the
    // stand-in still owns every other export, and `Tooltip` stays the same
    // component instance across renders, so no anchor remounts mid-test.
    Tooltip: (props: Parameters<typeof stub.Tooltip>[0]) => {
      tooltipProps.push(props as unknown as Record<string, unknown>)
      return stub.Tooltip(props)
    },
  }
})

/** One reply the stubbed `fetch` answers with. */
interface Reply {
  status?: number
  /** `json()` rejects when this is the `BROKEN_JSON` sentinel. */
  body: unknown
}

/** Sentinel body meaning "the response body cannot be parsed". */
const BROKEN_JSON = Symbol('broken-json')

/** A recorded `/api/fs/*` call. */
interface Call {
  url: string
  init: RequestInit | undefined
}

type Handler = (url: string, init: RequestInit | undefined) => Reply | Promise<Reply>

/** Slot definition shape the client registers. */
interface CapturedDefinition {
  name: string
  id: string
  order: number
  label: () => string
}

/** One registration captured from the stand-in slot service. */
interface CapturedSlot {
  definition: CapturedDefinition
  view: (props: Record<string, unknown>) => ReactElement
}

/** One worktree item the stand-in workspaces service serves. */
interface WorkspaceItem {
  workspaceId: string
  title?: string
  path: string
}

/** Stand-in workspaces service surface. */
interface WorkspacesStub {
  list: {
    getSnapshot(): { items?: WorkspaceItem[] } | undefined
    subscribe(listener: () => void): () => void
  }
}

let handler: Handler
let calls: Call[]
let captured: CapturedSlot[]
let disposers: Array<() => void>
let container: HTMLDivElement | undefined
let root: Root | undefined
let wsNotify: (() => void) | undefined
let wsSnapshot: { items?: WorkspaceItem[] } | undefined

/** The six-node top-level tree every case starts from. */
const TOP_TREE = [
  { type: 'directory', path: 'src', name: 'src', hasDoc: true, docRel: 'bk/dir/src.md' },
  { type: 'directory', path: 'plain', name: 'plain' },
  { type: 'file', path: 'README.md', name: 'README.md', hasDoc: true, docRel: 'bk/file/README.md', hasDocTr: true, docTrRel: 'bk/tr/README.md' },
  { type: 'file', path: 'app.ts', name: 'app.ts', hasDocSrc: true, docSrcRel: 'bk/src/app.md' },
  { type: 'file', path: 'plain.py', name: 'plain.py' },
  { type: 'file', path: '.book/note.md', name: 'note.md' },
  { type: 'file', path: 'blob.xyz', name: 'blob.xyz' },
  { type: 'file', path: 'Makefile', name: 'Makefile' },
  { type: 'file', path: 'full.md', name: 'full.md', hasDoc: true, docRel: 'bk/d/full.md', hasDocSrc: true, docSrcRel: 'bk/s/full.md', hasDocTr: true, docTrRel: 'bk/t/full.md' },
  { type: 'file', path: 'plain.md', name: 'plain.md' },
  { type: 'file', path: 'doc.txt', name: 'doc.txt', hasDoc: true, docRel: 'bk/d/doc.md' },
]

/**
 * Default `/api/fs` reply table used by most cases.
 * @param url - requested `/api/fs…` URL.
 * @returns the stubbed reply.
 */
function defaultHandler(url: string): Reply {
  if (url.startsWith('/api/fs/root')) return { body: { root: '/proj' } }
  if (url.startsWith('/api/fs/tree?path=.')) return { body: { path: '.', list: TOP_TREE } }
  if (url.startsWith('/api/fs/tree?path=src')) {
    return { body: { path: 'src', list: [{ type: 'file', path: 'src/child.ts', name: 'child.ts' }] } }
  }
  if (url.startsWith('/api/fs/read?path=')) {
    const target = decodeURIComponent(url.slice('/api/fs/read?path='.length))
    if (target === 'Makefile') return { body: { content: 'all:', ext: '', size: 4 } }
    if (target === 'full.md') return { body: { content: '# Full', ext: 'md', size: 6 } }
    if (target === 'plain.md') return { body: { content: '# Plain', ext: 'md', size: 7 } }
    if (target === 'app.ts') return { body: { content: 'const a = 1', ext: 'ts', size: 11 } }
    if (target === 'plain.py') return { body: { content: '', ext: 'py', size: 0 } }
    if (target === 'blob.xyz') return { body: { content: '', ext: 'xyz', size: 0 } }
    if (target === 'src') return { body: { content: '', ext: '', size: 0 } }
    return { body: { content: '# Title\n\nbody', ext: 'md', size: 14 } }
  }
  if (url.startsWith('/api/fs/gen-status')) return { body: { ok: true, task: null } }
  if (url.startsWith('/api/fs/write')) return { body: { ok: true } }
  if (url.startsWith('/api/fs/set-root')) return { body: { ok: true, root: '/proj' } }
  if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
  if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
  return { body: { ok: true } }
}

/**
 * Build a stand-in client context.
 * @param options - `withSlots: false` omits the slots service; `workspaces` injects one.
 * @returns the context handed to `apply`.
 */
function makeCtx(options: { withSlots?: boolean; workspaces?: WorkspacesStub } = {}): Parameters<typeof apply>[0] {
  const registry = {
    inject(_name: string, callback: () => void): void { callback() },
    register(definition: CapturedDefinition, view: CapturedSlot['view']): () => void {
      const entry: CapturedSlot = { definition, view }
      captured.push(entry)
      return () => { captured = captured.filter(candidate => candidate !== entry) }
    },
  }
  const ctx = {
    effect(fn: () => (() => void) | void): void {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    get(name: string): unknown {
      if (name === 'slots') return options.withSlots === false ? undefined : registry
      if (name === 'workspaces') return options.workspaces
      return undefined
    },
  }
  return ctx as unknown as Parameters<typeof apply>[0]
}

/**
 * Flush pending microtasks inside `act` so effect-driven fetches settle.
 * @param rounds - how many microtask turns to drain.
 */
async function flush(rounds = 24): Promise<void> {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await Promise.resolve()
  })
}

/**
 * Mount the plugin and render its registered view.
 * @param options - forwarded to {@link makeCtx}.
 * @returns the container holding the rendered tree.
 */
function mount(options: { withSlots?: boolean; workspaces?: WorkspacesStub } = {}): HTMLDivElement {
  apply(makeCtx(options))
  const slot = captured[0]
  if (slot === undefined) throw new Error('client registered no slot')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const element = slot.view({})
  act(() => { root?.render(element) })
  return container
}

/**
 * Tear the current tree down so the next `mount` starts fresh.
 */
async function unmount(): Promise<void> {
  if (root !== undefined) {
    const current = root
    await act(async () => { current.unmount() })
    root = undefined
  }
  container?.remove()
  container = undefined
  captured = []
  calls = []
}

/**
 * Find a rendered element by its exact trimmed text.
 * @param selector - CSS selector to search within.
 * @param text - exact trimmed text content.
 * @returns the first matching element.
 */
function byText(selector: string, text: string): HTMLElement {
  const nodes = Array.from(document.querySelectorAll(selector))
  const hit = nodes.find(node => (node.textContent || '').trim() === text)
  if (hit === undefined) throw new Error('no ' + selector + ' with text ' + text)
  return hit as HTMLElement
}

/**
 * Find a rendered element whose text contains the given fragment.
 * @param selector - CSS selector to search within.
 * @param text - substring to look for.
 * @returns the first matching element.
 */
function byTextIncluding(selector: string, text: string): HTMLElement {
  const nodes = Array.from(document.querySelectorAll(selector))
  const hit = nodes.find(node => (node.textContent || '').includes(text))
  if (hit === undefined) throw new Error('no ' + selector + ' containing ' + text)
  return hit as HTMLElement
}

/**
 * Type into a controlled textarea the way React observes it: write through the
 * prototype value setter (which bypasses React's value tracker) and dispatch
 * `input`. `Reflect.apply` keeps the accessor bound to the element.
 * @param area - textarea to type into.
 * @param value - the new value.
 */
function typeInto(area: HTMLTextAreaElement, value: string): void {
  // `unknown` first, then a narrow cast: reading the accessor off the descriptor
  // is exactly what `typescript/unbound-method` flags, and a bound `Reflect.apply`
  // is the point here.
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
  const setter: unknown = descriptor === undefined ? undefined : Reflect.get(descriptor, 'set')
  if (typeof setter === 'function') {
    Reflect.apply(setter as (this: HTMLTextAreaElement, next: string) => void, area, [value])
  }
  area.dispatchEvent(new window.Event('input', { bubbles: true }))
}

/**
 * The tree row whose title matches exactly (row text also carries badges).
 * @param name - node name as rendered in `.fs-title`.
 * @returns the `.fs-tr` row element.
 */
function row(name: string): HTMLElement {
  const title = byText('.fs-title', name)
  const tr = title.closest('.fs-tr')
  if (tr === null) throw new Error('no row for ' + name)
  return tr as HTMLElement
}

/**
 * The toolbar button carrying the given label.
 * @param label - rendered button text.
 * @returns the button element.
 */
function button(label: string): HTMLElement {
  return byText('button', label)
}

/**
 * Click an element inside `act` and let effects settle.
 * @param element - element to click.
 */
async function click(element: HTMLElement): Promise<void> {
  await act(async () => { element.click() })
  await flush()
}

/**
 * Let parked promises resolve and drain the resulting microtask chain. A plain
 * microtask loop is not enough once a reply is released outside `act`, so this
 * yields to the macrotask queue first.
 */
async function settle(): Promise<void> {
  if (vi.isFakeTimers()) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  } else {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 1) }) })
  }
  await flush()
}


/**
 * Unmount the tree and release a parked reply in the same `act`, so React drains
 * the whole promise chain after the effect cleanup has run. The wait branches on
 * the timer mode: a real `setTimeout` never fires under fake timers.
 * @param current - the root to unmount.
 * @param release - releases (or fails) the parked reply.
 */
async function unmountAndRelease(current: Root | undefined, release: () => void): Promise<void> {
  await act(async () => {
    current?.unmount()
    release()
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(5)
    else await new Promise((resolve) => { setTimeout(resolve, 5) })
  })
  root = undefined
  await flush()
}

/**
 * The URLs the plugin requested, in order.
 * @returns requested `/api/fs…` URLs.
 */
function urls(): string[] {
  return calls.map(call => call.url)
}

/**
 * Count how many times a URL was requested.
 * @param url - exact URL.
 * @returns request count.
 */
function hits(url: string): number {
  return urls().filter(candidate => candidate === url).length
}

/**
 * The view-selector button. Its label IS the current view name (R3), so a spec
 * reads the displayed view off this text rather than off an `active` flag.
 * @returns the `.fs-viewbtn` element.
 */
function viewBtn(): HTMLElement {
  const node = document.querySelector('.fs-viewbtn')
  if (node === null) throw new Error('no view selector button')
  return node as HTMLElement
}

/**
 * The refresh icon button in the left toolbar group. Selected by its accessible
 * name rather than by position: every toolbar button now sits inside a
 * `.fs-tipwrap` anchor layer (the `Tooltip` anchor), so `:first-child` /
 * `:last-child` positional selectors would match the wrapper instead.
 * @returns the refresh button.
 */
function refreshButton(): HTMLElement {
  return namedToolbarButton(L('a11yRefresh'))
}

/**
 * The fold/unfold icon button — the one whose accessible name changes with the
 * panel state, so both names are accepted.
 * @returns the fold button.
 */
function foldButton(): HTMLElement {
  const hit = document.querySelector(
    `.fs-hd-actions button[aria-label="${L('a11yCollapseTree')}"],`
    + ` .fs-hd-actions button[aria-label="${L('a11yExpandTree')}"]`,
  )
  if (hit === null) throw new Error('no fold button')
  return hit as HTMLElement
}

/**
 * A toolbar button found by its accessible name.
 * @param label - the expected `aria-label`.
 * @returns the matching button.
 */
function namedToolbarButton(label: string): HTMLElement {
  const hit = document.querySelector(`.fs-hbar button[aria-label="${label}"]`)
  if (hit === null) throw new Error('no toolbar button named ' + label)
  return hit as HTMLElement
}

/**
 * The split-view entry in the right toolbar group (same button as the R4
 * block's local helper, hoisted here for the layout cases).
 * @returns the split button.
 */
function splitButton(): HTMLElement {
  return namedToolbarButton(L('btnSplit'))
}

/**
 * Whether the view-selector button currently reads the given view name.
 * @param key - locale key of the expected view label (`labSrc`, `labDocFile`, …).
 * @returns whether the button shows that label.
 */
function viewIs(key: string): boolean {
  return (viewBtn().textContent || '').trim() === L(key)
}

/**
 * Open the view dropdown the way a pointer does — through the wrapper's
 * `onMouseEnter`, which React synthesizes from the bubbling `mouseover`.
 */
async function openViewMenu(): Promise<void> {
  const wrap = document.querySelector('.fs-viewwrap')
  if (wrap === null) throw new Error('no view selector wrapper')
  await act(async () => {
    wrap.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
  })
  await flush()
}

/**
 * Open the interpretation menu the way a pointer does — through the wrapper's
 * `onMouseEnter` (the same route {@link openViewMenu} takes). Needed once the
 * button itself is disabled: a disabled button swallows clicks, so hovering is
 * the only way in while a translation runs.
 */
async function openGenMenu(): Promise<void> {
  const wrap = document.querySelector('.fs-genwrap')
  if (wrap === null) throw new Error('no interpretation wrapper')
  await act(async () => {
    wrap.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
  })
  await flush()
}

/**
 * The labels of the currently open menu, in DOM order.
 * @returns menu item labels.
 */
function menuLabels(): string[] {
  return Array.from(document.querySelectorAll('.stub-menu-item'))
    .map(node => (node.textContent || '').trim())
}

/**
 * The view names the view dropdown offers, in DOM order (the current view is
 * deliberately absent).
 * @returns view labels.
 */
async function viewItems(): Promise<string[]> {
  await openViewMenu()
  return menuLabels()
}

/**
 * Switch views through the dropdown (R3): hover to open, then click the entry.
 * @param key - locale key of the view label to pick.
 */
async function pickView(key: string): Promise<void> {
  await openViewMenu()
  await click(byText('.stub-menu-item', L(key)))
}

/**
 * Run a translation through the interpretation menu. R1 deleted the standalone
 * translate button, so every translation now goes through 「解读选择」.
 * @param key - locale key of the entry (`btnTr` | `btnTrRegen`).
 */
async function translateVia(key: string): Promise<void> {
  await click(button(L('btnGen')))
  await click(byText('.stub-menu-item', L(key)))
}

/**
 * Open the interpretation menu and read whether the given entry is disabled.
 * @param key - locale key of the entry.
 * @returns the entry's `disabled` state.
 */
async function entryDisabled(key: string): Promise<boolean> {
  await click(button(L('btnGen')))
  return (byText('.stub-menu-item', L(key)) as HTMLButtonElement).disabled
}

beforeEach(() => {
  captured = []
  disposers = []
  calls = []
  wsNotify = undefined
  wsSnapshot = { items: [] }
  handler = url => defaultHandler(url)
  localStorage.clear()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit): Promise<unknown> => {
    const url = String(input)
    calls.push({ url, init })
    const reply = await handler(url, init)
    const status = reply.status ?? 200
    const broken = reply.body === BROKEN_JSON
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async (): Promise<unknown> => {
        if (broken) throw new Error('not json')
        return reply.body
      },
    }
  })
})

afterEach(async () => {
  await unmount()
  // The style tag is only removed by the effect disposer; cases that never run
  // it would otherwise leak the tag into the next test's head.
  for (const tag of Array.from(document.head.querySelectorAll('style[data-plugin="fs"]'))) tag.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
})

/**
 * The stand-in workspaces service.
 * @returns the stub.
 */
function workspacesStub(): WorkspacesStub {
  return {
    list: {
      getSnapshot(): { items?: WorkspaceItem[] } | undefined {
        return wsSnapshot
      },
      subscribe(listener: () => void): () => void {
        wsNotify = listener
        return () => { wsNotify = undefined }
      },
    },
  }
}

describe('client entry: slot contract (A)', () => {
  it('throws when the slots service is missing', () => {
    expect(() => { apply(makeCtx({ withSlots: false })) }).toThrow(
      'slots service missing — client cannot register conversation.view',
    )
  })

  it('registers conversation.view with the pinned id, order and lazy label', () => {
    apply(makeCtx())
    expect(captured).toHaveLength(1)
    const definition = captured[0]?.definition
    expect(definition?.name).toBe('conversation.view')
    expect(definition?.id).toBe('fs')
    expect(definition?.order).toBe(12)
    // T-47: the visible tab text is the dictionary value, not a literal.
    expect(definition?.label()).toBe('文件')
    expect(definition?.label()).toBe(L('slotLabel'))
  })

  it('injects the stylesheet and removes it through the effect disposer', () => {
    apply(makeCtx())
    const tag = document.head.querySelector('style[data-plugin="fs"]')
    expect(tag).not.toBeNull()
    expect(tag?.textContent).toContain('.fs-wrap{display:flex')
    expect(disposers).toHaveLength(1)
    disposers[0]?.()
    expect(document.head.querySelector('style[data-plugin="fs"]')).toBeNull()
  })

  it('exposes the plugin identity contract', async () => {
    const mod = await import('../src/client/index.tsx')
    expect(mod.name).toBe('fs')
    expect(mod.inject).toEqual(['slots'])
  })
})

describe('empty state and tree (B)', () => {
  it('loads root and tree on mount, then renders the empty-directory state', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/root')) return { body: { root: '/proj' } }
      if (url.startsWith('/api/fs/tree')) return { body: { path: '.', list: [] } }
      return { body: { ok: true } }
    }
    mount()
    await flush()
    expect(urls()).toEqual(['/api/fs/root', '/api/fs/tree?path=.'])
    expect(byText('.fs-empty', L('emptyDir'))).toBeTruthy()
    // No node open yet: the status line is empty and there is no view selector
    // either (R3 renders it only with an open object; source behaviour kept the
    // strip element in the tree, this incarnation does not).
    expect(document.querySelector('.fs-load')).toBeNull()
    expect(document.querySelector('.fs-viewwrap')).toBeNull()
  })

  it('paints the root-load failure in the empty-state status line', async () => {
    handler = () => ({ status: 500, body: { error: 'boom' } })
    mount()
    await flush()
    expect(byTextIncluding('.fs-load', L('errLoadFail') + 'boom')).toBeTruthy()
  })

  it('falls back to the HTTP status text when the host sends no error field', async () => {
    handler = url => (url.startsWith('/api/fs/root') ? { status: 500, body: {} } : { body: {} })
    mount()
    await flush()
    expect(byTextIncluding('.fs-load', L('errLoadFail') + L('errHttpPrefix') + '500')).toBeTruthy()
  })

  it('falls back to the locale request-failed text on a business ok:false without error', async () => {
    handler = url => (url.startsWith('/api/fs/root') ? { body: { ok: false } } : { body: {} })
    mount()
    await flush()
    expect(byTextIncluding('.fs-load', L('errLoadFail') + L('errRequestFailed'))).toBeTruthy()
  })

  it('tolerates an unparsable error body', async () => {
    handler = url => (url.startsWith('/api/fs/root') ? { status: 500, body: BROKEN_JSON } : { body: {} })
    mount()
    await flush()
    expect(byTextIncluding('.fs-load', L('errLoadFail') + L('errHttpPrefix') + '500')).toBeTruthy()
  })

  it('treats a business ok:false reply as a failure', async () => {
    handler = url => (url.startsWith('/api/fs/root') ? { body: { ok: false, error: 'denied' } } : { body: {} })
    mount()
    await flush()
    expect(byTextIncluding('.fs-load', L('errLoadFail') + 'denied')).toBeTruthy()
  })

  it('renders directory and file rows with tags and doc markers', async () => {
    mount()
    await flush()
    expect(row('src').querySelector('.fs-docmark')).not.toBeNull()
    expect(row('plain').querySelector('.fs-docmark')).toBeNull()
    const readme = row('README.md')
    expect(readme.querySelector('.fs-docmark')).not.toBeNull()
    // The extension badge is the primitives' `Tag` now (tone `quiet`, i.e. text
    // only, no fill) instead of the plugin's own `.fs-badge` span.
    expect(readme.querySelector('.stub-tag')?.textContent).toBe('MD')
    expect(readme.querySelector('.stub-tag')?.getAttribute('data-tone')).toBe('quiet')
    expect(row('app.ts').querySelector('.stub-tag')?.textContent).toBe('TS')
    expect(row('plain.py').querySelector('.stub-tag')?.textContent).toBe('PY')
  })

  it('expands a directory lazily, caches children and keeps them on collapse', async () => {
    mount()
    await flush()
    await click(row('src'))
    expect(hits('/api/fs/tree?path=src')).toBe(1)
    expect(row('child.ts')).toBeTruthy()
    expect(row('src').className).toContain('fs-open')
    // Collapse: no second request, and the cached rows leave the DOM.
    await click(row('src'))
    expect(hits('/api/fs/tree?path=src')).toBe(1)
    expect(document.querySelectorAll('.fs-tr')).toHaveLength(11)
    // Re-expand: served from cache, still no second request.
    await click(row('src'))
    expect(hits('/api/fs/tree?path=src')).toBe(1)
    expect(row('child.ts')).toBeTruthy()
  })

  it('swallows a lazy tree load failure and keeps the node collapsed', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/tree?path=src')) return { status: 500, body: { error: 'nope' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('src'))
    expect(row('src').className).not.toContain('fs-open')
    expect(document.querySelector('.fs-load')).toBeNull()
  })

  it('opens a directory through its doc marker without toggling it', async () => {
    mount()
    await flush()
    const marker = row('src').querySelector('.fs-docmark')
    if (marker === null) throw new Error('no doc marker')
    await click(marker as HTMLElement)
    // The marker stops propagation, so the row never expanded.
    expect(hits('/api/fs/tree?path=src')).toBe(0)
    expect(byText('.fs-hd-path', 'proj/src')).toBeTruthy()
  })

  it('selects the clicked file row', async () => {
    mount()
    await flush()
    await click(row('plain.py'))
    expect(row('plain.py').className).toContain('sel')
    expect(row('app.ts').className).not.toContain('sel')
  })
})

describe('viewer: opening files and markdown branches (C)', () => {
  it('opens a markdown file in source mode and reads all three documents', async () => {
    mount()
    await flush()
    await click(row('README.md'))
    expect(urls()).toContain('/api/fs/read?path=README.md')
    expect(urls()).toContain('/api/fs/read?path=bk%2Ffile%2FREADME.md')
    expect(urls()).toContain('/api/fs/read?path=bk%2Ftr%2FREADME.md')
    // R3: source first — a file that HAS a summary still opens on its source.
    expect(viewIs('labSrc')).toBe(true)
    // This node has a summary and a translation but no source annotation, so the
    // annot view is absent (the mode list is derived per node, baseline §C-10) and
    // the dropdown lists exactly the other two, in the pinned order.
    expect(await viewItems()).toEqual([L('labDocFile'), L('labTr')])
    expect(document.querySelector('.stub-md')?.textContent).toContain('# Title')
  })

  it('renders frontmatter rows and the markdown body separately', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=bk%2Ffile%2FREADME.md')) {
        return { body: { content: '---\ntitle: Hi\nnokey\n---\nbody text', ext: 'md', size: 30 } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('README.md'))
    // R3: frontmatter belongs to the document view, which is no longer the
    // default one — the pane opens on the source.
    await pickView('labDocFile')
    expect(byText('.fs-fmhead', L('frontmatter'))).toBeTruthy()
    expect(byText('.fs-fmkey', 'title')).toBeTruthy()
    expect(byText('.fs-fmval', 'Hi')).toBeTruthy()
    // A non key/value frontmatter line renders with an empty key cell.
    expect(byText('.fs-fmkey', '')).toBeTruthy()
    expect(document.querySelector('.stub-md')?.textContent).toContain('body text')
  })

  it('falls back to source mode when the file has no summary', async () => {
    mount()
    await flush()
    await click(row('plain.py'))
    expect(viewIs('labSrc')).toBe(true)
    // Only source exists, so the dropdown offers nothing.
    expect(await viewItems()).toEqual([])
    // py maps to a shiki grammar, so this arm is the highlighted code block.
    expect(document.querySelector('.stub-code')?.textContent).toBe('')
  })

  it('falls back to the monospace pre for an unknown extension', async () => {
    mount()
    await flush()
    await click(row('blob.xyz'))
    expect(document.querySelector('.fs-code')?.textContent).toBe(L('emptyFile'))
  })

  it('renders the highlighted code branch for a known language', async () => {
    mount()
    await flush()
    await click(row('app.ts'))
    expect(document.querySelector('.stub-code')?.textContent).toBe('const a = 1')
    expect(document.querySelector('.stub-code')?.getAttribute('data-lang')).toBe('ts')
  })

  it('paints a read failure while the source is still empty', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=plain.py')) return { status: 500, body: { error: 'nope' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain.py'))
    expect(byTextIncluding('.fs-load', L('errReadFail') + 'nope')).toBeTruthy()
  })

  it('shows the placeholder card for a directory without a generated overview', async () => {
    mount()
    await flush()
    await click(row('plain'))
    expect(byText('.fs-folder-card-ti', L('folderCardTitle'))).toBeTruthy()
    expect(document.querySelector('.fs-folder-card-path-rel')?.textContent).toBe('plain')
    expect(document.querySelector('.fs-folder-card-path-name')?.textContent).toBe('plain')
  })

  it('shows the folder overview when the directory has one', async () => {
    mount()
    await flush()
    await click(row('src'))
    expect(document.querySelector('.stub-md')?.textContent).toContain('# Title')
  })

  it('shows the placeholder card when the overview read fails', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=bk%2Fdir%2Fsrc.md')) return { status: 500, body: { error: 'gone' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('src'))
    expect(byText('.fs-folder-card-ti', L('folderCardTitle'))).toBeTruthy()
  })

  it('names the workspace root when the opened node is the bare root', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({
      rootPath: '/proj',
      opened: { type: 'directory', path: '.', name: '' },
      expanded: [],
    }))
    mount()
    await flush()
    expect(byText('.fs-folder-card-path-name', L('rootDirName'))).toBeTruthy()
    expect(byText('.fs-hd-path', 'proj')).toBeTruthy()
  })

  it('keeps the placeholder card for a directory whose node carries no path', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({
      rootPath: '/proj',
      opened: { type: 'directory', name: 'orphan' },
      expanded: [],
    }))
    mount()
    await flush()
    expect(byText('.fs-folder-card-path-name', 'orphan')).toBeTruthy()
    // With no path on the node the relative cell renders empty (source
    // behaviour: `folderPath = opened.path`).
    expect(document.querySelector('.fs-folder-card-path-rel')?.textContent).toBe('')
  })
})

describe('viewer: tabs and editing (C)', () => {
  it('walks the dirty marker through appearance, tab switch and save', async () => {
    mount()
    await flush()
    await click(row('app.ts'))
    const action = button(L('btnEdit'))
    expect(action).toBeTruthy()
    await click(action)
    const area = document.querySelector('.fs-area') as HTMLTextAreaElement
    expect(area).not.toBeNull()
    // 同一个按钮换态（编辑 ⇄ 保存），不是多出第二个按钮：编辑态下「保存」就是它。
    expect(button(L('btnSave'))).toBe(action)
    // Typing raises 「● 未保存」.
    await act(async () => {
      typeInto(area, 'const a = 2')
    })
    await flush()
    expect(byText('.fs-dirty', L('a11yDirty'))).toBeTruthy()
    // Leaving source mode hides the marker (it is part of the edit toolbar),
    // but the dirty STATE survives; coming back proves it was never cleared.
    await pickView('labAnnot')
    expect(document.querySelector('.fs-dirty')).toBeNull()
    await pickView('labSrc')
    expect(byText('.fs-dirty', L('a11yDirty'))).toBeTruthy()
    // 视图切换会退出编辑态（R3 的既有行为），而 dirty 内容仍在（`edit` 只在**切换文件**时
    // 重播种，见 `useOpenedViewer` 的打开 effect）。此时 `editMode === false` 而 `dirty === true`，
    // 判据 `canSave = editMode || dirty` 让按钮显示「✓ 保存」：有未保存内容时直达保存，
    // 不再需要「先点一次回编辑态、再点一次保存」（旧判据只看 `editMode` 的两击路径）。
    expect(document.querySelector('.fs-area')).toBeNull()
    expect(byText('.fs-dirty', L('a11yDirty'))).toBeTruthy()
    const directSave = namedToolbarButton(L('btnSave'))
    expect(directSave.getAttribute('aria-label')).toBe(L('btnSave'))
    expect(directSave.querySelector('.fs-btnlabel')?.textContent).toBe(L('btnSave'))
    // 「编辑」这个态此时**不存在**：同一个节点已经换成保存，右列仍是那一个按钮。
    expect(document.querySelectorAll(`.fs-hbar-right button[aria-label="${L('btnEdit')}"]`)).toHaveLength(0)
    // 一下落地：Saving clears it and leaves edit mode; the write carries the edited text.
    await click(directSave)
    expect(document.querySelector('.fs-dirty')).toBeNull()
    expect(document.querySelector('.fs-area')).toBeNull()
    expect(namedToolbarButton(L('btnEdit')).querySelector('[data-icon="IconEditOutline16"]')).not.toBeNull()
    const write = calls.find(call => call.url === '/api/fs/write')
    expect(write?.init?.body).toBe(JSON.stringify({ path: 'app.ts', content: 'const a = 2' }))
  })

  it('keeps the dirty marker when the save request fails', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/write')) return { status: 500, body: { error: 'disk full' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('app.ts'))
    await click(button(L('btnEdit')))
    const area = document.querySelector('.fs-area') as HTMLTextAreaElement
    await act(async () => {
      typeInto(area, 'x')
    })
    await flush()
    await click(button(L('btnSave')))
    expect(document.querySelector('.fs-dirty')).not.toBeNull()
    expect(document.querySelector('.fs-area')).not.toBeNull()
  })

  it('drops the dirty marker when the opened path changes', async () => {
    mount()
    await flush()
    await click(row('app.ts'))
    await click(button(L('btnEdit')))
    const area = document.querySelector('.fs-area') as HTMLTextAreaElement
    await act(async () => {
      typeInto(area, 'x')
    })
    await flush()
    expect(document.querySelector('.fs-dirty')).not.toBeNull()
    // Opening another file silently discards the edit (baseline §C-9).
    await click(row('plain.py'))
    expect(document.querySelector('.fs-dirty')).toBeNull()
  })

  it('offers no interpretation entry for markdown inside the book bucket', async () => {
    mount()
    await flush()
    await click(row('note.md'))
    expect(row('note.md').className).toContain('sel')
    // R1: translation lives in the 「解读选择」 menu now, and a `.book/` markdown
    // is not a translation target — the menu stays empty and never opens.
    await click(button(L('btnGen')))
    expect(document.querySelector('.stub-menu')).toBeNull()
  })

  it('runs a translation and refreshes the parent directory', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success', docRel: 'bk/tr/out.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=bk%2Ftr%2Fout.md')) return { body: { content: 'translated', ext: 'md', size: 10 } }
      return defaultHandler(url)
    }
    vi.useFakeTimers()
    mount()
    await flush()
    await click(row('README.md'))
    const before = hits('/api/fs/tree?path=.')
    // The node already carries hasDocTr, so the entry reads 「重新翻译」.
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(calls.find(call => call.url === '/api/fs/translate')?.init?.body).toBe(JSON.stringify({ path: 'README.md' }))
    expect(viewIs('labTr')).toBe(true)
    expect(document.querySelector('.stub-md')?.textContent).toBe('translated')
    // onTrDone refreshes the parent directory ('.' for a top-level file).
    expect(hits('/api/fs/tree?path=.')).toBe(before + 1)
  })

  it('refreshes only the parent cache for a nested file', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/tree?path=src')) {
        return { body: { path: 'src', list: [{ type: 'file', path: 'src/child.md', name: 'child.md', hasDocTr: true, docTrRel: 'bk/tr/child.md' }] } }
      }
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success', docRel: 'bk/tr/child.md' } } }
      }
      return defaultHandler(url)
    }
    vi.useFakeTimers()
    mount()
    await flush()
    await click(row('src'))
    await click(row('child.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(hits('/api/fs/tree?path=src')).toBe(2)
  })

  it('reports a translation failure', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'error', error: 'bad' } } }
      }
      return defaultHandler(url)
    }
    vi.useFakeTimers()
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    // The status only paints while the source is empty, so assert the task outcome
    // through the menu entry leaving its busy state instead.
    expect(await entryDisabled('btnTrRegen')).toBe(false)
  })
})

describe('worktree switching, persistence and drag (D)', () => {
  it('persists the ui state and replays it on the next mount', async () => {
    mount()
    await flush()
    await click(row('src'))
    const saved = JSON.parse(localStorage.getItem('fs.ui.v1') || 'null') as {
      rootPath?: string
      expanded?: string[]
      treeW?: number
      collapsed?: boolean
    }
    expect(saved.rootPath).toBe('/proj')
    expect(saved.expanded).toEqual(['src'])
    expect(saved.collapsed).toBe(false)

    await unmount()
    mount()
    await flush()
    expect(urls()).toContain('/api/fs/root')
    expect(hits('/api/fs/tree?path=src')).toBe(1)
    expect(row('child.ts')).toBeTruthy()
    expect(row('src').className).toContain('fs-open')
  })

  it('does not overwrite an existing archive from the pristine initial state', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ rootPath: '/keep', treeW: 300, expanded: [] }))
    handler = (url) => {
      if (url.startsWith('/api/fs/root')) return { body: { root: '/keep' } }
      if (url.startsWith('/api/fs/tree')) return { body: { path: '.', list: [] } }
      return { body: { ok: true } }
    }
    mount()
    await flush()
    const saved = JSON.parse(localStorage.getItem('fs.ui.v1') || 'null') as { rootPath?: string }
    expect(saved.rootPath).toBe('/keep')
  })

  it('reports a restore failure', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ rootPath: '/gone', expanded: [] }))
    handler = (url) => {
      if (url.startsWith('/api/fs/set-root')) return { status: 500, body: { error: 'missing' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    expect(byTextIncluding('.fs-load', L('errRestoreFail') + 'missing')).toBeTruthy()
  })

  it('degrades a per-directory restore failure to an empty cache entry', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ rootPath: '/proj', expanded: ['src'] }))
    handler = (url) => {
      if (url.startsWith('/api/fs/tree?path=src')) return { status: 500, body: { error: 'nope' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    expect(row('src').className).toContain('fs-open')
    expect(document.querySelector('.fs-tr.fs-open .fs-chevslot')).not.toBeNull()
  })

  it('ignores an archive whose expanded field is not a list', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ rootPath: '/proj', expanded: 'nope' }))
    mount()
    await flush()
    expect(row('src').className).not.toContain('fs-open')
  })

  it('survives an unreadable archive', async () => {
    localStorage.setItem('fs.ui.v1', '{not json')
    mount()
    await flush()
    expect(urls()).toEqual(['/api/fs/root', '/api/fs/tree?path=.'])
  })

  it('switches worktrees from the menu', async () => {
    wsSnapshot = { items: [{ workspaceId: 'w1', path: '/other', title: 'Other' }] }
    mount({ workspaces: workspacesStub() })
    await flush()
    await click(byText('.fs-wsbtn', 'proj'))
    await click(byText('.stub-menu-item', 'Other' + L('wsItemSep') + '/other'))
    expect(calls.find(call => call.url === '/api/fs/set-root')?.init?.body).toBe(JSON.stringify({ path: '/other' }))
  })

  it('falls back to the worktree basename and to the picker prompt', async () => {
    wsSnapshot = { items: [{ workspaceId: 'w1', path: '/other/deep' }] }
    handler = (url) => {
      if (url.startsWith('/api/fs/root')) return { status: 500, body: { error: 'x' } }
      return defaultHandler(url)
    }
    mount({ workspaces: workspacesStub() })
    await flush()
    // No worktree chosen and no root name yet: the picker prompt shows.
    expect(byText('.fs-wsbtn', L('pickWs'))).toBeTruthy()
    await click(byText('.fs-wsbtn', L('pickWs')))
    expect(byText('.stub-menu-item', 'deep' + L('wsItemSep') + '/other/deep')).toBeTruthy()
  })

  it('re-renders the worktree menu when the service notifies', async () => {
    wsSnapshot = { items: [{ workspaceId: 'w1', path: '/other' }] }
    mount({ workspaces: workspacesStub() })
    await flush()
    await act(async () => {
      wsSnapshot = { items: [{ workspaceId: 'w1', path: '/other' }, { workspaceId: 'w2', path: '/second' }] }
      wsNotify?.()
    })
    await click(byText('.fs-wsbtn', 'proj'))
    expect(byText('.stub-menu-item', 'second' + L('wsItemSep') + '/second')).toBeTruthy()
  })

  it('tolerates a worktree snapshot without items', async () => {
    wsSnapshot = {}
    mount({ workspaces: workspacesStub() })
    await flush()
    await act(async () => {
      wsSnapshot = {}
      wsNotify?.()
    })
    await click(byText('.fs-wsbtn', 'proj'))
    expect(document.querySelectorAll('.stub-menu-item')).toHaveLength(0)
  })

  it('collapses and restores the side panel', async () => {
    mount()
    await flush()
    expect(document.querySelector('.fs-side')).not.toBeNull()
    await click(foldButton())
    expect(document.querySelector('.fs-side')).toBeNull()
    expect(document.querySelector('.fs-split')).toBeNull()
    await click(foldButton())
    expect(document.querySelector('.fs-side')).not.toBeNull()
  })

  it('keeps the split pane rendered while the tree is collapsed', async () => {
    // 折叠文件树与分栏是两个独立开关：折叠态下点「分栏」，右侧窗格与它的分隔条都必须出现
    //（缺陷：`fs-body` 只在「未折叠」分支里渲染这两件，折叠后开关翻转却什么都不发生）。
    mount()
    await flush()
    await click(row('app.ts'))
    await click(splitButton())
    expect(document.querySelectorAll('.fs-splitpane')).toHaveLength(1)
    // 折叠：树没了，分栏照旧 —— 分隔条仍在，顺序仍是 editor → splitBar → splitPane
    //（拖拽回调靠 previousElementSibling / nextElementSibling 取两侧窗格）。
    await click(foldButton())
    expect(document.querySelector('.fs-side')).toBeNull()
    const body = document.querySelector('.fs-body') as HTMLElement
    expect(body.children).toHaveLength(3)
    expect(body.children[1]?.className).toContain('fs-split')
    expect(body.children[2]?.className).toContain('fs-splitpane')
    expect(document.querySelector('.fs-splitpane .fs-main')).not.toBeNull()
    // 折叠态下关掉分栏：只剩左侧窗格。
    await click(splitButton())
    expect(document.querySelectorAll('.fs-splitpane')).toHaveLength(0)
    expect((document.querySelector('.fs-body') as HTMLElement).children).toHaveLength(1)
  })

  it('renders no split pane when the tree is collapsed and no split was opened', async () => {
    // 另一半的反向对照：折叠本身不得凭空造出分隔条 / 窗格。
    mount()
    await flush()
    await click(row('app.ts'))
    await click(foldButton())
    expect(document.querySelector('.fs-side')).toBeNull()
    expect(document.querySelectorAll('.fs-split')).toHaveLength(0)
    expect(document.querySelectorAll('.fs-splitpane')).toHaveLength(0)
    expect((document.querySelector('.fs-body') as HTMLElement).children).toHaveLength(1)
  })

  it('drags the splitter within the clamped range', async () => {
    mount()
    await flush()
    const split = document.querySelector('.fs-split') as HTMLElement
    await act(async () => {
      split.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 300 }))
    })
    expect((document.querySelector('.fs-split') as HTMLElement).className).toContain('active')
    await act(async () => {
      document.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 10000 }))
    })
    expect((document.querySelector('.fs-side') as HTMLElement).style.width).toBe('420px')
    await act(async () => {
      document.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: -10000 }))
    })
    expect((document.querySelector('.fs-side') as HTMLElement).style.width).toBe('180px')
    await act(async () => {
      document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
    })
    expect((document.querySelector('.fs-split') as HTMLElement).className).not.toContain('active')
  })

  it('refreshes the current root from the toolbar', async () => {
    mount()
    await flush()
    const before = hits('/api/fs/tree?path=.')
    await click(refreshButton())
    expect(hits('/api/fs/tree?path=.')).toBe(before + 1)
    expect(hits('/api/fs/set-root')).toBe(0)
  })
})

describe('generation menu (C)', () => {
  it('offers only the translation entry for a project markdown file', async () => {
    mount()
    await flush()
    await click(row('README.md'))
    await click(button(L('btnGen')))
    // R1: markdown gets no L2/L3 entry (the host refuses it), only translation —
    // and this node already has a translation, so the label is 「重新翻译」.
    expect(menuLabels()).toEqual([L('btnTrRegen')])
  })

  it('runs a source-annotation generation and switches to the annot tab', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'src', status: 'success', docRel: 'bk/src/new.md' } } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('app.ts'))
    await click(button(L('btnGen')))
    expect(byText('.stub-menu-item', L('genFile'))).toBeTruthy()
    await click(byText('.stub-menu-item', L('genSrcRegen')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(calls.find(call => call.url === '/api/fs/gen-doc')?.init?.body).toBe(JSON.stringify({ kind: 'src', path: 'app.ts' }))
    expect(viewIs('labAnnot')).toBe(true)
  })

  it('runs a file-summary generation and switches to the doc tab', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'file', status: 'success', docRel: 'bk/file/new.md' } } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('app.ts'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFile')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(viewIs('labDocFile')).toBe(true)
  })

  it('reports a folder generation failure', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'error', error: 'kaboom' } } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    expect(byText('.stub-menu-item', L('genFolder'))).toBeTruthy()
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(byTextIncluding('.fs-load', L('errGenFailWith') + 'kaboom')).toBeTruthy()
  })

  it('shows the folder busy banner and the file busy banner while generating', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'pending' } } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(byText('.fs-load', L('genFolderBusy'))).toBeTruthy()
  })

  it('shows the source busy banner while an annotation generates', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'src', status: 'pending' } } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain.py'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genSrc')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(byText('.fs-load', L('genSrcBusy'))).toBeTruthy()
  })

  it('shows the file busy banner while a summary generates', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'file', status: 'pending' } } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain.py'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFile')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(byText('.fs-load', L('genFileBusy'))).toBeTruthy()
  })

  it('opens the generation menu on hover over the wrapper', async () => {
    mount()
    await flush()
    await click(row('plain'))
    const wrap = document.querySelector('.fs-genwrap') as HTMLElement
    await act(async () => {
      wrap.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
    })
    await flush()
    expect(byText('.stub-menu-item', L('genFolder'))).toBeTruthy()
  })
})

/**
 * Deferred reply helper: a handler that parks until the test releases it, so a
 * request can be left in flight across an unmount.
 */
interface Deferred {
  release: () => void
  fail: (error: unknown) => void
}

/**
 * Build a `fetch` handler that parks the given URL prefix until released.
 * @param prefix - URL prefix to park.
 * @param onRelease - reply returned once released.
 * @param fallback - handler used for every other URL.
 * @returns the parking control and the handler.
 */
function park(prefix: string, onRelease: () => Reply, fallback: Handler): { control: Deferred; handler: Handler } {
  // A directory node reads the same URL twice (baseline §附加 item 5), so every
  // parked call is retained: releasing only the last one would strand the other
  // callback forever.
  const resolvers: Array<() => void> = []
  const rejecters: Array<(error: unknown) => void> = []
  const handler: Handler = (url, init) => {
    if (!url.startsWith(prefix)) return fallback(url, init)
    return new Promise<Reply>((resolve, reject) => {
      resolvers.push(() => { resolve(onRelease()) })
      rejecters.push((error: unknown) => { reject(error instanceof Error ? error : new Error(String(error))) })
    })
  }
  return {
    control: {
      release: () => { for (const resolve of resolvers.splice(0)) resolve() },
      fail: (error: unknown) => { for (const reject of rejecters.splice(0)) reject(error) },
    },
    handler,
  }
}

describe('client entry: error paths, guards and teardown (C/F)', () => {
  it('renders an empty message when a rejection carries no text', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/root')) throw ''
      return defaultHandler(url)
    }
    mount()
    await flush()
    expect(byTextIncluding('.fs-load', L('errLoadFail'))).toBeTruthy()
  })

  it('reports a generation that never returns a task id', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await flush()
    expect(byTextIncluding('.fs-load', L('errGenNoTaskId'))).toBeTruthy()
  })

  it('reports a generation request that fails outright', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { status: 500, body: { error: 'refused' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await flush()
    // The gen-doc arm surfaces the thrown message verbatim (no prefix).
    expect(byTextIncluding('.fs-load', 'refused')).toBeTruthy()
  })

  it('times a task out after the poll ceiling', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'pending' } } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60 * 1000) })
    await flush()
    expect(byTextIncluding('.fs-load', L('errPollTimeout'))).toBeTruthy()
  })

  it('reports a task the host no longer knows', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) return { body: { ok: true, task: null } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(byTextIncluding('.fs-load', L('errGenTaskGone'))).toBeTruthy()
  })

  it('reports a polling request that fails', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) return { status: 503, body: { error: 'busy' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(byTextIncluding('.fs-load', L('errGenFailWith') + 'busy')).toBeTruthy()
  })

  it('stops polling once the pane is gone', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'pending' } } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    const polls = hits('/api/fs/gen-status?id=t1')
    const current = root
    await act(async () => { current?.unmount() })
    root = undefined
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(hits('/api/fs/gen-status?id=t1')).toBe(polls)
  })

  it('discards a poll reply that lands after the pane is gone', async () => {
    vi.useFakeTimers()
    const inner = defaultHandler
    const parked = park('/api/fs/gen-status', () => ({ body: { ok: true, task: { id: 't1', kind: 'folder', status: 'success', docRel: 'x.md' } } }), inner)
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      return parked.handler(url, undefined)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(urls()).not.toContain('/api/fs/read?path=x.md')
  })

  it('discards a poll failure that lands after the pane is gone', async () => {
    vi.useFakeTimers()
    const parked = park('/api/fs/gen-status', () => ({ body: { ok: true, task: null } }), url => defaultHandler(url))
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      return parked.handler(url, undefined)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    const current = root
    await unmountAndRelease(current, () => { parked.control.fail(new Error('late')) })
    expect(document.querySelector('.fs-load')).toBeNull()
  })

  it('reports a generated document without a path', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'success' } } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(byTextIncluding('.fs-load', L('errGenNoDocRel'))).toBeTruthy()
  })

  it('reports a failed read of the freshly generated document', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'success', docRel: 'fresh.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=fresh.md')) return { status: 500, body: { error: 'gone' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(byTextIncluding('.fs-load', L('errGenReadFail') + 'gone')).toBeTruthy()
  })

  it('lands a successful folder overview into the pane', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'success', docRel: 'fresh.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=fresh.md')) return { body: { content: 'fresh overview', ext: 'md', size: 14 } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(document.querySelector('.stub-md')?.textContent).toBe('fresh overview')
  })

  it('resets the file generation state when a file generation fails', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'file', status: 'error' } } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain.py'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFile')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    // genState returns to idle, so the busy banner is gone and the source shows.
    expect(document.querySelector('.stub-code')).not.toBeNull()
  })

  it('ignores a second generation request while one is running', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) return { body: { ok: true, task: { id: 't1', kind: 'file', status: 'pending' } } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain.py'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFile')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    const before = calls.filter(call => call.url === '/api/fs/gen-doc').length
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFile')))
    expect(calls.filter(call => call.url === '/api/fs/gen-doc').length).toBe(before)
  })

  it('ignores a generation request for a node without a path', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({
      rootPath: '/proj',
      opened: { type: 'directory', name: 'orphan' },
      expanded: [],
    }))
    mount()
    await flush()
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    expect(calls.filter(call => call.url === '/api/fs/gen-doc')).toHaveLength(0)
  })

  it('ignores a translation request while one is running', async () => {
    const parked = park('/api/fs/translate', () => ({ body: { ok: true, started: true, taskId: 't2' } }), url => defaultHandler(url))
    handler = url => parked.handler(url, undefined)
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    // Busy is readable with the menu shut (the gap R1 left): the button itself
    // turns into 「翻译中…」 and goes disabled, so re-entry is refused outright.
    const busyButton = byText('.fs-hbar-right button', L('btnTrLoading'))
    expect((busyButton as HTMLButtonElement).disabled).toBe(true)
    // The menu entry carries the same fact — and, the button being disabled,
    // hovering is now the only way to open it.
    await openGenMenu()
    const disabled = byText('.stub-menu-item', L('btnTrLoading'))
    expect((disabled as HTMLButtonElement).disabled).toBe(true)
    await click(disabled)
    expect(calls.filter(call => call.url === '/api/fs/translate')).toHaveLength(1)
    parked.control.release()
    await settle()
  })

  it('reports a translation that never returns a task id', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    await flush()
    // The failure clears the busy flag, so the button returns to its idle label.
    expect(await entryDisabled('btnTrRegen')).toBe(false)
    expect(calls.filter(call => call.url === '/api/fs/translate')).toHaveLength(1)
  })

  it('reports a translate request that fails outright', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { status: 500, body: { error: 'nope' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    await flush()
    expect(await entryDisabled('btnTrRegen')).toBe(false)
  })

  it('reports a translation result without a document path', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success' } } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(await entryDisabled('btnTrRegen')).toBe(false)
  })

  it('reports a failed read of the freshly translated document', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success', docRel: 'tr/out.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=tr%2Fout.md')) return { status: 500, body: { error: 'gone' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(await entryDisabled('btnTrRegen')).toBe(false)
  })

  it('drops a translation reply that lands after the pane is gone', async () => {
    vi.useFakeTimers()
    const parked = park('/api/fs/gen-status', () => ({ body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success', docRel: 'tr/out.md' } } }), url => defaultHandler(url))
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      return parked.handler(url, undefined)
    }
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(urls()).not.toContain('/api/fs/read?path=tr%2Fout.md')
  })

  it('discards a generation failure that lands after the pane is gone', async () => {
    vi.useFakeTimers()
    const parked = park('/api/fs/gen-status', () => ({ body: { ok: true, task: { id: 't1', kind: 'file', status: 'error', error: 'x' } } }), url => defaultHandler(url))
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      return parked.handler(url, undefined)
    }
    mount()
    await flush()
    await click(row('plain.py'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFile')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.fs-load')).toBeNull()
  })

  it('discards a generated document that arrives after the pane is gone', async () => {
    vi.useFakeTimers()
    const parked = park('/api/fs/read?path=fresh.md', () => ({ body: { content: 'late', ext: 'md', size: 4 } }), url => defaultHandler(url))
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'success', docRel: 'fresh.md' } } }
      }
      return parked.handler(url, undefined)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.stub-md')).toBeNull()
  })

  it('ignores a worktree selection with an empty id', async () => {
    wsSnapshot = { items: [{ workspaceId: '', path: '/blank', title: 'Blank' }] }
    mount({ workspaces: workspacesStub() })
    await flush()
    await click(byText('.fs-wsbtn', 'Blank'))
    await click(byText('.stub-menu-item', 'Blank' + L('wsItemSep') + '/blank'))
    expect(hits('/api/fs/set-root')).toBe(0)
  })

  it('closes both menus through their onClose handlers', async () => {
    mount({ workspaces: workspacesStub() })
    await flush()
    await click(byText('.fs-wsbtn', 'proj'))
    expect(document.querySelector('.stub-menu')).not.toBeNull()
    await click(byText('.stub-menu-close', 'close'))
    expect(document.querySelector('.stub-menu')).toBeNull()

    await click(row('plain'))
    await click(button(L('btnGen')))
    expect(document.querySelector('.stub-menu')).not.toBeNull()
    await click(byText('.stub-menu-close', 'close'))
    expect(document.querySelector('.stub-menu')).toBeNull()
  })

  it('abandons a restore when the pane unmounts while the root read is in flight', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ rootPath: '/proj', expanded: ['src'] }))
    const parked = park('/api/fs/root', () => ({ body: { root: '/proj' } }), url => defaultHandler(url))
    handler = url => parked.handler(url, undefined)
    mount()
    await flush()
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(urls()).not.toContain('/api/fs/tree?path=.')
  })

  it('abandons the restore tree read and the cache backfill after an unmount', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ rootPath: '/proj', expanded: ['src'] }))
    // Parking the BACKFILL read (not the top-level one) lets the restore reach
    // the cache step before the pane goes away.
    const parked = park('/api/fs/tree?path=src', () => ({ body: { path: 'src', list: [] } }), url => defaultHandler(url))
    handler = url => parked.handler(url, undefined)
    mount()
    await flush()
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    // The backfill read really was in flight when the pane went away, and its
    // late reply is dropped rather than written into a dead tree.
    expect(urls()).toContain('/api/fs/tree?path=src')
    expect(document.querySelector('.fs-tr')).toBeNull()
  })

  it('drops a worktree notification that lands after an unmount', async () => {
    mount({ workspaces: workspacesStub() })
    await flush()
    const notify = wsNotify
    const current = root
    await act(async () => { current?.unmount() })
    root = undefined
    expect(() => { notify?.() }).not.toThrow()
  })

  it('discards a translated document that arrives after an unmount', async () => {
    vi.useFakeTimers()
    const parked = park('/api/fs/read?path=tr%2Fout.md', () => ({ body: { content: 'late', ext: 'md', size: 4 } }), url => defaultHandler(url))
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success', docRel: 'tr/out.md' } } }
      }
      return parked.handler(url, undefined)
    }
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(urls()).toContain('/api/fs/read?path=tr%2Fout.md')
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.stub-md')).toBeNull()
  })

  it('discards a failed translation read after an unmount', async () => {
    vi.useFakeTimers()
    const parked = park('/api/fs/read?path=tr%2Fout.md', () => ({ status: 500, body: { error: 'late' } }), url => defaultHandler(url))
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success', docRel: 'tr/out.md' } } }
      }
      return parked.handler(url, undefined)
    }
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.stub-md')).toBeNull()
  })

  it('discards a failed translate request after an unmount', async () => {
    const parked = park('/api/fs/translate', () => ({ status: 500, body: { error: 'late' } }), url => defaultHandler(url))
    handler = url => parked.handler(url, undefined)
    mount()
    await flush()
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.stub-md')).toBeNull()
  })

  it('discards a failed generation read after an unmount', async () => {
    vi.useFakeTimers()
    const parked = park('/api/fs/read?path=fresh.md', () => ({ status: 500, body: { error: 'late' } }), url => defaultHandler(url))
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'success', docRel: 'fresh.md' } } }
      }
      return parked.handler(url, undefined)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.stub-md')).toBeNull()
  })
})

describe('client entry: ternary and fallback arms (B/C)', () => {
  it('treats a null rejection as an empty message', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/root')) throw null
      return defaultHandler(url)
    }
    mount()
    await flush()
    expect(byTextIncluding('.fs-load', L('errLoadFail'))).toBeTruthy()
  })

  it('renders an empty markdown document without a body', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=bk%2Fd%2Ffull.md')) {
        return { body: { content: '', ext: 'md', size: 0 } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('full.md'))
    // R3: the pane opens on source, so the empty DOCUMENT is reached explicitly.
    await pickView('labDocFile')
    expect(document.querySelector('.stub-md')?.textContent).toBe('')
  })

  it('renders a frontmatter-only document with an empty body', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=bk%2Fd%2Ffull.md')) {
        return { body: { content: '---\ntitle: T\n---', ext: 'md', size: 18 } }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('full.md'))
    // R3: the pane opens on source, so the document view is reached explicitly.
    await pickView('labDocFile')
    expect(byText('.fs-fmval', 'T')).toBeTruthy()
    expect(document.querySelector('.stub-md')?.textContent).toBe('')
  })

  it('omits the badge for a file without an extension', async () => {
    mount()
    await flush()
    expect(row('Makefile').querySelector('.stub-tag')).toBeNull()
    await click(row('Makefile'))
    expect(urls()).toContain('/api/fs/read?path=Makefile')
    expect(document.querySelector('.fs-code')?.textContent).toBe('all:')
  })

  it('falls back to the annot tab when a directory carries a source annotation', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/tree?path=.')) {
        return {
          body: {
            path: '.',
            list: [{ type: 'directory', path: 'anno', name: 'anno', hasDocSrc: true, docSrcRel: 'bk/s/anno.md' }],
          },
        }
      }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('anno'))
    // Without source content the only view is the annotation one, so the
    // dropdown has nothing else to offer.
    expect(viewIs('labAnnot')).toBe(true)
    expect(await viewItems()).toEqual([])
  })

  it('keeps the translation view once translation data has landed', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success', docRel: 'tr/full.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=tr%2Ffull.md')) return { body: { content: 'translated', ext: 'md', size: 10 } }
      return defaultHandler(url)
    }
    vi.useFakeTimers()
    mount()
    await flush()
    // full.md already has a translation, so the entry reads 「重新翻译」.
    await click(row('full.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(viewIs('labTr')).toBe(true)
    // Switching away and back keeps the view: modes now includes tr via trData.
    await pickView('labSrc')
    expect(await viewItems()).toContain(L('labTr'))
  })

  it('shows the loading line for an annot view with no data yet', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=bk%2Fs%2Ffull.md')) return { status: 500, body: {} }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('full.md'))
    await pickView('labAnnot')
    expect(byText('.fs-load', L('loading'))).toBeTruthy()
  })

  it('shows the loading line for a tr view with no data yet', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=bk%2Ft%2Ffull.md')) return { status: 500, body: {} }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('full.md'))
    await pickView('labTr')
    expect(byText('.fs-load', L('loading'))).toBeTruthy()
  })

  it('shows the loading line for a doc view with no data yet', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=bk%2Fd%2Ffull.md')) return { status: 500, body: {} }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('full.md'))
    await pickView('labDocFile')
    expect(byText('.fs-load', L('loading'))).toBeTruthy()
  })

  it('tolerates a tree reply without a list', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/root')) return { body: { root: '/proj' } }
      if (url.startsWith('/api/fs/tree')) return { body: { path: '.' } }
      return { body: { ok: true } }
    }
    mount()
    await flush()
    expect(byText('.fs-empty', L('emptyDir'))).toBeTruthy()
  })

  it('restores from an archive without a root path', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ treeW: 300, expanded: [] }))
    mount()
    await flush()
    // No set-root call, but the root is still read.
    expect(hits('/api/fs/set-root')).toBe(0)
    expect(urls()).toContain('/api/fs/root')
    expect((document.querySelector('.fs-side') as HTMLElement).style.width).toBe('300px')
  })

  it('degrades a restore whose directory reply has no list', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ rootPath: '/proj', expanded: ['src'] }))
    handler = (url) => {
      if (url.startsWith('/api/fs/tree?path=src')) return { body: { path: 'src' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    expect(row('src').className).toContain('fs-open')
    expect(document.querySelector('.fs-tr.fs-open .fs-chevslot')).not.toBeNull()
  })

  it('refreshes the parent cache for a nested translation with an empty reply list', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/tree?path=src')) {
        return { body: { path: 'src', list: [{ type: 'file', path: 'src/child.md', name: 'child.md', hasDocTr: true, docTrRel: 'bk/tr/child.md' }] } }
      }
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success', docRel: 'bk/tr/child.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=bk%2Ftr%2Fchild.md')) return { body: { content: '', ext: 'md', size: 0 } }
      return defaultHandler(url)
    }
    vi.useFakeTimers()
    mount()
    await flush()
    await click(row('src'))
    await click(row('child.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    // The empty translation still switches the pane to the tr tab.
    expect(document.querySelector('.stub-md')?.textContent).toBe('')
  })

  it('labels a folder card whose node has a path but no name', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({
      rootPath: '/proj',
      opened: { type: 'directory', path: 'nameless' },
      expanded: [],
    }))
    mount()
    await flush()
    expect(byText('.fs-folder-card-path-name', 'nameless')).toBeTruthy()
  })

  it('offers the plain generate label for a source file without a summary', async () => {
    mount()
    await flush()
    await click(row('Makefile'))
    await click(button(L('btnGen')))
    expect(byText('.stub-menu-item', L('genFile'))).toBeTruthy()
    expect(byText('.stub-menu-item', L('genSrc'))).toBeTruthy()
  })

  it('does not open the interpretation menu on hover when nothing is offered', async () => {
    mount()
    await flush()
    // A `.book/` markdown has no entry at all (no L2/L3, and it is not a
    // translation target), which is the only remaining empty-menu case.
    await click(row('note.md'))
    const wrap = document.querySelector('.fs-genwrap') as HTMLElement
    await act(async () => {
      wrap.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
    })
    await flush()
    expect(document.querySelector('.stub-menu')).toBeNull()
  })

  it('shows the bare relative path when the root name is unknown', async () => {
    // An empty root path leaves rootName blank while the tree still loads.
    handler = (url) => {
      if (url.startsWith('/api/fs/root')) return { body: { root: '' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    expect(byText('.fs-hd-path', 'plain')).toBeTruthy()
  })

  it('reads the extensions of a node without a path', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({
      rootPath: '/proj',
      opened: { type: 'file' },
      expanded: [],
    }))
    mount()
    await flush()
    // hasSource is true, so the pane waits on a read that never starts.
    expect(document.querySelector('.fs-load')).not.toBeNull()
  })
})

describe('client entry: unmount during a document read (C)', () => {
  it('abandons every document read when the pane unmounts', async () => {
    const targets = ['full.md', 'bk%2Fd%2Ffull.md', 'bk%2Fs%2Ffull.md', 'bk%2Ft%2Ffull.md']
    const parks = targets.map(target => ({
      target,
      parked: park('/api/fs/read?path=' + target, () => ({ body: { content: 'late', ext: 'md', size: 4 } }), (url: string) => defaultHandler(url)),
    }))
    handler = (url) => {
      const hit = parks.find(entry => url.startsWith('/api/fs/read?path=' + entry.target))
      if (hit !== undefined) return hit.parked.handler(url, undefined)
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('full.md'))
    await flush()
    for (const target of targets) expect(urls()).toContain('/api/fs/read?path=' + target)
    const current = root
    await act(async () => { current?.unmount() })
    root = undefined
    for (const entry of parks) entry.parked.control.release()
    await settle()
    expect(document.querySelector('.stub-md')).toBeNull()
  })

  it('abandons a folder overview read when the pane unmounts', async () => {
    const parked = park('/api/fs/read?path=bk%2Fdir%2Fsrc.md', () => ({ body: { content: 'late', ext: 'md', size: 4 } }), url => defaultHandler(url))
    handler = url => parked.handler(url, undefined)
    mount()
    await flush()
    await click(row('src'))
    await flush()
    expect(urls()).toContain('/api/fs/read?path=bk%2Fdir%2Fsrc.md')
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.stub-md')).toBeNull()
  })

  it('abandons a failing folder overview read when the pane unmounts', async () => {
    const parked = park('/api/fs/read?path=bk%2Fdir%2Fsrc.md', () => ({ status: 500, body: { error: 'late' } }), url => defaultHandler(url))
    handler = url => parked.handler(url, undefined)
    mount()
    await flush()
    await click(row('src'))
    await flush()
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.fs-folder-card')).toBeNull()
  })

  it('abandons a failing source read when the pane unmounts', async () => {
    const parked = park('/api/fs/read?path=plain.py', () => ({ status: 500, body: { error: 'late' } }), url => defaultHandler(url))
    handler = url => parked.handler(url, undefined)
    mount()
    await flush()
    await click(row('plain.py'))
    await flush()
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.fs-load')).toBeNull()
  })

  it('abandons a restore failure that lands after an unmount', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ rootPath: '/proj', expanded: [] }))
    const parked = park('/api/fs/root', () => ({ status: 500, body: { error: 'late' } }), url => defaultHandler(url))
    handler = url => parked.handler(url, undefined)
    mount()
    await flush()
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.fs-load')).toBeNull()
  })
})

describe('client entry: optional-prop and empty-payload arms (C)', () => {
  it('offers the fresh translation entry for a markdown file with no translation', async () => {
    mount()
    await flush()
    await click(row('plain.md'))
    // No docTr marker on the node → the entry reads 「翻译」.
    await click(button(L('btnGen')))
    expect(menuLabels()).toEqual([L('btnTr')])
  })

  it('renders a folder overview whose content is empty', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=bk%2Fdir%2Fsrc.md')) return { body: { content: '', ext: 'md', size: 0 } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('src'))
    expect(document.querySelector('.stub-md')?.textContent).toBe('')
    expect(document.querySelector('.fs-folder-card')).toBeNull()
  })

  it('renders an annotation whose content is empty', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/read?path=bk%2Fs%2Ffull.md')) return { body: { content: '', ext: 'md', size: 0 } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('full.md'))
    await pickView('labAnnot')
    expect(document.querySelector('.stub-md')?.textContent).toBe('')
  })

  it('accepts an empty generated folder overview', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'folder', status: 'success', docRel: 'fresh.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=fresh.md')) return { body: { content: '', ext: 'md', size: 0 } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(document.querySelector('.fs-folder-card')).toBeNull()
    expect(document.querySelector('.stub-md')?.textContent).toBe('')
  })

  it('accepts an empty generated file summary', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'file', status: 'success', docRel: 'fresh.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=fresh.md')) return { body: { content: '', ext: 'md', size: 0 } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain.py'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFile')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(viewIs('labDocFile')).toBe(true)
    expect(document.querySelector('.stub-md')?.textContent).toBe('')
  })

  it('accepts an empty generated source annotation', async () => {
    vi.useFakeTimers()
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-doc')) return { body: { ok: true, started: true, taskId: 't1' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't1', kind: 'src', status: 'success', docRel: 'fresh.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=fresh.md')) return { body: { content: '', ext: 'md', size: 0 } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    await click(row('plain.py'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genSrc')))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(viewIs('labAnnot')).toBe(true)
    expect(document.querySelector('.stub-md')?.textContent).toBe('')
  })

  it('tolerates a restore reply without a list on the top-level tree', async () => {
    localStorage.setItem('fs.ui.v1', JSON.stringify({ rootPath: '/proj', expanded: [] }))
    handler = (url) => {
      if (url.startsWith('/api/fs/tree?path=.')) return { body: { path: '.' } }
      return defaultHandler(url)
    }
    mount()
    await flush()
    expect(urls()).toContain('/api/fs/root')
    expect(byText('.fs-empty', L('emptyDir'))).toBeTruthy()
  })

  it('tolerates a parent refresh reply without a list after a translation', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't2' } }
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't2', kind: 'translate', status: 'success', docRel: 'tr/full.md' } } }
      }
      if (url.startsWith('/api/fs/read?path=tr%2Ffull.md')) return { body: { content: 'x', ext: 'md', size: 1 } }
      if (url.startsWith('/api/fs/tree?path=.')) {
        return calls.filter(call => call.url === '/api/fs/tree?path=.').length > 1
          ? { body: { path: '.' } }
          : { body: { path: '.', list: TOP_TREE } }
      }
      return defaultHandler(url)
    }
    vi.useFakeTimers()
    mount()
    await flush()
    await click(row('full.md'))
    await translateVia('btnTrRegen')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    expect(viewIs('labTr')).toBe(true)
  })
})


describe('client entry: regeneration labels and late gen-doc failures (C)', () => {
  it('offers the regenerate label for a summarised source file', async () => {
    mount()
    await flush()
    await click(row('doc.txt'))
    await click(button(L('btnGen')))
    expect(byText('.stub-menu-item', L('genFileRegen'))).toBeTruthy()
    expect(byText('.stub-menu-item', L('genSrc'))).toBeTruthy()
  })

  it('discards a failed generation request after an unmount', async () => {
    const parked = park('/api/fs/gen-doc', () => ({ status: 500, body: { error: 'late' } }), url => defaultHandler(url))
    handler = url => parked.handler(url, undefined)
    mount()
    await flush()
    await click(row('plain'))
    await click(button(L('btnGen')))
    await click(byText('.stub-menu-item', L('genFolder')))
    const current = root
    await unmountAndRelease(current, () => { parked.control.release() })
    expect(document.querySelector('.fs-load')).toBeNull()
  })
})

describe('view selector and interpretation menu (R1/R3)', () => {
  it('pins the interpretation menu to the four object kinds', async () => {
    mount()
    await flush()
    // A directory gets the folder overview and nothing else.
    await click(row('plain'))
    await click(button(L('btnGen')))
    expect(menuLabels()).toEqual([L('genFolder')])
    // A plain file gets both document levels.
    await click(row('plain.py'))
    expect(menuLabels()).toEqual([L('genFile'), L('genSrc')])
    // A project markdown gets translation only — no L2/L3, which the host refuses.
    await click(row('plain.md'))
    expect(menuLabels()).toEqual([L('btnTr')])
    // A `.book/` markdown is not a translation target either: the menu collapses.
    await click(row('note.md'))
    expect(document.querySelector('.stub-menu')).toBeNull()
  })

  it('opens a file on its source and mirrors the view name on the button', async () => {
    mount()
    await flush()
    // full.md carries a summary, an annotation AND a translation, yet R3 still
    // puts the source first.
    await click(row('full.md'))
    expect(viewIs('labSrc')).toBe(true)
    // The dropdown lists the remaining three in the pinned order: source →
    // summary → annotation → translation (the current view is omitted).
    expect(await viewItems()).toEqual([L('labDocFile'), L('labAnnot'), L('labTr')])
    // Picking one moves the button label with the pane, and the dropdown then
    // offers the source back in first position.
    await pickView('labAnnot')
    expect(viewIs('labAnnot')).toBe(true)
    expect(await viewItems()).toEqual([L('labSrc'), L('labDocFile'), L('labTr')])
  })

  it('keeps the summary-first fallback for a node that has no source', async () => {
    mount()
    await flush()
    await click(row('src'))
    // A directory always has `hasSource === false`, so the old fallback stands.
    expect(viewIs('labDocDir')).toBe(true)
    expect(await viewItems()).toEqual([])
  })

  it('names the placeholder card 「目录概览」 for a directory with nothing generated', async () => {
    mount()
    await flush()
    await click(row('plain'))
    // The card says the folder overview has not been generated yet, so the
    // button must not read 「源码」: a directory never has a source view.
    expect(byText('.fs-folder-card-ti', L('folderCardTitle'))).toBeTruthy()
    expect(viewIs('labDocDir')).toBe(true)
    expect(await viewItems()).toEqual([])
  })

  it('treats a click on the selector body as a no-op', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    // Edit mode makes "nothing changed" observable: the old Pill left it behind
    // (`setMode` + `setEditMode(false)`), R3's click must not.
    await click(button(L('btnEdit')))
    expect(document.querySelector('.fs-area')).not.toBeNull()
    const before = urls().length
    await click(viewBtn())
    expect(viewIs('labSrc')).toBe(true)
    expect(document.querySelector('.fs-area')).not.toBeNull()
    expect(document.querySelector('.fs-dirty')).toBeNull()
    expect(urls()).toHaveLength(before)
  })

  it('leaves edit mode when a view is picked from the dropdown', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    await click(button(L('btnEdit')))
    expect(document.querySelector('.fs-area')).not.toBeNull()
    await pickView('labTr')
    expect(viewIs('labTr')).toBe(true)
    expect(document.querySelector('.fs-area')).toBeNull()
  })

  it('offers the view dropdown on hover and keeps it to the ready views', async () => {
    mount()
    await flush()
    // app.ts has only a source annotation: nothing else is ready, so the
    // dropdown opens empty.
    await click(row('app.ts'))
    expect(await viewItems()).toEqual([L('labAnnot')])
    // README.md has a summary and a translation but no annotation.
    await click(row('README.md'))
    expect(await viewItems()).toEqual([L('labDocFile'), L('labTr')])
  })
})

describe('dropdown layering: the toolbar clip box must not crop the panels (R1/R3)', () => {
  /**
   * The one open dropdown panel.
   * @returns the panel element.
   */
  function panel(): HTMLElement {
    const node = document.querySelector('.stub-menu')
    if (node === null) throw new Error('no open dropdown panel')
    return node as HTMLElement
  }

  /**
   * Assert the open panel escaped the toolbar's clip box: it is mounted on
   * `document.body`, so no `overflow:hidden` ancestor of the toolbar can crop it.
   * @param where - label naming the dropdown under test.
   * @param hoverClose - whether this menu still carries the hover-to-close grace.
   */
  function expectOutsideToolbar(where: string, hoverClose: boolean): void {
    expect(`${where}:${panel().parentElement === document.body}`).toBe(`${where}:true`)
    // The real `.mr-list` is absolutely positioned 4px below its anchor, so inside a
    // 48px-high toolbar it always overflows vertically; as a descendant of either clip
    // box it is cropped to a sliver — that is the reported 「下拉看不到」.
    expect(panel().closest('.fs-hbar')).toBeNull()
    expect(panel().closest('.fs-hbar-mid')).toBeNull()
    // 悬停收起语义在 portal 化之后**一个字都没改**：解读选择与视图选择器仍传
    // `closeOnPointerLeave`（React 的 enter/leave 按 fiber 树判定，portal 出去的面板在 React
    // 树里仍是锚点的后代，指针移进面板不会触发锚点的 pointerleave），工作区菜单本来就没有。
    expect(panel().getAttribute('data-close-on-pointer-leave')).toBe(hoverClose ? '1' : '')
  }

  it('mounts the interpretation dropdown outside the toolbar clip box', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    await openGenMenu()
    expectOutsideToolbar('gen', true)
  })

  it('mounts the view dropdown outside the toolbar clip box', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    await openViewMenu()
    expectOutsideToolbar('view', true)
  })

  it('mounts the workspace dropdown outside the toolbar clip box', async () => {
    mount({ workspaces: workspacesStub() })
    await flush()
    await click(byText('.fs-wsbtn', 'proj'))
    expectOutsideToolbar('ws', false)
  })

  it('keeps the toolbar clip declaration the cross-column fix depends on', () => {
    apply(makeCtx())
    const css = document.head.querySelector('style[data-plugin="fs"]')?.textContent ?? ''
    // 修法靠 portal，**不是**撤销第一段的兜底裁剪：`.fs-hbar` 那条一旦被删，跨列可见重叠会回到
    // 基线的 544 档（见 PROGRESS.md §3 的消融实验）。留着它、把浮层搬出裁剪盒，两条要求才同时成立。
    expect(css).toContain('padding:6px 0;overflow:hidden;container-type:inline-size}')
    // `.fs-hbar-mid` 那条 `overflow:hidden`（第一段「防视图选择器画到右列」）已随视图选择器搬到右列
    // 而删除：中列只剩路径、不再有会外溢的按钮 ⇒ 无消费者，实测去掉它 3857 档逐档逐字段 0 差异
    // （`out-after-nomidclip.json` vs `out-after-lian.json`）。这条反向断言钉住它没被顺手加回来。
    expect(css).toContain('.fs-hbar-mid{display:flex;align-items:center;gap:10px;min-width:0}')
    expect(css).not.toContain('.fs-hbar-mid{display:flex;align-items:center;gap:10px;min-width:0;overflow:hidden}')
  })
})

describe('narrow toolbar: icon bands (R2)', () => {
  /** The toolbar button carrying the given visible label. */
  function rightButton(label: string): HTMLElement {
    return byText('.fs-hbar-right button', label)
  }

  it('wraps each collapsible label so the narrow band can hide it, keeping the aria name', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    // 三个按钮的可见文字在 `.fs-btnlabel` 里 —— 窄档样式表隐藏的正是这一层；
    // 文字节点留在 DOM 里，纯图标态的可访问名由常驻的 aria-label 给出。
    // 阵列按**文档顺序**读：右列次序是视图选择 → 解读选择 → 编辑⇄保存 → 分栏，
    // 所以分栏现在排在最后（视图选择器的文字是裸文本、没有 label 层，不在这个数组里；
    // 编辑/保存已合并成一个按钮，故只剩一个「编辑」）。
    expect(Array.from(document.querySelectorAll('.fs-hbar-right .fs-btnlabel'))
      .map(node => (node.textContent || '').trim()))
      .toEqual([L('btnGen'), L('btnEdit'), L('btnSplit')])
    expect(rightButton(L('btnSplit')).getAttribute('aria-label')).toBe(L('btnSplit'))
    expect(rightButton(L('btnGen')).getAttribute('aria-label')).toBe(L('btnGen'))
    expect(rightButton(L('btnEdit')).getAttribute('aria-label')).toBe(L('btnEdit'))
    // 视图选择器的文字**就是**当前视图名（R3.2），因此不参与图标化：它没有 label 层。
    expect(viewBtn().querySelector('.fs-btnlabel')).toBeNull()
  })

  it('moves the view selector into the right group, ordered view → gen → edit → split', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    // 用户裁决：视图选择跟解读选择放在一起、统一在右侧 —— 中列自此只剩路径，一个按钮都不剩。
    expect(document.querySelectorAll('.fs-hbar-mid button')).toHaveLength(0)
    const right = document.querySelector('.fs-hbar-right')
    if (right === null) throw new Error('no right toolbar group')
    /**
     * The identity of one direct child of the right group.
     * @param node - a direct child of `.fs-hbar-right`.
     * @returns `view` / `gen` / `edit` / `split`, or the raw class name when unrecognised.
     */
    function identity(node: Element): string {
      const el = node as HTMLElement
      if (el.classList.contains('fs-viewwrap')) return 'view'
      if (el.classList.contains('fs-genwrap')) return 'gen'
      const named = el.querySelector('.fs-tipwrap button')?.getAttribute('aria-label')
      if (named === L('btnEdit') || named === L('btnSave')) return 'edit'
      if (named === L('btnSplit')) return 'split'
      return el.className
    }
    expect(Array.from(right.children).map(identity)).toEqual(['view', 'gen', 'edit', 'split'])
    // 搬位置**不动**交互语义：仍是那个裸文本、悬停即开下拉的按钮（「不挂气泡」由下一节钉住）。
    expect(viewBtn().closest('.fs-hbar-right')).toBe(right)
    expect(viewBtn().closest('.fs-viewwrap')).not.toBeNull()
  })

  it('merges edit and save into one button that swaps glyph and name with the mode', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    // 查看态：铅笔 + 「编辑」，点它进编辑态（而不是点一个没有用途的「保存」）。
    const idle = rightButton(L('btnEdit'))
    expect(idle.querySelector('[data-icon="IconEditOutline16"]')).not.toBeNull()
    expect(idle.getAttribute('aria-label')).toBe(L('btnEdit'))
    await click(idle)
    const area = document.querySelector('.fs-area')
    expect(area).not.toBeNull()
    // 编辑态：**同一个 DOM 节点**换成 ✓ + 「保存」（同一个节点 ⇒ 气泡锚点不会重挂）。
    const editing = rightButton(L('btnSave'))
    expect(editing).toBe(idle)
    expect(editing.querySelector('[data-icon="IconCheckOutline16"]')).not.toBeNull()
    expect(editing.getAttribute('aria-label')).toBe(L('btnSave'))
    expect(editing.querySelector('.fs-btnlabel')?.textContent).toBe(L('btnSave'))
    // 右列不再有第二个按钮，也再没有「查看」这个第三态。
    expect(document.querySelectorAll('.fs-hbar-right button[aria-label="' + L('btnView') + '"]')).toHaveLength(0)
    // 保存 = 回查看态（`save()` 里带 `setEditMode(false)`），按钮自动换回铅笔。
    await click(editing)
    expect(document.querySelector('.fs-area')).toBeNull()
    expect(rightButton(L('btnEdit')).querySelector('[data-icon="IconEditOutline16"]')).not.toBeNull()
  })

  it('gives the interpretation button the plus glyph', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    // `icon` 在宽档也渲染：窄档只是把文字藏起来，图标本来就是常驻的。
    expect(rightButton(L('btnGen')).querySelector('[data-icon="IconPlusOutline16"]')).not.toBeNull()
  })

  it('keeps 「翻译中…」 on the button itself and swaps in the loading glyph', async () => {
    handler = (url) => {
      if (url.startsWith('/api/fs/gen-status')) {
        return { body: { ok: true, task: { id: 't9', kind: 'translate', status: 'success', docRel: 'bk/tr/README.md' } } }
      }
      if (url.startsWith('/api/fs/translate')) return { body: { ok: true, started: true, taskId: 't9' } }
      if (url.startsWith('/api/fs/read?path=bk%2Ftr%2FREADME.md')) return { body: { content: 'translated', ext: 'md', size: 10 } }
      return defaultHandler(url)
    }
    vi.useFakeTimers()
    mount()
    await flush()
    // README.md 已带译文，所以菜单项读「重新翻译」；轮询没走完之前，按钮自己就是那盏灯。
    await click(row('README.md'))
    await translateVia('btnTrRegen')
    const busy = rightButton(L('btnTrLoading'))
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect(busy.querySelector('[data-icon="IconLoadingOutline16"]')).not.toBeNull()
    expect(busy.getAttribute('aria-label')).toBe(L('btnTrLoading'))
    // 轮询落地后整组复位：文案、图标、可用性都回到常态。
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await flush()
    const idle = rightButton(L('btnGen'))
    expect((idle as HTMLButtonElement).disabled).toBe(false)
    expect(idle.querySelector('[data-icon="IconPlusOutline16"]')).not.toBeNull()
  })

  it('collects the workspace name into the same label layer, one band behind the buttons', async () => {
    mount()
    await flush()
    const ws = document.querySelector('.fs-wsbtn') as HTMLElement
    const name = (ws.textContent || '').trim()
    expect(name.length).toBeGreaterThan(0)
    // 工作区名复用右列那套 label 机制，但归在 `.fs-wslabel` 上：第一档不收它，
    // 因为它同时是「当前在看哪个工作区」的标识，容器还放得下就用文字。
    const label = ws.querySelector('.fs-wslabel')
    expect(label).not.toBeNull()
    expect(label?.className).toContain('fs-btnlabel')
    expect((label?.textContent || '').trim()).toBe(name)
    // 文字被藏起来之后，当前工作区的标识只剩恒定的 aria-label，以及受控的悬停气泡
    // （气泡文案就是完整工作区名 —— 长名本来会被 `.fs-wsbtn{max-width:220px}` 截断）。
    // 原生 `title` 已撤：留着它会与气泡同时出现（双气泡）。
    expect(ws.getAttribute('aria-label')).toBe(name)
    expect(ws.getAttribute('title')).toBeNull()
    expect(ws.closest('.fs-tipwrap')?.parentElement?.getAttribute('data-label')).toBe(name)
  })

  it('routes the bands through container queries instead of JS thresholds', () => {
    apply(makeCtx())
    const css = document.head.querySelector('style[data-plugin="fs"]')?.textContent ?? ''
    // 分档交给样式表：容器查询是唯一持有像素阈值的地方（`.fs-hbar` 自己是查询容器）。
    expect(css).toContain('container-type:inline-size')
    // 第一档收右列四个按钮（含 R4 的分栏），第二档（更窄）才收工作区名 —— 两档都不许缺，缺了就留缝。
    // 第一档 760（第三段 b 由 672 上调）：四段文字一起会在面板 701–720 把中列挤到 0
    // （中列视图名被裁 + 右列部分裁切），收文字后该窗口整段消失。
    // 第二档的阈值是 550（第三段 b 由 470 上调）：470 时工作区名在面板 499px 就恢复可见，
    // 而右列要到 535px 才完全不被裁，499–534 那一段于是留下「保存按钮右边缘缺 17px」。
    expect(css).toContain('@container (max-width:760px){.fs-btnlabel:not(.fs-wslabel){display:none}}')
    // 分栏让位档（620，插在上面两档之间）：再窄一档时「分栏」整块让位 —— 连 `.fs-tipwrap`
    // 锚点层一起藏（只藏内层 `button` 会留下 0 宽却照旧占一处 gap 的锚点层）。
    // 锚点是按钮自己的 `fs-splitbtn` 类名，不是 `:last-child` 这类位置选择器：右列增删项时
    // 位置选择器会静静选错元素。这条规则是「右列整块裁下界 389 → 339」的唯一来源。
    expect(css).toContain('@container (max-width:620px){.fs-hbar-right > .fs-tipwrap:has(.fs-splitbtn){display:none}}')
    expect(css).toContain('@container (max-width:550px){.fs-wslabel{display:none}}')
    // 「解读选择」的包装不给 `min-width:0`：给了它，里面的按钮会溢出压住「● 未保存」。
    expect(css).toContain('.fs-genwrap{display:inline-flex;align-items:center}')
  })
})

describe('toolbar tooltips: primitives Tooltip instead of native title (D)', () => {
  beforeEach(() => { tooltipProps.length = 0 })
  afterEach(() => { vi.restoreAllMocks() })

  it('puts every toolbar bubble above its button and holds the hover delay', async () => {
    mount({ workspaces: workspacesStub() })
    await flush()
    await click(row('full.md'))
    // 顶栏下面紧接着就是用户正在读的正文/内容区 —— 气泡一律往上弹（`TIP_SIDE`）。
    // primitives 的默认是 `'right'`，而它的视口自适应会在右侧放不下时**垂直翻面到下方**，
    // 也就是正好翻到正文那一侧（用户截图反馈的「解释挡住按钮」就是这么来的）。
    expect(tooltipProps.length).toBeGreaterThan(0)
    for (const props of tooltipProps) {
      expect(props.side).toBe('top')
      // 悬停延迟（`TIP_DELAY_MS`）：primitives 的 `delayMs` 默认是 0，即指针一扫到就弹。
      // 这里的 1000 与 `src/client/index.tsx` 的常量是同一个数：改那个常量必须**故意**改这一行
      // —— 气泡节奏是用户直接感知的行为，改动应当被复审，而不是悄悄漂移。
      expect(props.delayMs).toBe(1000)
    }
  })

  /**
   * The tooltip attached to a toolbar button, read off the stand-in's wrapper.
   * @param el - the button.
   * @returns the bubble label the plugin wired up, or null when there is none.
   */
  function tooltipLabel(el: HTMLElement): string | null {
    return el.closest('.fs-tipwrap')?.parentElement?.getAttribute('data-label') ?? null
  }

  it('anchors a controlled bubble on every toolbar button and drops the native title', async () => {
    mount({ workspaces: workspacesStub() })
    await flush()
    await click(row('full.md'))
    const wsName = (document.querySelector('.fs-wsbtn')?.textContent || '').trim()
    // 每个按钮都换成 primitives 的受控气泡（原生 `title` 会与它同时出现 ⇒ 双气泡）。
    expect(tooltipLabel(refreshButton())).toBe(L('a11yRefresh'))
    expect(tooltipLabel(foldButton())).toBe(L('a11yCollapseTree'))
    expect(tooltipLabel(namedToolbarButton(wsName))).toBe(wsName)
    expect(tooltipLabel(splitButton())).toBe(L('a11ySplit'))
    expect(tooltipLabel(namedToolbarButton(L('btnEdit')))).toBe(L('btnEdit'))
    // 折叠态翻转文案：同一个按钮，气泡说清点下去会发生什么。
    await click(foldButton())
    expect(tooltipLabel(foldButton())).toBe(L('a11yExpandTree'))
  })

  it('keeps every toolbar button free of title while still naming it', async () => {
    mount({ workspaces: workspacesStub() })
    await flush()
    await click(row('full.md'))
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('.fs-hbar button'))
    // 顶栏按钮的覆盖面：工作区 / 刷新 / 折叠 / 视图选择器 / 解读选择 / 分栏 / 编辑。
    expect(buttons).toHaveLength(7)
    for (const el of buttons) {
      // ① 原生气泡的载体必须一个不剩 —— 它不受页面控制、会压住正文。
      expect(el.getAttribute('title')).toBeNull()
      // ② 可访问名不能因为撤掉 title 而丢：要么来自 aria-label，要么来自可见文字。
      const named = (el.getAttribute('aria-label') || '').trim().length > 0
        || (el.textContent || '').trim().length > 0
      expect(named).toBe(true)
    }
    // 常驻纯图标的那两个（刷新 / 折叠）原先只有 `title`，本轮补上 aria-label。
    expect(refreshButton().getAttribute('aria-label')).toBe(L('a11yRefresh'))
    expect(foldButton().getAttribute('aria-label')).toBe(L('a11yCollapseTree'))
    // 悬停即展开下拉的两个锚点**不挂**气泡（挂上会双弹）：解读选择与视图选择器。
    expect(tooltipLabel(namedToolbarButton(L('btnGen')))).toBeNull()
    expect(tooltipLabel(viewBtn())).toBeNull()
    // 它们的可读提示来自别处：解读选择是 aria-label，视图选择器是那串恒等于当前视图名的文字。
    expect(namedToolbarButton(L('btnGen')).getAttribute('aria-label')).toBe(L('btnGen'))
    expect(viewBtn().textContent).toBe(L('labSrc'))
  })

  it('publishes the bubble through a native anchor layer, not through Button', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    // primitives 的 `Button` 是普通函数组件（React 18 挂不上 ref ⇒ Tooltip 拿不到锚点、
    // 气泡永不渲染），所以锚点必须是原生元素 —— 这里把这条前提钉住，别被「顺手去掉那层 span」改回去。
    const wrap = namedToolbarButton(L('btnEdit')).closest('.fs-tipwrap')
    expect(wrap?.tagName).toBe('SPAN')
    apply(makeCtx())
    const css = document.head.querySelector('style[data-plugin="fs"]')?.textContent ?? ''
    expect(css).toContain('.fs-tipwrap{display:inline-flex;align-items:center}')
    // 与 `Menu` 自己那层 `.mr` root 同一个做法：收缩包裹，不给 `min-width:0`
    //（给了就会抹掉内层按钮的 min-content 下限，回到「按钮溢出压兄弟」的老问题）。
    expect(css).not.toContain('.fs-tipwrap{display:inline-flex;align-items:center;min-width:0}')
  })
})

describe('unsaved-changes guard on page leave (C)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  /**
   * Fire a cancelable `beforeunload` and report whether a handler blocked it.
   * @returns whether `defaultPrevented` came back true.
   */
  function leavePage(): boolean {
    const event = new window.Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('registers the guard only while the edit buffer is dirty', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const guardAdds = (): number => add.mock.calls.filter(call => call[0] === 'beforeunload').length
    const guardRemoves = (): number => remove.mock.calls.filter(call => call[0] === 'beforeunload').length
    mount()
    await flush()
    await click(row('app.ts'))
    // 干净态：不拦（拦了会让每次刷新都弹确认框）。
    expect(guardAdds()).toBe(0)
    expect(leavePage()).toBe(false)
    // 进编辑态但还没打字 ⇒ 仍然不脏，仍不拦。
    await click(button(L('btnEdit')))
    expect(guardAdds()).toBe(0)
    expect(leavePage()).toBe(false)
    // 打字 ⇒ dirty ⇒ 挂上守卫，页面级离开被拦下。
    const area = document.querySelector('.fs-area') as HTMLTextAreaElement
    await act(async () => { typeInto(area, 'const a = 2') })
    await flush()
    expect(guardAdds()).toBe(1)
    expect(leavePage()).toBe(true)
    // 保存 ⇒ dirty 归 false ⇒ 守卫卸载（不是留着一条永远拦的监听）。
    await click(button(L('btnSave')))
    expect(guardRemoves()).toBe(1)
    expect(leavePage()).toBe(false)
  })

  it('does not guard an untouched buffer after switching to another file', async () => {
    mount()
    await flush()
    await click(row('app.ts'))
    await click(button(L('btnEdit')))
    const area = document.querySelector('.fs-area') as HTMLTextAreaElement
    await act(async () => { typeInto(area, 'x') })
    await flush()
    expect(leavePage()).toBe(true)
    // 页内切换文件（G-4：静默丢弃未保存编辑）**不触发** `beforeunload`，所以守卫拦不住它 ——
    // 这是本段的已知覆盖边界，写在源码注释里；要盖住它得加应用内确认，本段不做。
    await click(row('full.md'))
    expect(leavePage()).toBe(false)
  })
})

describe('split view (R4)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  /** 顶栏的分栏按钮（可见文字「分栏」，窄档收进 `.fs-btnlabel`）。 */
  function splitBtn(): HTMLElement {
    return byText('.fs-hbar-right button', L('btnSplit'))
  }

  /** 右侧那份只读副本的窗格；未分栏时为 null。 */
  function splitPane(): HTMLElement | null {
    return document.querySelector('.fs-splitpane') as HTMLElement | null
  }

  /** 左侧窗格（`.fs-body` 的直接子元素；右侧那份在 `.fs-splitpane` 里面，不会撞上）。 */
  function leftPane(): HTMLElement {
    const node = document.querySelector('.fs-body > .fs-main')
    if (node === null) throw new Error('no left pane')
    return node as HTMLElement
  }

  /** 右侧窗格里的 `.fs-main`（未分栏时为 null）。 */
  function rightPane(): HTMLElement | null {
    return document.querySelector('.fs-splitpane .fs-main') as HTMLElement | null
  }

  it('keeps the entry disabled until something is open', async () => {
    mount()
    await flush()
    expect((splitBtn() as HTMLButtonElement).disabled).toBe(true)
    await click(row('full.md'))
    expect((splitBtn() as HTMLButtonElement).disabled).toBe(false)
  })

  it('copies the open view to the right, and the second click closes it', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    expect(viewIs('labSrc')).toBe(true)
    expect(splitPane()).toBeNull()
    await click(splitBtn())
    // 右侧是完整的一份窗格，但里面没有任何控件：无编辑、无保存、无生成入口。
    expect(rightPane()).not.toBeNull()
    expect(rightPane()?.querySelectorAll('button')).toHaveLength(0)
    expect(splitPane()?.querySelectorAll('.fs-area')).toHaveLength(0)
    // 再点同一个按钮即关闭。
    await click(splitBtn())
    expect(splitPane()).toBeNull()
    expect(document.querySelectorAll('.fs-main')).toHaveLength(1)
  })

  it('freezes the right pane view while the left keeps switching, and stays read-only', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    await click(splitBtn())
    // 左侧进编辑态：右侧那份副本仍走查看分支（textarea 只有左侧一个）。
    await click(button(L('btnEdit')))
    expect(document.querySelectorAll('.fs-area')).toHaveLength(1)
    expect(leftPane().querySelector('.fs-area')).not.toBeNull()
    expect(rightPane()?.querySelector('.fs-area')).toBeNull()
    // 左侧切到「源码注解」：右侧仍是开启那一刻冻结的「源码」正文 —— 视图类型冻结、数据实时。
    await pickView('labAnnot')
    expect(viewIs('labAnnot')).toBe(true)
    expect((rightPane()?.querySelector('.stub-md')?.textContent) || '').toContain('# Full')
    expect((leftPane().querySelector('.stub-md')?.textContent) || '').toContain('# Title')
  })

  it('remembers the split per file and restores the full width elsewhere', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    await click(splitBtn())
    expect(splitPane()).not.toBeNull()
    // 切到没开过分栏的文件 ⇒ 恢复全屏。
    await click(row('app.ts'))
    expect(splitPane()).toBeNull()
    // 切回来 ⇒ 又分栏，且冻结的还是当时那一份视图。
    await click(row('full.md'))
    expect(splitPane()).not.toBeNull()
    expect((rightPane()?.querySelector('.stub-md')?.textContent) || '').toContain('# Full')
  })

  it('drags the divider, clamps the ratio and remembers it per file', async () => {
    // jsdom 没有布局：给两侧窗格注入宽度，让「占比 = 右 / 两侧之和」这一步可测。
    const PANE_W = 500
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement): DOMRect {
      const width = this.classList.contains('fs-splitpane') || this.classList.contains('fs-main') ? PANE_W : 0
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }
    })
    mount()
    await flush()
    await click(row('full.md'))
    await click(splitBtn())
    const grow = (): number => Number((splitPane() as HTMLElement).style.flexGrow)
    // 初始占比 0.5 ⇒ grow = p/(1−p) = 1。
    expect(grow()).toBeCloseTo(1, 10)
    const bars = Array.from(document.querySelectorAll('.fs-split'))
    const bar = bars[1]
    if (bar === undefined) throw new Error('no divider for the right pane')
    await act(async () => {
      bar.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 500 }))
    })
    expect(bar.className).toContain('active')
    // 往右拖 400px：右侧只剩 100/1000 ⇒ 占比 0.1 被夹到下限 0.2。
    await act(async () => {
      document.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 900 }))
    })
    expect(grow()).toBeCloseTo(0.25, 10)
    // 反方向拖到底：占比 0.9 被夹到上限 0.8。
    await act(async () => {
      document.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 100 }))
    })
    expect(grow()).toBeCloseTo(4, 10)
    await act(async () => {
      document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
    })
    expect(Array.from(document.querySelectorAll('.fs-split'))[1]?.className).not.toContain('active')
    // 比例按文件记忆：切走再切回来，分栏比例仍是 0.8。
    await click(row('app.ts'))
    await click(row('full.md'))
    expect(grow()).toBeCloseTo(4, 10)
  })

  it('draws the copied DSH split glyph and keeps its accessible name', async () => {
    mount()
    await flush()
    await click(row('full.md'))
    const svg = splitBtn().querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    // 一条 even-odd 路径 = 宿主的面板外框环 + 移到中心的竖线（逐字复制，规格 §2 的唯一例外）。
    const path = svg?.querySelector('path')
    expect(path?.getAttribute('fill-rule')).toBe('evenodd')
    expect(path?.getAttribute('clip-rule')).toBe('evenodd')
    expect(path?.getAttribute('d') || '').toContain('M7.31989 1.88307H8.68012V14.1169H7.31989V1.88307Z')
    // 参与同一套窄档收纳：文字在 `.fs-btnlabel` 层里，可访问名恒定。
    expect(splitBtn().querySelector('.fs-btnlabel')?.textContent).toBe(L('btnSplit'))
    expect(splitBtn().getAttribute('aria-label')).toBe(L('btnSplit'))
    // 更窄的那一档（620）把它整个收起，靠的正是按钮上的 `fs-splitbtn` 类名 ——
    // 样式表用 `:has()` 从它找到外层的 `.fs-tipwrap` 一起藏。撤掉这个类名，收纳会**静默失效**
    // （探针会立刻退回「下界 389」的破门禁读数，而这里不红就没人会知道）。
    expect(splitBtn().classList.contains('fs-splitbtn')).toBe(true)
    // 气泡文案说清「再点一次关闭」这个非通用交互；原生 `title` 已换成受控气泡（不双气泡）。
    expect(splitBtn().getAttribute('title')).toBeNull()
    expect(splitBtn().closest('.fs-tipwrap')?.parentElement?.getAttribute('data-label')).toBe(L('a11ySplit'))
  })

  it('leaves the seam bare until hovered: the idle divider rule is gone, the hover one stays', () => {
    apply(makeCtx())
    const css = document.head.querySelector('style[data-plugin="fs"]')?.textContent ?? ''
    // 常态那条 0.5px 发丝线（旧 `::before`）**整条规则都不该在**：用户当场要求「竖线消失」，
    // 两个窗格视觉上完全紧贴。这条断言就是它的回归钉子 —— 线一旦被加回来，这里先红。
    expect(css).not.toContain('.fs-split::before')
    // 提示线与它赖以成立的 8px 命中区（`left/right:-4px`）必须原样保留：线只在悬停/拖拽中浮出，
    // 而指针能进到这条 8px 带里（`opacity:0` 的伪元素仍参与命中测试）正是拖拽可点性的前提。
    expect(css).toContain('.fs-split::after{top:0;bottom:0;left:-4px;right:-4px;opacity:0')
    expect(css).toContain('.fs-split:hover::after,.fs-split.active::after{opacity:1}')
    // 分隔条本身仍是「不占位 + 拖拽光标」的那块 0 宽命中缝。
    expect(css).toContain('.fs-split{position:relative;z-index:1;flex:none;width:0;cursor:col-resize;touch-action:none}')
  })
})
