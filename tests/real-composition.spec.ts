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
import { afterEach, describe, expect, it, vi } from 'vitest'
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

// The client half imports `@deepseek-ai/dsh-client-ui-primitives`, whose built
// bundle only resolves inside the harness tree (CSS-module imports, shiki,
// katex). Loading it here would fail on module resolution rather than on
// anything this plugin owns. The spec still boots the REAL Loader around the
// REAL client entry — only that third-party UI surface is stood in for.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => import('./fixtures/primitives-stub'))

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
      if (specifier === PACKAGE_NAME + '/client') return await import('../src/client/index.tsx')
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
  it('host half answers a real /api/fs route over HTTP', async () => {
    context = await boot('host.cordis.yml')

    // The Loader's own tree is the registry of mounted rows: the row carries
    // the specifier `cordis.patch.yml` inserts, and it really activated.
    expect(pluginRow(context)?.name).toBe(PACKAGE_NAME)
    expect(pluginRow(context)?.id.endsWith(':' + PLUGIN_ROW_ID) ?? false).toBe(true)
    expect(registeredRoutes().map(route => route.kind + ' ' + route.path)).toEqual(['prefix /api/fs'])

    const port = await waitForPort()
    // `GET /api/fs/root` is the real route with the least behind it: it echoes
    // the root captured at apply time (the stand-in sandbox policy's
    // `workspaceRoot`) and touches neither the filesystem nor the task map.
    // The other GETs all carry environment — `/tree` lazily creates the book
    // bucket, `/read` needs a real file on disk, `/gen-status` needs task
    // state, `/session` needs a session lookup. It also pins the §A quirk that
    // this response has **no** `ok` field while every other JSON reply is
    // `{ ok: ... }`, so the assertion is a contract check, not a smoke test.
    const root = await httpGet(port, '/api/fs/root')
    expect(root.status).toBe(200)
    expect(JSON.parse(root.body)).toEqual({ root: process.cwd() })

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
    // T-47: the tab label is the product copy from the locale dictionary
    // (`locale.ts` slotLabel = '文件'), not the placeholder literal the P1-B
    // stub carried. The visible tab text is therefore 「文件」.
    expect(slot.definition.label()).toBe('文件')
    // P4 replaced the placeholder text node with the real FsView element. The
    // stand-in registry types `view` as string-returning, so the runtime value
    // is read through an unknown hop and pinned by its element type instead.
    const view = slot.view() as unknown as { type?: unknown }
    expect(typeof view.type).toBe('function')
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

// ---- 静态装配声明核对（迁移自源 tests/real-composition.test.js 的 5 条缺口）----
//
// 源 `:43`（`exports['.']` 包自引用 + `t.skip`）**不迁**：主仓 `docs/testing.zh.md:45` 明确
// 「工作区包的裸导入解析到 `src`，**绝不会**经由包的 `exports` 解析到构建后的 `lib/`，
// 因为其中的陈旧产物会加载第二份模块单例」。本仓同理，且 `lib/` 按 D-7 不入库，
// 该用例在 zc 没有可靠的断言面。

describe('装配契约：package.json / 入口导出面 / 装载三件套', () => {
  it('package.json 声明 loader 契约：main 与 exports 指向构建产物（源 real-composition.test.js:24）', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      main?: string
      types?: string
      exports?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    // 与源不同：zc 的 host leaf 把 rootDir 上提到 src（为了 host 面能 import
    // src/shared/locale.ts 这张唯一文案真源），产物因此是 lib/host/index.js 而不是 dsh/index.js。
    expect(pkg.main).toBe('lib/host/index.js')
    expect(pkg.types).toBe('lib/types/host/index.d.ts')
    expect(pkg.exports?.['.']).toBe('./lib/host/index.js')
    expect(pkg.exports?.['./client']).toBe('./client/client.js')
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  })

  it('host 入口真实导出面：无 default、name=fs、inject 齐备、apply 是函数（源 :33）', async () => {
    const mod = await import('../src/host/index.ts')
    expect(mod).toBeTruthy()
    // 仅具名导出：default 必须是「不存在」，不是「值为 undefined 的导出」
    expect(Object.prototype.hasOwnProperty.call(mod, 'default')).toBe(false)
    expect(mod.name).toBe('fs')
    expect(mod.inject).toEqual(['webServer', 'sandboxPolicy', 'sessions', 'agentLoop'])
    expect(typeof mod.apply).toBe('function')
  })

  it('NODE_ENV !== test 时生产 ctx 不挂 __fsTest，路由注册照常（源 :116）', async () => {
    const previous = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'production'
      const routes: string[] = []
      const ctx = {
        webServer: {
          register(route: { kind: 'exact' | 'prefix'; path: string; handler: unknown }): () => void {
            routes.push(route.kind + ' ' + route.path)
            return () => undefined
          },
        },
        sandboxPolicy: { workspaceRoot: process.cwd() },
        sessions: {},
        get: (): unknown => undefined,
        effect: (callback: () => unknown): unknown => callback(),
      }
      const { apply } = await import('../src/host/index.ts')
      apply(ctx)
      // 生产不挂测试句柄（避免生产 ctx 上有可变的内部状态），但路由照常注册
      expect(Object.prototype.hasOwnProperty.call(ctx, '__fsTest')).toBe(false)
      expect(routes).toEqual(['prefix /api/fs'])
    } finally {
      process.env.NODE_ENV = previous
    }
  })

  it('agent.cordis.yml 技能桥接行存在（源 :142）', () => {
    const text = readFileSync(join(process.cwd(), 'agent.cordis.yml'), 'utf8')
    expect(text).toMatch(/id: skill-filesystem/)
    expect(text).toMatch(/id: tool-skill/)
    expect(text).toMatch(/customSkillDirs/)
    expect(text).toMatch(/skills\//)
  })

  it('preset.yml 元信息与插件身份对应（源 :150）', () => {
    const text = readFileSync(join(process.cwd(), 'preset.yml'), 'utf8')
    expect(text).toMatch(/name: 文件系统/)
    expect(text).toMatch(/description:/)
    expect(text).toMatch(/order: \d+/)
  })
})
