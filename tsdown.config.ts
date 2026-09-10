/**
 * Browser client bundle for dsh-plugin-file-system-zc.
 *
 * Mirrors the harness client preset (packages/client/tsdown.client.ts) for a
 * tree-outside package: a closure-factory artifact that calls
 * `window.__ModuleLoader__.load({ id, factory })` and resolves its externals
 * through the injected `require` (the loader module table). The wrapping
 * strings are byte-for-byte the ones the previous JS plugin emitted, and
 * scripts/verify-client-banner.mjs re-asserts the head of the built artifact.
 *
 * The host half is emitted by `tsc -b tsconfig.host.json` into lib/; this
 * config only owns client/client.js.
 */
import { defineConfig } from 'tsdown'

const id = 'dsh-plugin-file-system-zc'

/**
 * Externals answered by the web shell's frozen module table. Everything else
 * inlines: a require() the table cannot answer is a guaranteed runtime throw.
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-runtime/client',
]

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  // package.json exports["./client"] points at client/client.js, so the
  // bundle lands there directly.
  outDir: 'client',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  // Host types ship from lib/types (tsc); dts here would wrap the
  // banner/footer into a .d.cts and break parsing.
  dts: false,
  // Artifacts are not committed (PROGRESS.md D-7) and are rebuilt by
  // `npm run build`, so no sourcemap ships beside the bundle.
  sourcemap: false,
  clean: false,
  deps: {
    // Requested specifiers stay imports answered by the loader module table;
    // everything else inlines.
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (source: string) => !CLIENT_EXTERNALS.includes(source),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
