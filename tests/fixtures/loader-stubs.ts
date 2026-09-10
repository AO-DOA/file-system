/**
 * Test-only service stand-ins for the REAL-composition spec.
 *
 * Each export is an ordinary Cordis plugin object, so the real Loader mounts
 * them exactly like any other row. They publish the host/client services the
 * plugin under test injects, and they expose what they observed (routes,
 * slots) so the spec can assert externally visible state instead of reaching
 * into the plugin's internals.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

/** One route as registered through the stand-in web server. */
export interface StubRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

let routes: StubRoute[] = []
let port: number | undefined

/** Loopback port of the stand-in HTTP server, once it is listening. */
export function webServerPort(): number | undefined {
  return port
}

/** Routes currently registered on the stand-in web server. */
export function registeredRoutes(): readonly StubRoute[] {
  return routes
}

/** Stand-in for `ctx.webServer`: a real HTTP server plus the route registry. */
export const webServerStub = {
  name: 'fs-test-web-server',
  apply(ctx: Context): void {
    const table = new Map<string, StubRoute>()
    routes = []
    port = undefined
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      let matched: StubRoute | undefined
      for (const route of table.values()) {
        const hit = route.kind === 'prefix'
          ? url.pathname === route.path || url.pathname.startsWith(route.path + '/')
          : url.pathname === route.path
        if (!hit) continue
        if (matched === undefined || route.path.length > matched.path.length) matched = route
      }
      if (matched === undefined) {
        res.statusCode = 404
        res.end('no stub route')
        return
      }
      void matched.handler(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address !== null && typeof address !== 'string') port = address.port
    })
    ctx.provide('webServer', {
      register(route: StubRoute): () => void {
        const key = route.kind + ' ' + route.path
        table.set(key, route)
        routes = [...table.values()]
        return () => {
          table.delete(key)
          routes = [...table.values()]
        }
      },
    })
    ctx.effect(() => () => { server.close() }, 'fs test web server')
  },
}

/** Stand-in for `ctx.sandboxPolicy`: only `workspaceRoot` is read this stage. */
export const sandboxPolicyStub = {
  name: 'fs-test-sandbox-policy',
  apply(ctx: Context): void {
    ctx.provide('sandboxPolicy', { workspaceRoot: process.cwd() })
  },
}

/** Stand-in for `ctx.sessions`. */
export const sessionsStub = {
  name: 'fs-test-sessions',
  apply(ctx: Context): void {
    ctx.provide('sessions', { list: (): readonly string[] => [] })
  },
}

/** Stand-in for `ctx.agentLoop`. */
export const agentLoopStub = {
  name: 'fs-test-agent-loop',
  apply(ctx: Context): void {
    ctx.provide('agentLoop', { running: false })
  },
}

/** One slot registration as observed through the stand-in slot registry. */
export interface StubSlot {
  definition: {
    name: string
    id: string
    order: number
    label: () => string
  }
  view: () => string
}

let slots: StubSlot[] = []

/** Slots currently registered on the stand-in slot registry. */
export function registeredSlots(): readonly StubSlot[] {
  return slots
}

/** Stand-in for the client `slots` service. */
export const slotsStub = {
  name: 'fs-test-slots',
  apply(ctx: Context): void {
    slots = []
    const registry = {
      inject(_name: string, callback: () => void): void {
        callback()
      },
      register(definition: StubSlot['definition'], view: () => string): () => void {
        const entry: StubSlot = { definition, view }
        slots = [...slots, entry]
        return () => { slots = slots.filter(candidate => candidate !== entry) }
      },
    }
    ctx.provide('slots', registry)
  },
}
