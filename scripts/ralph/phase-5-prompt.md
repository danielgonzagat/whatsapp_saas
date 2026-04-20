# Phase 5 — Long Tail Ralph Loop

You are executing **Phase 5 of the Codacy convergence plan**, the long- tail
cleanup stage that comes after Phase 3 (type debt) and Phase 4 (security). Read
`/Users/danielpenin/.claude/plans/synthetic-whistling-meteor.md` for full
context on the very first iteration only.

## Goal

Reduce `ratchet.json:ratchet.codacy_total_issues_max` to **≤ 5,000** by cleaning
up complexity, unused code, performance lints, and residual formatting/density
issues.

You output `<promise>PHASE_5_DONE</promise>` (literally) when, and only when,
`PULSE_CODACY_STATE.json.totalIssues ≤ 5000`.

## What one iteration does

One iteration = fix ONE file completely, run validation, commit/PR, check
completion.

1. Read `PULSE_CODACY_STATE.json`. Sort `topFiles[]` by `count` desc.
2. Pick the first file whose path is NOT in the sensitive set (same list as
   Phase 3 — re-read `scripts/ralph/phase-3-prompt.md` if needed).
3. **Within the file, fix patterns in priority order**: a. Lizard complexity
   (`Lizard_*ccn*`, `Lizard_*nloc*`) — extract pure helpers, split long
   functions, reduce cyclomatic complexity below the threshold (8 by default for
   this repo). b. `Biome_lint_performance_noAwaitInLoops` — convert
   `for (...) { await x }` into `await Promise.all(items.map(x))` when the
   awaits are independent. **Leave sequential-dependent awaits alone** (don't
   break ordering). c. Residual `noUnusedImports` / `noUnusedVars` — delete or
   `_`-prefix. d. Residual formatting issues that Phase 2 missed (run
   `npx @biomejs/biome check --write` scoped to the single file).
4. Validate (every check must pass):
   - Backend file:
     `npm --prefix backend run typecheck && npm --prefix backend test -- --testPathPattern=<related>`
   - Frontend file:
     `npm --prefix frontend run typecheck && \  npm --prefix frontend test -- --runTestsByPath <related>`
   - Worker file:
     `npm --prefix worker run typecheck && npm --prefix worker test`
   - Always: `npm run ratchet:check`
5. If green:
   - Non-sensitive:
     `git fetch && git rebase origin/main && git add <file> && \  git commit -m "refactor(codacy): long-tail in <path>" && git push`
   - Sensitive:
     `gh pr create --label auto-merge \  --title "refactor(codacy): long-tail in <path>" \  --body "Phase 5 Ralph iteration. Validation green."`
6. If red: `git restore <file>`, append to `/tmp/ralph-phase5-skipped.log`,
   continue.
7. Every 10 iterations: `npm run codacy:sync && npm run ratchet:update`. Then
   check completion: if `totalIssues ≤ 5000`, output the promise.

## Hard rules — never violate

Same as Phase 3:

- Never force-push, never `--no-verify`.
- Never add suppression comments. Only real fixes.
- Never push directly to sensitive paths.
- Never increase any ratchet floor.
- Never delete tests; refactor them to keep coverage.
- Never modify `.codacy.yml`, `biome.json`, or `scripts/ralph/*` — those are out
  of scope for Phase 5.

Plus Phase 5-specific:

- When extracting helpers for complexity reduction, **never inline new helpers
  as anonymous functions** — they should be named and testable. Each extracted
  helper is a callable unit with a clear purpose.
- When converting `await`-in-loop to `Promise.all`, **always check for shared
  mutable state** between iterations. If any iteration writes to a closure
  variable that subsequent iterations read, the conversion changes semantics —
  leave it as a loop.

## Stop condition

Output `<promise>PHASE_5_DONE</promise>` only when a freshly-synced
`PULSE_CODACY_STATE.json.totalIssues ≤ 5000`.

## Failure mode

If after 100 iterations the total is still > 7,000:

1. Write `docs/codacy/phase-5-interim-report.md` with the gap and the skipped
   files list.
2. Commit and push.
3. Exit via max-iterations.

The operator can declare "good enough" at any point, run the final acceptance
checks from the plan file, tag the release, and skip the remaining target.
