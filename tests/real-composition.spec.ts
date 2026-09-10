/**
 * REAL-composition spec (P1-B acceptance).
 *
 * Every other spec in this repo drives the plugin by hand. This one boots a
 * test-only `cordis.yml` through the real `@deepseek-ai/cordis-plugin-loader`
 * (plus its include plugin), so the Loader itself resolves the rows, waits for
 * the injected services, and calls `apply`. The assertions then read only
 * externally observable state: the Loader's own entry tree, the routes the
 * plugin registered on the web-server service (observed over real HTTP), and
 * the slot table the client half filled through the slot registry.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import {
  agentLoopStub, registeredSlots, registeredRoutes, sandboxPolicyStub, sessionsStub, slotsStub,
  webServerPort, webServerStub,
} from './fixtures/loader-stubs'

/** Package name the Loader must resolve for the row `cordis.patch.yml` inserts. */
const PACKAGE_NAME = 'dsh-plugin-file-system-zc'

// Vitest resolves `import.meta.url` to a non-file URL, so the fixture root is
// taken from the project root vitest runs in (the package root).
const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'loader-composition')

/** Module stand-ins the fake resolver answers the test-only rows with. */
const STUBS: Record<string, unknown> = {
  '@dsh-test/fs-web-server': webServerStub,
  '@dsh-test/fs-sandbox-policy': sandboxPolicyStub,
  '@dsh-test/fs-sessions': sessionsStub,
  '@dsh-test/fs-agent-loop': agentLoopStub,
  '@dsh-test/fs-slots': slotsStub,
}

/** Entry id of the plugin row inside the composition. */
const PLUGIN_ROW_ID = 'fs'

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

/**
 * Boot one test-only composition through the real Loader.
 * @param file - composition file name inside the fixture directory.
 * @returns the root context the Loader is mounted on.
 */
async function boot(file: string): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(FIXTURE_DIR).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  // Module resolution is the one seam the spec replaces: the Loader still
  // parses the composition, builds the entry tree and runs every lifecycle.
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string): Promise<unknown> {
      if (specifier === PACKAGE_NAME) return await import('../src/host/index.ts')
      if (specifier === PACKAGE_NAME + '/client') return await import('../src/client/index.ts')
      const stub = STUBS[specifier]
      if (stub !== undefined) return stub
      throw new Error('unexpected Loader import: ' + specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(join(FIXTURE_DIR, file)).href },
  })
  await ctx.loader.await()
  return ctx
}

/**
 * The composition row the Loader mounted, read out of its own entry tree.
 * @param ctx - root context the Loader is mounted on.
 * @returns the row id and the module specifier it resolved, or undefined.
 */
function pluginRow(ctx: Context): { id: string; name: string } | undefined {
  for (const entry of ctx.loader.entries()) {
    if (entry.options.id === PLUGIN_ROW_ID) return { id: entry.id, name: entry.options.name }
  }
  return undefined
}

/**
 * Wait for the stand-in HTTP server to report its loopback port.
 * @returns the port the stand-in web server listens on.
 */
async function waitForPort(): Promise<number> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const port = webServerPort()
    if (port !== undefined) return port
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('stand-in web server never started listening')
}

/**
 * Perform one real loopback HTTP GET.
 * @param port - stand-in server port.
 * @param path - request path.
 * @returns status code and decoded body.
 */
function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

describe('REAL composition: the plugin mounts through a real Loader', () => {
  it('host half answers /api/fs/__ping over HTTP', async () => {
    context = await boot('host.cordis.yml')

    // The Loader's own tree is the registry of mounted rows: the row carries
    // the specifier `cordis.patch.yml` inserts, and it really activated.
    expect(pluginRow(context)?.name).toBe(PACKAGE_NAME)
    expect(pluginRow(context)?.id.endsWith(':' + PLUGIN_ROW_ID) ?? false).toBe(true)
    expect(registeredRoutes().map(route => route.kind + ' ' + route.path)).toEqual(['prefix /api/fs'])

    const port = await waitForPort()
    const ping = await httpGet(port, '/api/fs/__ping')
    expect(ping.status).toBe(200)
    expect(JSON.parse(ping.body)).toEqual({ ok: true, plugin: PACKAGE_NAME, route: '__ping' })

    const missing = await httpGet(port, '/api/fs/nope')
    expect(missing.status).toBe(404)
    expect(JSON.parse(missing.body)).toEqual({ ok: false, error: 'unknown route: nope' })
  })

  it('client half registers the conversation.view slot', async () => {
    context = await boot('client.cordis.yml')

    expect(pluginRow(context)?.name).toBe(PACKAGE_NAME + '/client')
    const slots = registeredSlots()
    expect(slots).toHaveLength(1)
    const slot = slots[0]
    if (slot === undefined) throw new Error('no slot registered')
    expect(slot.definition.name).toBe('conversation.view')
    expect(slot.definition.id).toBe('fs')
    expect(slot.definition.order).toBe(12)
    expect(slot.definition.label()).toBe('文件系统')
    expect(slot.view()).toBe('文件系统（占位）')
  })

  it('cordis.patch.yml inserts exactly the row the Loader resolved', () => {
    // The composition above boots the plugin row directly; this pins the other
    // half of the loading story — the bundle patch a profile reads through
    // `dsh.bundle.patch` must insert that same row under the same package name.
    const patch = readFileSync(join(process.cwd(), 'cordis.patch.yml'), 'utf8')
    expect(patch).toMatch(/^\s*- insert:\s*$/m)
    expect(patch).toMatch(/^\s*- id: fs\s*$/m)
    expect(patch).toMatch(new RegExp('^\\s*name: ' + PACKAGE_NAME + '\\s*$', 'm'))

    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      name?: string
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.name).toBe(PACKAGE_NAME)
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  })
})
