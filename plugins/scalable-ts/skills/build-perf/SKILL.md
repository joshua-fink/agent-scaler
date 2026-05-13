---
name: build-perf
description: >-
  Deep skill: review TypeScript build & compile-time performance at scale —
  type-only imports/exports, isolatedModules/verbatimModuleSyntax, project
  references in monorepos, barrel-file bloat, `import *` overuse, and incremental
  build health. Invoked by the scalable-ts-review harness when changed files
  include tsconfig changes, value-imports of types, large new barrels, or
  wildcard imports. Usable standalone to audit build config.
---

# build-perf — deep review

Scope: **what the diff does to compile time and the module graph the bundler/
`tsc` sees**. Not runtime perf, not module *boundaries* (that's
`module-boundaries`, which cares about correctness of dependencies; this skill
cares about their *cost*). Review the handed files plus any build config in
scope.

## Why this matters at scale
`tsc` and bundlers walk the import graph. Value imports pull whole modules into
that graph even when only a type was needed; barrels turn "import one thing"
into "load fifty things"; type cycles defeat incremental compilation. A 30-file
project doesn't notice. A 3000-file one has 5-minute builds because of patterns
that were free to fix early.

## Checklist (against the handed files + build config)

1. **Type-only imports.** Every import used *only* in type position must be
   `import type { ... }` (or inline `import { type X }`). A value import of a
   type → `should-fix`: it can't be erased, so it stays in the runtime graph and
   can create cycles that block incremental builds. Read `eslint`
   (`consistent-type-imports`) output if it ran. Same for `export type`.
2. **`import type` side effects.** `import type "./x"` is meaningless; a real
   side-effect import must be a value import. `should-fix`. (Rule:
   `no-import-type-side-effects`.)
3. **tsconfig flags.** If a `tsconfig*.json` changed (or you're auditing),
   check:
   - `isolatedModules: true` — required for fast per-file transpilers (esbuild,
     swc) and for `--build` correctness. Missing → `should-fix`.
   - `verbatimModuleSyntax: true` — makes type-vs-value imports explicit and
     erasure predictable. Missing → `nit`/`should-fix`.
   - `incremental: true` (or `composite` in a monorepo) — without it every build
     is a full build. Missing → `should-fix`.
   - `skipLibCheck: true` — usually right; not having it can balloon check time.
   - Loosening any of these in the diff → `should-fix`, demand a reason.
4. **Project references (monorepos).** If this is a monorepo and packages
   reference each other only via path mappings with one big `tsconfig`, that's
   an O(n²) rebuild story. `should-fix` at scale: recommend `composite: true` +
   `references` so a change in package A only rechecks A and its dependents.
5. **Barrel bloat.** For each new/changed `index.ts` barrel: how many modules
   does it re-export? A barrel that's imported widely and re-exports a large
   subtree means importing *anything* from it loads *everything* — and frustrates
   tree-shaking. `should-fix` for big ones: split the barrel by sub-area, or have
   hot consumers import directly. (See also `module-boundaries` on barrel scope.)
6. **`import * as ns`.** Wildcard namespace imports defeat tree-shaking and pull
   the whole module. `nit`/`should-fix` unless the module genuinely is a
   cohesive namespace (e.g. `import * as path from "node:path"` is fine; `import
   * as utils from "./utils"` to grab two functions is not).
7. **Type-level cycles.** Mutually-referential `.d.ts`-style type files, or types
   imported across a cycle. These quietly disable incremental compilation for the
   whole cycle. `should-fix`: break with a shared types module.
8. **Heavy type computation.** Deeply recursive conditional/mapped types,
   giant unions (hundreds of members), template-literal type explosions. If the
   diff adds one, `nit`/`should-fix`: note it can dominate check time; suggest a
   simpler model or precomputed types.

## Output
Per finding: `file:line`, severity, one-sentence cost (ideally quantified —
"this barrel re-exports N modules"), concrete fix. `what NOT to do`: any
wildcard import or barrel that is deliberately whole-module. Say so explicitly
if the handed files are clean.

## Enforcement to recommend (don't auto-apply)
tsconfig: `isolatedModules`, `verbatimModuleSyntax`, `incremental` (or
`composite` + `references` for monorepos), `skipLibCheck`. ESLint:
`consistent-type-imports`, `consistent-type-exports`,
`no-import-type-side-effects`. Shipped in
`${CLAUDE_PLUGIN_ROOT}/eslint-config/index.js`. For ongoing visibility at scale,
recommend `tsc --extendedDiagnostics` / `--generateTrace` in CI to watch
check-time trends.
