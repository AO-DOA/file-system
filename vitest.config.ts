import { defineConfig } from 'vitest/config'

// Coverage posture (PROGRESS.md D-2): per-file 100%, branches included, on the
// runtime sources under src/.
//
// The two plugin entries are wiring stubs: they register a route / a slot and
// contain no logic of their own, so the P1-B REAL-composition test observes
// them from the outside instead of a per-file unit gate measuring them (the
// same split the harness uses for its own client entry files).
//
// An empty include set is not a false red: with no coverable file under src/
// vitest evaluates no per-file threshold and exits 0 (measured), so the gate is
// in place from P1 without failing on a source-free tree, and the first real
// source file added in P2 is gated immediately (measured: one uncovered file
// exits 1).
const SCAFFOLD_ENTRY_EXCLUDES = ['src/host/index.ts', 'src/client/index.ts']

export default defineConfig({
  test: {
    // jsdom is the environment the client face runs in; the P4 component tests
    // land in it. Host-face specs are plain Node code and are unaffected.
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
    // P1 ships no spec yet; the command must still exit 0 (P1-A acceptance 3).
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [...SCAFFOLD_ENTRY_EXCLUDES, 'src/**/*.d.ts'],
      reporter: ['text'],
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
