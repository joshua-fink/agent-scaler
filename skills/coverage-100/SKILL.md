---
name: coverage-100
description: >-
  Deep skill: enforce 100% test coverage (lines, branches, functions, statements)
  on a TypeScript project — identify uncovered code in a diff, verify the
  coverage gate is configured at 100% with no silent thresholds, scrutinize every
  coverage-ignore comment for a written justification, and ensure new code ships
  with the tests that cover it. Invoked by the scalable-ts-review harness for any
  changed non-test source file. Usable standalone to audit coverage health.
---

# coverage-100 — deep review

Scope: **test coverage as a hard gate**. Policy: **100%** lines, branches,
functions, and statements — unless the project has *explicitly and in writing*
opted to a different number, in which case enforce *that* number and flag the
gap from 100 as a `nit` with a pointer to the policy. Review the handed files
and the project's coverage config.

## Why 100% and not 80%
A threshold below 100% is a budget for untested code, and budgets get spent on
exactly the error paths and edge branches that fail in prod. 100% also makes the
gate *binary* — "did coverage drop?" has a yes/no answer, no haggling over
whether 87.3% is acceptable. The cost is real (you must design for testability),
but that cost is paid once, at write time, by the person with the most context.

## Checklist

1. **Get the numbers.** Use the coverage output from the harness's cheap pass
   (`vitest run --coverage`, `jest --coverage`, `c8`, `nyc`, etc.). If coverage
   wasn't run or isn't configured → `blocker`-level finding: "no coverage gate";
   recommend wiring one (see bottom). If it ran, get the per-file report.
2. **Diff coverage.** For every changed/added non-test line in scope, is it
   covered? List the exact `file:line` ranges that aren't. Each uncovered line in
   new code → `blocker` (you can't merge below 100%). For *modified* files that
   were already below 100%, the new lines must be covered and you should note the
   pre-existing gap (`should-fix`, ratchet — see #6).
3. **Branch coverage specifically.** Lines can be 100% while branches aren't:
   a ternary, `&&`/`||`, optional chaining `?.`, default params, `catch`,
   un-taken `if`. Walk the new code's branches; each untaken branch needs a test
   or it's `blocker`. If a branch is genuinely unreachable, the code is dead —
   delete it, don't ignore it.
4. **Tests ship with code.** Does the diff add a `*.test.ts` / `*.spec.ts` (or
   the project's convention) alongside new source? New source file with no
   accompanying test → `blocker`. A bug fix with no regression test → `blocker`:
   the test that would have caught it must exist now.
5. **Ignore comments.** Find every `/* c8 ignore ... */`, `/* istanbul ignore
   ... */`, `// v8 ignore ...`, or config-level `exclude` entry touched by the
   diff. Each one must have an adjacent comment stating *why* this code can't or
   shouldn't be tested (e.g. "unreachable: exhaustiveness assert", "thin wrapper
   over `process.exit`"). No justification → `blocker`. "Will test later" is not
   a justification — `blocker`. A justification that's actually "this is hard to
   test" → `should-fix`: restructure for testability instead.
6. **The gate config & ratchet.** Open `vitest.config.*` / `jest.config.*` /
   `.nycrc` / `package.json`. Thresholds must be `100` for all four metrics
   (`lines`, `branches`, `functions`, `statements`) and `perFile: true` (or
   equivalent) so one well-tested file can't mask a bare one. Thresholds below
   100, `autoUpdate`/`watermarks` tricks, or per-file off → `should-fix`/`blocker`.
   If the project is *not yet* at 100, a ratchet (threshold = current %, only
   ever increases, every PR must not decrease and should increase) is the
   migration path — recommend it, and in the meantime hold *new* code to 100.
7. **Coverage of the right thing.** Check that the coverage provider instruments
   the *source*, not the compiled output, and that `all: true` (or equivalent) is
   set so files with *zero* tests still show up as 0% rather than being invisible.
   Missing `all` → `should-fix`: untested files are silently excluded.
8. **Meaningful tests, not coverage theater.** Spot-check: do the new tests
   actually assert behavior, or just call the function to paint lines green? A
   test with no meaningful assertion → `should-fix`: it satisfies the gate but
   not the point. (You can't fully judge this from coverage data — sample a few.)

## Output
Lead with the **coverage line**: `<current>% / 100% target` for each metric, and
the exact uncovered `file:line` ranges. Then per-finding as usual: `file:line`,
severity, one sentence, fix. `what NOT to do`: any ignore comment that *is*
properly justified — list it so review #2 doesn't re-question it. If the diff is
fully covered with tests shipped and the gate is correctly at 100%, say so
plainly and approve on this axis.

## Enforcement to recommend (don't auto-apply)
- Vitest: `test.coverage.thresholds = { lines: 100, branches: 100, functions: 100, statements: 100 }`, `perFile: true`, `all: true`, provider `v8` or `istanbul`.
- Jest: `coverageThreshold.global` all `100`, plus per-glob entries; `collectCoverageFrom` covering all source.
- CI: fail the build on threshold miss (the default for the above), and surface the report (e.g. as a PR comment) so drops are visible.
- Pair with `module-boundaries`/`async-errors`: code that's hard to test to 100% is usually code with a boundary or error-flow problem — fixing those makes the coverage gate reachable.
