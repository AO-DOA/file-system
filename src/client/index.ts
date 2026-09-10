/**
 * Client entry for dsh-plugin-file-system-zc.
 *
 * P1-B wires the identity contract (feature-baseline §2.1: `name`/`inject`) and
 * registers the placeholder `conversation.view` slot (id `fs`, order 12) so a
 * real Loader composition can observe the registration from the outside. P4
 * replaces the placeholder view with the tree / viewer / editor components.
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'fs'

/** Client services this plugin requires (feature-baseline §2.1, verbatim). */
export const inject = ['slots']

/** Slot key, entry id and order are product-position contracts (§2.1). */
const SLOT_NAME = 'conversation.view'
const SLOT_ID = 'fs'
const SLOT_ORDER = 12

/**
 * Minimal slice of the client slot-registry contract this stage needs.
 *
 * Declared locally instead of augmenting `Context`: the real shape comes from
 * `@deepseek-ai/dsh-client-ui-slots`, which the web shell supplies at runtime.
 */
interface SlotsSurface {
  inject(name: string, callback: () => void): void
  register(definition: {
    name: string
    id: string
    order: number
    label: () => string
  }, view: () => string): () => void
}

/**
 * Mount the plugin on the client context.
 * @param ctx - client context provided by the runtime.
 */
export function apply(ctx: Context): void {
  const slots = ctx.get('slots') as SlotsSurface | undefined
  if (slots === undefined) {
    throw new Error('slots service missing — client cannot register conversation.view')
  }
  slots.inject(SLOT_NAME, () => {
    slots.register({
      name: SLOT_NAME,
      id: SLOT_ID,
      order: SLOT_ORDER,
      // Lazy label; P4 swaps the literal for t('slotLabel') once locale lands.
      label: () => '文件系统',
    }, placeholderView)
  })
}

/**
 * Smallest non-empty view the slot can render; the real panel arrives in P4.
 * @returns a text node React renders as-is.
 */
function placeholderView(): string {
  return '文件系统（占位）'
}
