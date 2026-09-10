// Post-build normalization of client/client.js.
//
// Rolldown pretty-prints the tsdown banner into a three-line header, but the
// loader handoff is a byte contract: the web shell's module loader (and the
// host's own plugin sniffing) reads the artifact from its first bytes, and the
// previous JS plugin shipped the single-line form. Collapse the header back to
// one line, leaving the vacated lines empty so any line-numbered map stays
// valid. scripts/verify-client-banner.mjs then asserts the result.
import { readFileSync, writeFileSync } from 'node:fs'

const ARTIFACT = 'client/client.js'
/** Loader id stamped into the handoff; the bundle's own package name. */
const id = JSON.parse(readFileSync('package.json', 'utf8')).name
const REQUIRED = `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`

const code = readFileSync(ARTIFACT, 'utf8')
if (code.startsWith(REQUIRED)) {
  console.log(`normalize-client-banner: ${ARTIFACT} already carries the one-line handoff`)
} else {
  const lines = code.split('\n')
  const folded = [
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(id)},`,
    '\tfactory: (require) => {',
  ]
  if (lines[0] !== folded[0] || lines[1] !== folded[1] || lines[2] !== folded[2]) {
    console.error(`normalize-client-banner: unexpected ${ARTIFACT} header:\n${lines.slice(0, 3).join('\n')}`)
    process.exit(1)
  }
  lines[0] = REQUIRED
  lines[1] = ''
  lines[2] = ''
  writeFileSync(ARTIFACT, lines.join('\n'))
  console.log(`normalize-client-banner: collapsed the ${ARTIFACT} header onto one line`)
}
