---
name: commit-modularity
description: >-
  Deep skill: enforce modular, standalone commits. Every commit in a stack must
  build, pass the full test suite, and be safe to ship to production on its own;
  the chain must be digestible (small, single-purpose, ordered); behavior changes
  that invalidate a test require a replacement test plus a commit message
  explaining why the old test is no longer valid and which lines of code cause
  it. Has TWO modes: (1) review a PLAN markdown to verify it will produce such a
  chain BEFORE code is written; (2) review an actual commit stack for divergence
  from these rules. Invoke on plan markdown, before merging a branch, or on
  request to "check the commit stack / commit hygiene".
---

# commit-modularity — deep review

Scope: **the shape of the commit history**, not the code's content (the other
`scalable-ts-*` skills cover content). This skill runs in one of two modes —
detect which from what you were handed.

## The rules being enforced

For every commit in a branch/stack:

1. **Standalone & prod-safe.** Checked out in isolation, the repo builds
   (`tsc`), the **full** test suite passes, lint passes, and the result is
   something you could deploy. No "fixed in the next commit", no commit that only
   makes sense with its neighbors.
2. **Backwards-compatible with all tests.** A commit does not break an existing
   test. If a test must change because the *behavior it asserted is intentionally
   changing*, that's allowed only with the replacement-test protocol below.
3. **Single purpose, digestible.** One logical change per commit. A reviewer can
   hold the whole diff in their head. Refactor-then-use is two commits, not one.
   Mechanical changes (rename, move, format) are their own commits, separate from
   behavior changes.
4. **Ordered for review.** Prereqs before dependents; the stack reads as a
   narrative. No commit reverts or rewrites an earlier commit in the same stack
   (squash it instead).
5. **Replacement-test protocol** — when a behavior change invalidates a test:
   - the same commit that changes the behavior also **adds the replacement
     test** for the new behavior (suite stays green, coverage stays 100%);
   - the commit message explains, explicitly: **why** the old test is no longer
     valid (what behavior changed and the decision behind it), **which lines of
     code** cause the change (file:line, or the function/module), and **what the
     replacement test now asserts**;
   - the old test is *modified or replaced*, never just deleted, unless it's
     genuinely testing removed functionality — and then the message says so.
6. **Message quality.** Imperative subject, scoped, explains *why* not just
   *what*. Anything non-obvious — a tradeoff, a deferred follow-up, a reason a
   test changed — is in the body, not lost.

---

## Mode 1 — review a PLAN markdown (before code)

You were handed (or pointed at) a plan document. Your job: confirm it will
*produce* a chain that satisfies the rules, and if not, say exactly how to fix
the plan.

Check the plan for:

- **An explicit commit breakdown.** The plan must enumerate the commits it will
  produce, in order, each with a one-line purpose. If it doesn't → `blocker` on
  the plan: it must. A plan that says "implement feature X" with no decomposition
  cannot produce a digestible stack by accident.
- **Each planned commit is standalone.** Walk the list: after commit *k*, does
  the repo build and pass tests? If commit 2 needs commit 3's code to compile,
  the split is wrong — reorder or merge. Call out every such case.
- **Refactor/move/rename isolated.** If the plan mixes "extract `Foo`" with "use
  `Foo` in the new feature" in one commit → flag: split them.
- **Behavior changes flagged with the protocol.** For any plan step that changes
  existing behavior, the plan must already name: which tests become invalid, the
  replacement tests to add in the same commit, and the rationale to put in the
  message. Missing → `blocker` on the plan; have it add a "Test impact" note per
  affected step. (`scalable-ts-planning` asks for this — cross-check.)
- **Backwards compatibility / migration.** If the change touches a public API,
  schema, or wire format, the plan must say how each commit stays prod-safe
  (additive first, deprecate, then remove — across separate commits, each
  shippable). A single commit that breaks then fixes compatibility → flag.
- **Coverage stays 100% at every commit**, not just at the end (defer to
  `coverage-100` for the standard; here just confirm the plan doesn't have a
  "tests come in the last commit" structure).
- **Size sanity.** If any planned commit looks like it'll be a 1000-line
  diff doing five things, flag it for further decomposition before coding starts.

**Output (Mode 1):** a verdict on the plan — `plan-ready` /
`revise-plan` — plus, for each problem, the plan section, what's wrong, and the
concrete revision (e.g. "split step 3 into 3a: extract `parseConfig`; 3b: use it
in loader"). If `plan-ready`, restate the approved commit chain so it's the
contract the implementation and Mode 2 check against.

---

## Mode 2 — review an actual COMMIT STACK

You were handed a branch (or "the current stack"). Determine the range:
`git log --oneline --no-merges <base>..HEAD` where `<base>` is the merge-base
with the default branch. For **each** commit in that range, oldest first:

1. **Build & test in isolation.** `git stash` any dirt, then for commit *c*:
   `git checkout <c>`, run the project's build (`tsc --noEmit` or `npm run
   build`), the **full** test suite, and lint. Any failure → `blocker` against
   that commit, with the failing output. Restore `HEAD` when done. (If checking
   every commit is too expensive for a long stack, check the first, the last,
   and any commit that touches build config or test files, and say you sampled.)
2. **No broken-then-fixed.** Diff each commit against its parent. Does any commit
   delete/skip/`xfail` a test, or `@ts-expect-error` something, that a later
   commit "fixes"? → `blocker`: squash or reorder.
3. **Single purpose.** Read each commit's diff. Mixed concerns (refactor +
   feature, two unrelated features, format + logic) → `should-fix`: split.
   Note 1000-line single-purpose commits as `nit` (acceptable but flag if a
   natural seam exists).
4. **Test changes follow the protocol.** For every commit that modifies or
   deletes a test file:
   - Did the same commit add/adjust a test covering the new behavior? If a test
     was weakened or removed with no replacement → `blocker`.
   - Does the commit message explain *why* the old test is invalid, *which lines
     of code* caused it, and *what the replacement asserts*? Missing any of the
     three → `blocker`; quote what the message currently says and what it must
     add.
   - Did the suite stay green across the change (covered by step 1)?
5. **Backwards compat.** For commits touching public APIs / schemas / wire
   formats: is each one independently deployable, or does commit *k* break
   consumers until commit *k+1*? The latter → `blocker`: restructure to
   additive-then-remove across shippable commits.
6. **Order & narrative.** Are prereqs before dependents? Does the stack read in
   order? Out-of-order or revert-within-stack → `should-fix`.
7. **Messages.** Subject imperative & scoped; body explains why; non-obvious
   decisions captured. Weak messages → `nit`/`should-fix` (the test-rationale
   ones in #4 are `blocker`, not `nit`).
8. **Divergence from the plan.** If a plan went through Mode 1, compare the
   actual stack to the approved chain. Extra commits, merged steps, skipped
   replacement tests, reordering that breaks standalone-ness → call each out as
   "diverges from plan: …". Drift that's actually an *improvement* is fine —
   note it and move on.

**Output (Mode 2):** verdict — `stack-clean` / `needs-rework` / `block` — then
per-commit findings (`<short-sha> <subject>` → list), then the cross-cutting
ones (order, divergence). `what NOT to do`: any deviation that's deliberate and
sound (e.g. an intentionally large but cohesive commit) so review #2 leaves it
alone. End with the concrete rebase plan if rework is needed (which commits to
squash/split/reorder/reword).

---

## Notes
- This skill never rewrites history itself. It produces the rebase plan; the
  user runs it (or asks you to, separately).
- It pairs with `coverage-100` (every commit at 100%) and `scalable-ts-planning`
  (which already asks plans to decompose into commits and flag test impact —
  Mode 1 is the enforcement of that).
- The `scalable-ts-review` harness will dispatch here when reviewing a branch;
  invoke it directly with a plan markdown to run Mode 1 pre-code.
