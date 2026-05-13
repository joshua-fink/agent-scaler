---
name: scalable-ts-review
description: >-
  Lightweight harness for reviewing a TypeScript codebase against scalability
  best practices. Scans changed/target files, classifies what each one touches,
  and dispatches to the deep concern skills (module-boundaries, type-hygiene,
  build-perf, async-errors, coverage-100) only for the concerns that actually
  apply. Use when the user asks to "review for scalability", "check best
  practices", audit a TS PR/module, or before merging.
---

# scalable-ts-review — the harness

You are reviewing TypeScript code for **scalability** — meaning: will this stay
maintainable, buildable, and correct as the codebase and team grow 10x? This
skill is a *thin orchestrator*. It does almost no analysis itself; it figures
out **which deep skills to invoke** and in what order, runs them, and assembles
one report.

This skill ships in the `scalable-ts` plugin, so it works in **any** TypeScript
project — it never assumes files exist in the project being reviewed.

## The deep skills

Each lives at `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`. Invoke a deep skill
by reading its `SKILL.md` and following it, scoped to the files you flagged for
that concern. Do **not** load all of them up front — load each only when the
scan says it's relevant. That's the whole point of the harness.

| Deep skill | Owns | Trigger signals during scan |
|---|---|---|
| `module-boundaries` | layering, public APIs/barrels, cross-module imports, circular deps | `import`/`export` across directories, new `index.ts` barrels, `../../` chains, new top-level dir |
| `type-hygiene` | `any`/unsafe casts, public-API typing, exhaustiveness, `unknown` narrowing | `any`, `as `, `!.`, `// @ts-`, `switch` on a union, exported fn without return type |
| `build-perf` | type-only imports, project refs, `isolatedModules`, barrel bloat, build config | `tsconfig*.json` changes, value-import of a type, large new barrel, `import *` |
| `async-errors` | floating promises, swallowed catches, typed errors, `Result` patterns | `async`/`await`, `.then(`, `Promise`, `catch {`, `throw `, `try {` |
| `coverage-100` | the policy of 100% test coverage; gaps, ratchet, justified ignores | any new/changed `.ts` that isn't a test, missing `.test.ts`, coverage config |
| `commit-modularity` | each commit standalone & prod-safe, digestible chain, test-replacement protocol, plan→clean-stack | review target is a branch/commit stack (not just a working-tree diff); a plan markdown was handed in |

> Coverage is a hard policy for this plugin's users (100% required). Always run
> `coverage-100` if any non-test source changed, even if nothing else triggers.
> A consuming project that genuinely doesn't want 100% can say so; default is to
> enforce it.
>
> `commit-modularity` runs whenever the review target is a *branch / commit
> stack* rather than an uncommitted working-tree diff: every commit must build,
> pass the full suite, and be shippable on its own; behavior changes that
> invalidate a test need a replacement test plus a message saying why the old
> test is invalid and which lines caused it. It has a **second mode for
> reviewing a plan markdown before any code exists** — if the user hands you a
> plan doc, invoke `commit-modularity` (Mode 1) and `scalable-ts-planning`
> instead of the code-review path below.

## Procedure

### 1. Establish scope
- If the user handed you a **plan markdown** (or asks to "check this plan"), this
  is a pre-code review: skip the rest of this procedure and run
  `commit-modularity` (Mode 1) + `scalable-ts-planning` against it. Done.
- If the user named files/dirs/a PR, use that.
- If the target is a **branch / commit stack** (a PR, "review my branch",
  "check the stack"), set scope to the merge-base..HEAD range AND mark
  `commit-modularity` as a required dispatch (it reviews the commits; the
  content skills review the cumulative diff).
- Else, default to the working tree diff vs. the merge-base of the default
  branch: `git diff --name-only --merge-base <default-branch>` (fall back to
  `git diff --name-only HEAD`, or whole repo for a fresh audit). Confirm the
  scope back to the user in one line before doing heavy work on a large diff.
- Restrict to `*.ts`/`*.tsx`/`*.mts`/`*.cts` plus `tsconfig*.json`,
  `eslint.config.*`, `package.json`, and any coverage config.

### 2. Cheap deterministic pass first
Before invoking any deep skill, run whatever already exists in the project — it's
free signal and burns no review effort:
- `eslint <files>` if an eslint config is present. This plugin ships a
  scalability-tuned config at `${CLAUDE_PLUGIN_ROOT}/eslint-config/index.js`; if
  the project doesn't use it, the `build-perf` skill explains how to adopt it —
  recommend it once, don't auto-install.
- `tsc --noEmit` if a tsconfig is present.
- the project's coverage command (e.g. `vitest run --coverage`,
  `jest --coverage`) if coverage is configured.
Collect the output; the deep skills interpret it rather than re-deriving it. If a
tool isn't set up, that's itself a finding ("no type-checking in CI") — note it
and move on. Don't install anything.

### 3. Classify
For each in-scope file, scan it once and tag it with the set of concerns it
triggers (table above). Build a map: `concern -> [files]`. Skip concerns with no
files (except `coverage-100`, per the note above).

### 4. Dispatch
For each triggered concern, in this order — `module-boundaries`,
`type-hygiene`, `build-perf`, `async-errors`, `coverage-100`,
`commit-modularity` — read that deep skill's `SKILL.md` and execute it against
just that concern's file list (for `commit-modularity` in stack-review mode,
the commit range). Order matters: boundary problems often explain type/async
problems; the coverage verdict depends on what the others want changed; and
`commit-modularity` comes last because it judges how all of the above are
sliced into commits.

If a deep skill file is missing, say so and fall back to its row in the table
above as a mini-checklist rather than skipping the concern.

### 5. Assemble one report
Merge findings into a single review. Per finding: **file:line**, **concern**,
**severity** (`blocker` / `should-fix` / `nit`), one sentence on why it hurts at
scale, and a concrete fix. End with:
- a **verdict**: `block` / `approve-with-fixes` / `approve`;
- the **coverage line**: current % vs. 100% target, and exactly which
  lines/files are uncovered;
- **what NOT to do**: anything a deep skill flagged as a deliberate tradeoff
  (e.g. an intentional `await`-in-loop), so a later reviewer doesn't re-flag it.

## Rules for the harness itself
- Stay thin. If you're doing deep analysis here, you skipped a dispatch — go
  read the relevant deep skill.
- Never modify code unless the user explicitly asks for fixes; default output is
  the report.
- Don't add dependencies, CI, or config to the target project on your own — the
  output may *recommend* them.
- Token-budget aware: this runs on the user's Max plan, not the API. Prefer the
  cheap deterministic pass; spend reasoning only on judgement calls the linters
  can't make.
- If scope is huge (>~40 files), do step 3 for everything but ask the user
  whether to dispatch all concerns or prioritize a subset.

## Related
- Before code is written, use `scalable-ts-planning` to bake these constraints
  into the plan — cheaper than fixing them in review.
