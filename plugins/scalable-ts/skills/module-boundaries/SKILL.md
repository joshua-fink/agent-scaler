---
name: module-boundaries
description: >-
  Deep skill: review TypeScript module boundaries and dependency hygiene for
  scale — layering direction, public API barrels vs. deep imports, cross-module
  coupling, and circular dependencies. Invoked by the scalable-ts-review harness
  when changed files cross directory boundaries, add/modify barrels, contain
  `../../` chains, or introduce a new top-level module. Can also be used
  standalone to audit a project's structure.
---

# module-boundaries — deep review

Scope of this skill: **how modules depend on each other**. Not types, not async
— those are other skills. You were handed a list of files; review only those
plus their import/export edges.

## What "good" looks like at scale
- **Acyclic** module graph. Cycles break incremental builds, create
  runtime init-order bugs, and make any module impossible to reason about in
  isolation.
- **Directional layering.** Higher layers import lower; lower never imports
  higher. Typical: `app/feature → domain/core → shared/util`. Side modules
  (`api`, `cli`) sit on top.
- **Modules have a public API.** Consumers import from the module's `index.ts`
  (barrel), not its internal files. The barrel is the contract; everything else
  is free to move.
- **Barrels are local.** A module's `index.ts` re-exports its *own* children. A
  barrel that re-exports from sibling/parent modules is how one small change
  drags the whole repo into a rebuild.
- **No reaching across packages by relative path.** In a monorepo, cross-package
  imports go through the package name, never `../../other-package/src/...`.

## Checklist (run against the handed files)

1. **Cycles.** If `eslint` with `import/no-cycle` ran in the harness's cheap
   pass, read its output. Otherwise trace imports among the changed files and
   their direct neighbors. Any cycle → `blocker`. In the fix, name the
   resolution: extract a shared module, invert a dependency via an interface, or
   merge two modules that are really one.
2. **Layer violations.** Determine the project's layers (from a
   `import/no-restricted-paths` config, an architecture doc, or the directory
   names). For each cross-directory import in scope, check direction. Wrong-way
   import → `blocker` or `should-fix` depending on how load-bearing it is.
3. **Deep imports.** Flag any import that reaches *into* another module past its
   `index.ts` (`import { x } from "../billing/internal/calc"`). `should-fix`:
   route through the barrel, and if the symbol isn't exported there, that's a
   sign it shouldn't be a cross-module dependency at all.
4. **Barrel scope.** Open any new/changed `index.ts`. If it re-exports from
   outside its own subtree → `should-fix`. If a barrel is huge (re-exports
   dozens of modules) note the build cost (`build-perf` will quantify it).
5. **`../../` chains.** Two-or-more-level relative parent imports → smell, not
   always wrong. `nit` to `should-fix`: usually means the file is in the wrong
   place or the boundary is mis-drawn. Suggest the move.
6. **New top-level module.** If the diff adds a new top-level directory, ask:
   is this a real boundary with a distinct responsibility, or premature
   structure? If the latter, `should-fix`: keep it inside an existing module
   until it earns separation.
7. **God modules.** A `utils/` or `shared/` that everything imports and that
   imports from everywhere is an anti-boundary. Note it; suggest splitting by
   actual concern.

## Output (back to the harness)
For each finding: `file:line`, severity, one sentence on the scale cost, the
fix. Add a `what NOT to do` note for any cross-boundary import that is
*deliberate and correct* (e.g. a documented plugin-extension point) so it isn't
re-flagged. If you found no boundary issues in scope, say so explicitly — that's
a real result, not an omission.

## Enforcement to recommend (don't auto-apply)
- `eslint-plugin-import`: `import/no-cycle`, `import/no-relative-packages`,
  `import/no-restricted-paths` with the project's layer zones,
  `import/no-useless-path-segments`. The plugin's shipped config
  (`${CLAUDE_PLUGIN_ROOT}/eslint-config/index.js`, `recommended({ layers })`)
  wires these up — point the user at it if they want the deterministic backstop.
- For monorepos at real scale: TS project references, so a layer violation also
  fails the build, not just the lint.
