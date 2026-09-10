// Build-time self-check for the client artifact's loader handoff.
//
// The web shell loads client/client.js through window.__ModuleLoader__.load
// and hands the bundle a `require` backed by the frozen module table, so the
// first bytes of the artifact are a contract, not a formatting detail: a
// bundle that drops the wrapper loads nothing and fails silently in the
// browser. `npm run build` runs this after scripts/normalize-client-banner.mjs.
import { readFileSync } from 'node:fs'

const ARTIFACT = 'client/client.js'
/** Package name, which is also the loader id the shell resolves the artifact by. */
const EXPECTED_NAME = 'dsh-plugin-file-system-zc'

const name = JSON.parse(readFileSync('package.json', 'utf8')).name
if (name !== EXPECTED_NAME) {
  console.error(`package name mismatch: expected ${EXPECTED_NAME}, found ${name}`)
  process.exit(1)
}

const EXPECTED = `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: (require) => {`
const head = readFileSync(ARTIFACT, 'utf8').slice(0, EXPECTED.length)
if (head !== EXPECTED) {
  console.error(`client banner mismatch in ${ARTIFACT}`)
  console.error(`  expected: ${EXPECTED}`)
  console.error(`  actual:   ${head}`)
  process.exit(1)
}

console.log(`client banner ok: ${ARTIFACT} starts with the loader handoff for ${name}`)
