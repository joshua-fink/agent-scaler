---
name: async-errors
description: >-
  Deep skill: review TypeScript async control flow and error handling for scale
  — floating/unhandled promises, misused promises, swallowed catches, throwing
  non-Errors, consistent throw-vs-Result error models, typed/tagged errors, and
  await-in-loop judgement calls. Invoked by the scalable-ts-review harness when
  changed files use async/await, `.then(`, `Promise`, `catch`, `throw`, or
  `try`. Usable standalone to audit error handling.
---

# async-errors — deep review

Scope: **how asynchronous work and failures flow**. Not types in general
(`type-hygiene`), not module structure. Review the handed files.

## Why this matters at scale
Floating promises are the canonical production incident: an error rejects a
promise nobody awaited, and either the process crashes (Node's
`unhandledRejection`) or the failure vanishes. Swallowed catches turn outages
into silent data corruption. An inconsistent error model — half the codebase
throws, half returns `Result` — means every caller guesses wrong eventually. All
of these are cheap to prevent and expensive to debug across a large surface.

## Checklist (against the handed files)

1. **Floating promises.** Every call that returns a `Promise` must be `await`ed,
   `return`ed, `.catch()`-handled, or explicitly `void`-ed *with intent*. Read
   `eslint` (`no-floating-promises`) output if it ran. An unhandled promise →
   `blocker` in request/lifecycle paths, `should-fix` elsewhere. Fix: await it,
   or if it's genuinely fire-and-forget, `void doThing().catch(reportError)` —
   never a bare `doThing()`.
2. **Misused promises.** A promise passed where a sync value/`void` is expected:
   `if (asyncFn())` (always truthy), `arr.forEach(async ...)` (no waiting),
   passing an `async` handler where a `() => void` is expected and the rejection
   is lost. `should-fix`/`blocker`. (Rule: `no-misused-promises`.) Fix:
   `for...of` + `await`, or `Promise.all(arr.map(...))`, or handle the rejection.
3. **Swallowed errors.**
   - Empty `catch {}` → `blocker`. At minimum log + rethrow, or handle
     meaningfully.
   - `catch (e) { /* nothing */ }` or `catch (e) { return undefined }` that
     loses the error → `should-fix`: is the caller supposed to know this failed?
   - `catch (e) { throw new Error("failed") }` that drops the cause →
     `should-fix`: use `{ cause: e }` so the stack survives.
   - `.catch(() => {})` on a promise → same as empty catch.
4. **Throwing non-Errors.** `throw "string"`, `throw { code: 1 }`, `throw 42` —
   loses the stack and breaks `instanceof` checks. `should-fix`. (Rule:
   `only-throw-error`, `prefer-promise-reject-errors`.) Fix: a real `Error`
   subclass.
5. **Error model consistency.** Within a module/boundary, is failure signaled
   one way? If the diff adds a function that returns `Result<T, E>` into a module
   that otherwise throws (or vice versa) → `should-fix`: pick the module's
   convention. Mixed models at a boundary are the costly inconsistency. (The
   plan, via `scalable-ts-planning`, should have decided this — check against it
   if a plan exists.)
6. **Typed errors.** Are errors discriminable? A function that can fail several
   ways should throw/return a tagged union or distinct `Error` subclasses, not
   bare `Error` with a stringly-typed `.message` callers must parse.
   `should-fix` for new public failure paths.
7. **`await` in loops.** `for (const x of xs) { await f(x) }` is *sometimes*
   correct (ordering matters, rate limits, backpressure) and *sometimes* a
   needless serialization that should be `Promise.all`. Don't auto-flag — make
   the judgement call: if order/independence allows parallelism and the list can
   be large, `should-fix` → `Promise.all` (or a bounded-concurrency map). If
   it's deliberate, record it as `what NOT to do`.
8. **Unhandled rejection / process safety.** New top-level `await`, new
   long-lived async loops, new event handlers — is there a catch-all? Note if
   the project has no `process.on("unhandledRejection")` / framework equivalent.
9. **Cancellation & timeouts.** New network/IO calls without a timeout or
   `AbortSignal` plumbing → `nit`/`should-fix` at scale: an un-timed-out call is
   a latent hang under load. Recommend threading `AbortSignal`.
10. **`async` without `await`.** A function marked `async` that never awaits is
    either a mistake or hiding sync work behind a promise. `nit`: drop `async`
    or make the asynchrony real.

## Output
Per finding: `file:line`, severity, one-sentence scale cost, concrete fix.
`what NOT to do`: deliberate `await`-in-loop, intentional fire-and-forget that's
properly `.catch`-ed, etc. State explicitly if the handed files are clean.

## Enforcement to recommend (don't auto-apply)
ESLint (type-aware): `no-floating-promises`, `no-misused-promises`,
`await-thenable`, `return-await`, `promise-function-async`, `only-throw-error`,
`prefer-promise-reject-errors`, `no-async-promise-executor`, and
`no-empty` with `allowEmptyCatch: false`. Shipped in
`${CLAUDE_PLUGIN_ROOT}/eslint-config/index.js`. Plus a process-level
`unhandledRejection` handler in the app entrypoint.
