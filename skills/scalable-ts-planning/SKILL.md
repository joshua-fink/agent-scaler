---
name: scalable-ts-planning
description: >-
  Bake scalable-TypeScript constraints into a plan BEFORE code is written.
  Invoke when planning a feature, module, refactor, or new TypeScript project /
  package — especially in plan mode. Produces a short set of design decisions
  (module boundaries, public API shape, error model, type-safety budget, test &
  coverage plan) that the implementation plan must satisfy, so review later is a
  formality, not a rework cycle.
---

# scalable-ts-planning — design constraints, up front

Reviewing code for scale is expensive; planning for it is cheap. When you (or
the Plan agent) are designing anything in a TypeScript codebase, run through
this once and **fold the answers into the plan you present**. Don't write a
separate doc — these become bullets/constraints inside the implementation plan.

This skill ships in the `scalable-ts` plugin and is project-agnostic. Its review
counterpart is `scalable-ts-review`; the deep skills it points at live at
`${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`.

## When to invoke
- Planning a new package / project / service in TS.
- Adding a feature that introduces a new module, public API, or cross-module
  dependency.
- A refactor that moves code across boundaries or changes an exported signature.
- Any plan-mode session in a TS repo where the above is plausible.

If the task is a trivial in-module change with no new exports, no new deps, and
existing tests cover it — skip this; say so in one line and move on.

## Step 0 — gate: is the existing codebase already in line with the norms?

**In planning mode, before designing the user's requested change, run the
`scalable-ts-review` harness over the existing codebase** (whole-repo audit
mode, or at minimum the modules the requested change will touch and their
dependencies).

- **`blocker` or `should-fix` issues found** → follow the abandon-and-propose
  flow below; don't ask, just do it (and notify the user, per step 1).
- **only `nit`s found** → don't abandon silently. Surface the nits in one short
  list and **ask the user** whether to (a) fix them first via the 5-commit
  proposal below, or (b) proceed with planning their change as-is. Wait for
  their answer before continuing.
- **clean** → one-line note, continue to the five questions.

When the abandon-and-propose flow applies (`blocker`/`should-fix`, or the user
chose to fix nits first):

1. **Abandon the user's current prompt.** Tell the user plainly: "Before I plan
   `<their request>`, the codebase has N existing scalability issues that the
   change would build on top of — I'm going to propose fixing those first
   instead." Do not proceed to design their feature.
2. **Instead, propose the next 5 commits** that bring the codebase into line
   with the norms:
   - **Sorted by highest impact first** — fixes that unblock the most other work
     or remove the worst risk (cycles, `any` in core APIs, missing coverage gate,
     broken commit hygiene) lead.
   - **Each commit scaled to be readable** — small, single-purpose, standalone &
     prod-safe, following `commit-modularity` (a refactor and its use are two
     commits; behavior changes carry their replacement test + rationale).
   - For each: a one-line subject, the issue it fixes (`file:line` + which deep
     skill flagged it), and the rough size.
   - If fewer than 5 issues exist, propose fewer; if many more, still cap at 5
     ("…and ~M more after these").
3. End with: "Once these land, re-run me and I'll plan `<original request>` on
   the cleaned-up base." Then stop and wait for the user.

Skip Step 0 only when there is no existing codebase (a brand-new project/package)
or the user explicitly says to plan their change without the audit.

## The five questions to answer in the plan

### 1. Module boundaries — where does this live, and what may it import?
- Which existing module/layer owns this? If none, is a new top-level module
  justified, or is that premature structure?
- What is it allowed to depend on, and what must NOT depend on it? State the
  direction. (Deep skill: `module-boundaries`.)
- Will this introduce a cycle? If the design needs A↔B, that's a design smell —
  resolve it in the plan (extract a shared module, invert a dependency, move an
  interface), not in review.

### 2. Public API shape — what's exported, and is it stable?
- Enumerate the new/changed exports. Each one is a contract you'll have to keep.
- Will consumers import from a barrel (`index.ts`) or deep paths? Decide now;
  deep-import sprawl is near-impossible to claw back later.
- Are exported function signatures explicitly typed (params + return), with no
  inferred-from-implementation surface? (Deep skill: `type-hygiene`.)

### 3. Error model — how do failures travel?
- Throw vs. return-a-`Result`? Pick one for this module and say so. Mixed models
  within a boundary are the expensive kind of inconsistency.
- What error types exist? Typed/tagged errors, or bare `Error`? Consumers need
  to discriminate.
- Async: every promise-returning path — who awaits it? Any fire-and-forget must
  be deliberate and marked. (Deep skill: `async-errors`.)

### 4. Type-safety budget — where, if anywhere, do we give up?
- Default: zero `any`, no unsafe casts, exhaustive unions. State it.
- If a boundary genuinely needs an escape hatch (untyped third-party data, a
  perf-critical cast), name exactly where and how it's contained (validated at
  the edge, `unknown` + a parser, a single well-commented assertion). Anything
  not named here will be flagged in review. (Deep skill: `type-hygiene`.)
- Build-graph implications: will this add value imports of types, big barrels,
  or anything that bloats incremental compile? Plan type-only imports and, for
  monorepos, project references now. (Deep skill: `build-perf`.)

### 5. Commit chain — how does this land?
- The plan must produce a **chain of standalone commits**: each one builds,
  passes the full test suite, and is safe to deploy on its own. Enumerate them,
  in order, each with a one-line purpose. A plan with no commit decomposition is
  incomplete.
- Refactor/move/rename commits are separate from behavior-change commits. "Extract
  `X`" and "use `X`" are two commits.
- For any step that changes existing behavior: name which tests become invalid,
  the **replacement test** to add *in the same commit*, and the rationale to put
  in that commit's message (why the old test is no longer valid + which lines of
  code cause it). No behavior change ships without its replacement test and
  explanation.
- Public-API / schema / wire-format changes land additively first, then remove —
  across separate, each-shippable commits — never break-then-fix in one.
- (Deep skill: `commit-modularity`, Mode 1, validates the plan against exactly
  this; Mode 2 checks the eventual stack didn't diverge.)

### 6. Test & coverage plan — how do we hit 100%?
- Coverage target is **100%** (lines, branches, functions) unless the project
  has explicitly opted out. Plan the tests alongside the code, not after.
- For each new unit: what are its branches/error paths, and what test exercises
  each? If a branch is untestable, the design is wrong — restructure so it's
  testable, or it shouldn't exist.
- Any `/* c8 ignore */`-style exclusion must be justified in the plan with the
  reason; "we'll add tests later" is not a reason. (Deep skill: `coverage-100`.)

## Output
Add to the implementation plan a short **"Scale constraints"** section: one
line per question above with the decision (not the discussion), then a
**"Commit chain"** subsection listing the commits in order. Example:

> **Scale constraints**
> - Lives in `core/billing`; may import `core/types`, `shared/result`; nothing
>   imports it except `api/`. No new cycles.
> - Public API: `createInvoice`, `InvoiceError` exported from `core/billing/index.ts`;
>   explicit return types; consumers use the barrel only.
> - Errors: returns `Result<Invoice, InvoiceError>`; `InvoiceError` is a tagged union.
> - Type budget: zero `any`; Stripe webhook payload parsed via zod at the edge,
>   `unknown` until then.
> - Tests: vitest; cover both `Result` arms + the two validation branches;
>   target 100%, no ignores planned.
>
> **Commit chain** (each builds + full suite green + shippable)
> 1. `core/billing: add InvoiceError tagged union + tests` — types only, no callers.
> 2. `core/billing: add createInvoice returning Result + tests` — covers both arms.
> 3. `core/billing: export public API from index.ts` — barrel only.
> 4. `api: wire createInvoice into POST /invoices + tests` — consumes the barrel.
>    Test impact: replaces `api/invoices.legacy.test.ts` (asserted the old throw
>    behavior); new test asserts the `Result` mapping. Message will state why +
>    cite `api/invoices.ts:L40-58`.

Then proceed with the rest of the plan as normal. When implementation is done,
`scalable-ts-review` (and `commit-modularity` Mode 2) check the branch against
exactly these decisions and this chain.
