/**
 * Client entry for dsh-plugin-file-system-zc.
 *
 * P1-A scaffold: the browser half mounts and renders nothing. P1-B registers
 * the placeholder conversation.view slot (id `fs`, order 12); P4 migrates the
 * tree / viewer / editor components here.
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-plugin-file-system-zc/client'

/** Client services this plugin requires; empty until P4 wires the slots. */
export const inject: string[] = []

/**
 * Mount the plugin on the client context.
 * @param _ctx - client context provided by the runtime.
 */
export function apply(_ctx: Context): void {}
