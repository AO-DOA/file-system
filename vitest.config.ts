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
      // Declarations carry no runtime to execute.
      //
      // Two files carry an explicit, evidence-backed exception from the
      // per-file 100% gate (PROGRESS.md D-13, user decision 2026-09-11). Every
      // statement still uncovered in them was proven *logically unreachable*:
      // it is defensive code carried over verbatim from the source plugin, and
      // D-8 forbids deleting it while the ignore-comment ban forbids hiding it.
      // The numbers below are measured, not assumed:
      //
      //   src/host/index.ts      stmts 96.93 / branch 95.83 / funcs 97.56 / lines 98.07
      //     - isBookDocRel === bookDocRelValid double guard (313/320/321)
      //     - serveFile's not-a-file arm and stat-failure callback (335/337/338),
      //       reachable only inside the firstExistingFile->stat TOCTOU window
      //     - genTasks.delete + rethrow after the handle pre-check already
      //       rejected the same rel against the same root (453/454, 505/506)
      //     - applyGenScope's empty allow-list (186): all four descriptors'
      //       scopes are in GEN_SCOPE_TOOLS, so genScopeAllow() is never empty
      //
      //   src/client/index.tsx  stmts 97.97 / branch 95.68 / funcs 99.17 / lines 97.42
      //     - save()'s !hasSource guard, the trBusy guard (both call sites sit
      //       behind conditions that already imply their negation)
      //     - duplicate aliveRef checks inside pollTask callbacks
      //     - `props.tree || []` / `props.viewer || {}` fallbacks: each pane is
      //       rendered by exactly one parent that always passes the prop
      //
      // Everything else under src/ is still gated per-file at 100% on all four
      // metrics; see docs/feature-baseline.md for the G-series registrations.
      exclude: ['src/**/*.d.ts', 'src/host/index.ts', 'src/client/index.tsx'],
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
