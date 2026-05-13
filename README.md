# scalable-ts — a Claude Code plugin

Agents that enforce best practices for **scalable TypeScript projects**. Runs
entirely inside Claude Code (no Anthropic API, no SDK, nothing billed outside
your Max plan).

It's a **lightweight harness** that dispatches to **deep skills** only for the
concerns a given change actually touches — so a small diff doesn't drag the
whole rulebook into context.

## What's in it

| Skill | Kind | What it does |
|---|---|---|
| `scalable-ts-review` | harness | Scans a diff / branch / PR, classifies each file, dispatches to the deep skills below, assembles one report. Also routes plan-markdown reviews to the planning + commit-modularity skills. |
| `scalable-ts-planning` | planning companion | Run in plan mode for any TS project. Bakes the same constraints (module boundaries, public API shape, error model, type-safety budget, commit chain, 100%-coverage plan) into the plan **before code is written**, so review is a formality. |
| `module-boundaries` | deep | Layering direction, public-API barrels vs. deep imports, cross-module coupling, circular deps. |
| `type-hygiene` | deep | `any`/unsafe casts, explicitly-typed public APIs, exhaustive unions, `unknown` + narrowing at boundaries. |
| `build-perf` | deep | Type-only imports, `isolatedModules`/`verbatimModuleSyntax`, project references, barrel bloat, incremental-build health. |
| `async-errors` | deep | Floating/misused promises, swallowed catches, throwing non-Errors, consistent throw-vs-`Result` error models, typed errors, `await`-in-loop judgement. |
| `coverage-100` | deep | Enforces 100% line/branch/function/statement coverage: diff coverage, the gate config, justified ignore comments, tests-ship-with-code, ratchet for projects not yet there. |
| `commit-modularity` | deep | Every commit standalone & prod-safe; digestible chain; behavior changes that invalidate a test require a replacement test + a message saying why and which lines caused it. **Mode 1** reviews a plan markdown before code; **Mode 2** reviews an actual commit stack for divergence. |

Plus `eslint-config/` — the **deterministic** half of the rules as a shareable
ESLint flat-config (`@scalable-ts/eslint-config`). The harness runs it first for
free signal; the skills only spend reasoning on what a linter can't decide. Wire
it into a project with `recommended({ project, layers })` — see the file header.

## How the pieces fit

- **Before code:** in plan mode, invoke `scalable-ts-planning`. If you have a
  written plan, hand it to `commit-modularity` (Mode 1) to verify it produces a
  clean commit chain.
- **While reviewing:** invoke `scalable-ts-review` on a diff, branch, or PR. It
  does the cheap deterministic pass (eslint/tsc/coverage), classifies the
  changed files, dispatches to just the relevant deep skills, and gives you one
  report with a verdict, the coverage line, and a "what NOT to do" list of
  deliberate tradeoffs so the next review doesn't re-litigate them.
- **On a stack:** reviewing a branch automatically pulls in `commit-modularity`
  (Mode 2) to check each commit builds, passes the full suite, is shippable
  alone, and follows the test-replacement protocol.

## Install (as a Claude Code plugin)

This repo *is* the plugin (`.claude-plugin/plugin.json` at the root). Add it to
a marketplace and install per project, or point Claude Code at the local path:

```
# from a marketplace that lists this repo
/plugin install scalable-ts

# or, developing locally
/plugin marketplace add /path/to/this/repo
/plugin install scalable-ts@<marketplace-name>
```

A minimal `marketplace.json` for hosting it yourself:

```json
{
  "name": "your-marketplace",
  "owner": { "name": "you" },
  "plugins": [
    { "name": "scalable-ts", "source": "./", "description": "Best-practice agents for scalable TypeScript." }
  ]
}
```

Once installed, the skills are available in any TypeScript project — they never
assume files exist in the project being reviewed, and they recommend (never
auto-install) the ESLint config and tsconfig flags they rely on.

## Design constraints (intentional)

- No Anthropic API / SDK usage — pure Claude Code skills, Max-plan only.
- The harness stays thin; analysis lives in the deep skills, loaded on demand.
- Skills *recommend* config/CI/deps; they never modify the target project unless
  the user explicitly asks for fixes.
- 100% coverage is the default policy; a project can opt out in writing, and the
  skills will then enforce *that* number instead.
