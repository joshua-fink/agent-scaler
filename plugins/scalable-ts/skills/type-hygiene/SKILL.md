---
name: type-hygiene
description: >-
  Deep skill: review TypeScript type hygiene for scale — `any` and unsafe casts,
  explicitly-typed public APIs, exhaustive unions/switches, `unknown` + narrowing
  at boundaries, and avoiding inferred-from-implementation exported signatures.
  Invoked by the scalable-ts-review harness when changed files contain `any`,
  `as `, non-null `!`, `@ts-*` comments, switches over unions, or exported
  functions without return types. Usable standalone to audit type safety.
---

# type-hygiene — deep review

Scope: **the type system as a load-bearing tool**. Not module structure, not
async handling — other skills. Review only the handed files and their type
surface.

## Why this is a scalability concern
A single `any` doesn't fail anywhere — it silently disables the checker for
every value derived from it, sometimes across module boundaries. Multiply by a
growing team and the type system stops catching the regressions it exists to
catch. Same with unchecked casts (`as Foo` when it isn't a `Foo`), `!`, and
`@ts-ignore`. Exported signatures inferred from implementation are a different
flavor of the same problem: an "internal" refactor silently changes a public
contract.

## Checklist (against the handed files)

1. **`any` — explicit or implicit.** Read `tsc --noEmit` and `eslint`
   (`no-explicit-any`, `no-unsafe-*`) output from the harness's cheap pass.
   Every `any` is at least `should-fix`; in a public signature or a widely-used
   util it's a `blocker`. Fix: `unknown` + a type guard / parser at the point of
   entry, or a precise generic, or an actual interface. Never "just to make it
   compile".
2. **Unsafe casts.** `x as Foo` where the compiler can't verify it, and worse
   `x as unknown as Foo` / `x as any`. `should-fix`/`blocker`. Fix: validate
   (zod/io-ts/hand-written guard) and let narrowing do the work; if it's truly a
   "I know better than the compiler" spot, allow exactly one assertion with a
   comment explaining the invariant. `as const` and `satisfies` are fine and
   encouraged.
3. **Non-null `!`.** Each `foo!.bar` / `arr[0]!` asserts something the type says
   might be absent. `should-fix` outside tests: handle the `undefined` case, or
   restructure so it can't occur, or — if provably impossible — a guard with a
   thrown error beats a silent `!`. (In tests, `!` is acceptable.)
4. **`@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`.** `@ts-nocheck` →
   `blocker`. `@ts-ignore` → `should-fix`, must become `@ts-expect-error` with a
   reason at minimum (so it fails when the underlying issue is fixed). A bare
   suppression with no comment is never acceptable.
5. **Exhaustiveness.** For each `switch`/`if-else` chain over a union or enum:
   is there a `default` (or final `else`) that does `assertNever(x)` /
   `x satisfies never`? If not → `should-fix`: adding a union member must break
   this. Recommend `@typescript-eslint/switch-exhaustiveness-check`.
6. **Public-API typing.** For each exported function/method in scope: are
   parameters and **return type** explicitly annotated? An exported symbol whose
   type is inferred from its body → `should-fix` (recommend
   `explicit-module-boundary-types`). Internal helpers can infer freely.
7. **Boundary parsing.** Data crossing a trust boundary (HTTP bodies, env vars,
   `JSON.parse`, file contents, message queues) must be parsed/validated, not
   cast. Untyped/`as`-cast external data → `should-fix`/`blocker`. Recommend a
   schema validator at the edge; everything inward is then properly typed.
8. **Type sprawl.** Duplicated/near-duplicate type definitions, redundant union
   members, overly wide types where a literal/branded type fits. `nit`/`should-fix`
   — it's a maintenance tax that compounds. Recommend `no-redundant-type-constituents`,
   `no-duplicate-type-constituents`.
9. **`noUncheckedIndexedAccess` awareness.** If the project has it off, note it
   — array/record access returning `T` instead of `T | undefined` hides a whole
   class of bugs at scale. If on, make sure new code actually handles the
   `undefined`.

## Output
Per finding: `file:line`, severity, one-sentence scale cost, concrete fix.
Record as `what NOT to do` any cast/`!`/`@ts-expect-error` that is *correctly
contained and commented* — so review #2 doesn't re-litigate it. State explicitly
if the handed files are clean.

## Enforcement to recommend (don't auto-apply)
tsconfig: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`. ESLint (type-aware):
`no-explicit-any`, `no-unsafe-*`, `consistent-type-assertions`,
`no-non-null-assertion`, `switch-exhaustiveness-check`,
`explicit-module-boundary-types`. All of these are in the plugin's shipped
config at `${CLAUDE_PLUGIN_ROOT}/eslint-config/index.js`.
