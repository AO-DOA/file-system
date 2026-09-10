import { defineConfig } from 'vitest/config'

// Coverage posture (PROGRESS.md D-2): per-file 100%, branches included, on the
// runtime sources under src/.
//
// Both plugin entries now carry real logic — the host entry owns the
// `/api/fs/*` route table and the generation task state machine, the client
// entry owns the tab UI and its components — so both sit inside the per-file
// gate and are measured by their own specs. P1 excluded them only while they
// were wiring stubs that registered a single route/slot and contributed no
// logic of their own; that premise is gone, and keeping the exclusion would
// hide whole source files behind a green run (PROGRESS.md T-33).
//
// `.tsx` is part of the include set because the client face is JSX sources
// (decision D-11): a `.ts`-only pattern silently leaves every component out of
// the denominator, which reads as a passing run rather than as a gap.
export default defineConfig({
  test: {
    // jsdom is the environment the client face runs in; the P4 component tests
    // land in it. Host-face specs are plain Node code and are unaffected.
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
    // A tree with no spec yet must still exit 0 (`passWithNoTests`).
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      // Declarations carry no runtime to execute; nothing else is excluded.
      exclude: ['src/**/*.d.ts'],
      // `text` 给人看，`json-summary` 给 scripts/verify-coverage-scope.mjs 看：
      // 该脚本用报告里出现的文件集反查「应当进分母但被静默排除」的源文件。
      reporter: ['text', 'json-summary'],
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
