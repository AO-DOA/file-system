/**
 * Host entry for dsh-plugin-file-system-zc.
 *
 * P1-A scaffold: the plugin mounts and registers nothing. P1-B adds the
 * placeholder /api/fs route; P2-P3 migrate the real routes and the generation
 * task state machine here.
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-plugin-file-system-zc'

/** Services this plugin requires; empty until P1-B wires the web server. */
export const inject: string[] = []

/**
 * Mount the plugin on the host context.
 * @param _ctx - host context provided by the Loader.
 */
export function apply(_ctx: Context): void {}
