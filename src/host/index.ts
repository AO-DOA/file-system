/**
 * Host entry for dsh-plugin-file-system-zc.
 *
 * P1-B wires the identity contract (feature-baseline §2.1: `name`/`inject`) and
 * mounts one placeholder route so a real Loader composition can observe the
 * plugin from the outside. P3 replaces the placeholder handler with the real
 * `/api/fs/*` route table and the generation task state machine.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'fs'

/** Host services this plugin requires (feature-baseline §2.1, verbatim). */
export const inject = ['webServer', 'sandboxPolicy', 'sessions', 'agentLoop']

/** Route prefix owned by this plugin (feature-baseline §2.1). */
const PREFIX = '/api/fs'

/**
 * Minimal slice of the host web-server contract this stage needs.
 *
 * Declared locally instead of augmenting `Context`: P3 imports the real
 * `@deepseek-ai/dsh-webserver` types, and two declarations of the same
 * `Context` key with different shapes are a merge error.
 */
interface WebServerSurface {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/**
 * Mount the plugin on the host context.
 * @param ctx - host context provided by the Loader.
 */
export function apply(ctx: Context): void {
  const webServer = ctx.get('webServer') as WebServerSurface | undefined
  if (webServer === undefined) {
    throw new Error('webServer service missing — host cannot register /api/fs')
  }
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => { handle(req, res) },
  }), 'fs api routes')
}

/**
 * Placeholder route table: only `/api/fs/__ping` answers; everything else is a
 * 404 in the shape the real routes use (`{ ok: false, error }`).
 * @param req - incoming HTTP request.
 * @param res - response owning the reply lifecycle.
 */
function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  res.setHeader('content-type', 'application/json')
  if (url.pathname === PREFIX + '/__ping') {
    res.statusCode = 200
    res.end(JSON.stringify({ ok: true, plugin: 'dsh-plugin-file-system-zc', route: '__ping' }))
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ ok: false, error: 'unknown route: ' + url.pathname.slice(PREFIX.length + 1) }))
}
