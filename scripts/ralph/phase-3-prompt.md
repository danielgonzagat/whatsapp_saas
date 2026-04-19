# Phase 3 — Type Debt Ralph Loop

You are executing **Phase 3 of the Codacy convergence plan**. Read
`/Users/danielpenin/.claude/plans/synthetic-whistling-meteor.md` for the
full context on the very first iteration only.

## Goal

Reduce `ratchet.json:ratchet.codacy_total_issues_max` to **≤ 11,000** by
eliminating type debt across the codebase, file by file, with full test
validation per iteration.

You output `<promise>PHASE_3_DONE</promise>` (literally) when, and only when,
`PULSE_CODACY_STATE.json.totalIssues ≤ 11000`. Do not output the promise on
any other condition.

## Big Tech quality standard — no gambiarra

This loop operates under the durable "no gambiarra / no shortcuts"
rule recorded in the user memory at
`feedback_no_gambiarra.md`. Reread the following before every
iteration:

- **Never skip a file** because the typecheck failed. Every file you
  pick up stays in WIP until it compiles, tests pass, and the type
  debt is replaced with real type narrowing. If a file proves hard,
  that means you need to understand it better — not skip it.
- **Never add suppression comments** (`eslint-disable`, `@ts-ignore`,
  `@ts-expect-error`, `// biome-ignore`, `codacy:disable`). Real type
  narrowing only.
- **Never use `as unknown as T`**, `as any`, `Record<string, any>`
  as a shortcut. If the real type is unknown, read the provider
  definition, introduce a proper `interface`, or extract a branded
  type — never a cast.
- **Never revert another contributor's improvement** to mute a
  symptom. Find the root cause and fix it there.
- **Never accept "stuck" as a steady state.** Every WRONG_RULE has a
  disable path (UI, API, coding-standard draft — see
  `docs/codacy/applied-overrides.md` for the proven recipe). Every
  type debt has a narrowing path.
- **Big Tech is OK with slow.** A correct fix in three iterations is
  better than a shortcut landing in one. If you are running out of
  runway, hand back with the exact current state and the proper path
  documented — never with a shortcut shipped.

If any iteration ever feels like a shortcut, ask yourself:
"Would a senior engineer at Stripe / Meta / Google ship this PR?"
If the answer is no, redo it properly even if it costs more
iterations.

## What one iteration does

One iteration = fix ONE file completely, then commit or PR, then check
completion. **There is no skip. Every file picked gets finished.**

1. Read `PULSE_CODACY_STATE.json`. Sort `topFiles[]` by `count` desc.
2. Pick the first file whose path is NOT in the sensitive set:
   - `backend/src/auth/`
   - `backend/src/billing/`
   - `backend/src/checkout/`
   - `backend/src/partnerships/`
   - `backend/src/affiliate/`
   - `backend/src/webhooks/`
   - `backend/src/kloel/wallet`
   - `backend/prisma/`
   - `frontend/src/app/api/auth/`
   - `frontend/src/app/api/kyc/`
   - `frontend/src/app/api/mercado-pago/`
   - `worker/processor.ts`

   If the topmost file IS sensitive, branch to
   `convergence/phase-3-sensitive/<slug>`, work there, open a PR with
   `gh pr create --label auto-merge`, then pick the next non-sensitive
   file for the next iteration. Sensitive scope still gets fixed, just
   via PR auto-merge instead of direct push.

3. Read the file. Identify every `any`, `as any`, `unknown` cast,
   no-unsafe-\* trigger, `strict-boolean-expressions` violation, and
   `prefer-nullish-coalescing` opportunity. Use `Read`, `Grep`, and
   the local `tsc` output to enumerate.

4. Refactor: introduce real types, narrow with type guards, remove
   casts. **Never** add `// eslint-disable-next-line`, `@ts-ignore`,
   `@ts-expect-error`, or `// biome-ignore`. Suppression is a project
   anti-pattern documented in CLAUDE.md. Only real type fixes count.

5. Validation gate (every step must pass before commit):
   - Backend file:
     `npm --prefix backend run typecheck && npm --prefix backend test -- --testPathPattern=<related> --runInBand && npm run backend:boot-smoke`
   - Frontend file:
     `npm --prefix frontend run typecheck && npm --prefix frontend test -- --runTestsByPath <related>`
   - Worker file: `npm --prefix worker run typecheck && npm --prefix worker test`
   - Always: `npm run ratchet:check`

6. If green:
   - Non-sensitive:
     `git fetch origin main && git rebase origin/main && git add <file> && git commit -m "refactor(codacy): type debt in <path>" && git push`
   - Sensitive:
     `gh pr create --title "refactor(codacy): type debt in <path>" --body "Phase 3 Ralph iteration. Validation green." --label auto-merge`

7. If red: **do NOT skip**. The iteration stays on the same file
   until it passes. Diagnose the root cause of each failure:
   - Typecheck error → read the error, find the real type (check
     Prisma models, `@prisma/client`, existing interfaces, library
     `.d.ts` files) and narrow for real. If the type is complex,
     extract an interface.
   - Test failure → read the test, understand what behavior it
     guards, and fix the refactor so the behavior is preserved.
     Never delete or silence a test.
   - Ratchet failure → identify which metric regressed and why your
     refactor caused it. Fix the refactor (or introduce the
     compensating improvement) rather than bumping the floor.
   - Rebase conflict → pull main, re-apply your change, rerun the
     validation gate.
   - Out-of-session-runway → commit WIP on a branch named
     `wip/phase-3/<file-slug>`, write a handover note in
     `docs/codacy/phase-3-handover.md` describing exactly where
     the refactor stands, and exit. The next session picks it up
     from the handover note. This is the ONLY acceptable "pause"
     — and it preserves the file's state, never skips it.

8. Every 10 successful iterations:
   - `npm run codacy:sync` (refresh `PULSE_CODACY_STATE.json` from live Codacy)
   - `npm run ratchet:update` (tighten ratchet floor)
   - Inspect `PULSE_CODACY_STATE.json.totalIssues`. If `≤ 11000`, output
     `<promise>PHASE_3_DONE</promise>` and exit.

## Conflict avoidance

Every iteration runs `git fetch origin main && git rebase origin/main`
**before** push. If a rebase conflict happens:

- If the conflict is in the file you just edited → resolve properly
  by re-reading the main version, understanding what the other
  change intended, and merging both — never just `--theirs` /
  `--ours`. Re-run the validation gate after the resolution.
- If the conflict is elsewhere → `git rebase --abort`, `git stash`,
  `git pull --rebase`, `git stash pop`, and re-apply your change on
  top of the new base. **Never skip** the file — the resolution is
  part of the iteration.

## Hard rules — never violate

- Never `git push --force`.
- Never `--no-verify`.
- Never add suppression comments (`eslint-disable`, `ts-ignore`,
  `biome-ignore`, `codacy:disable`).
- Never push directly to a sensitive path. Always branch + PR.
- Never increase any ratchet floor metric.
- Never modify `.codacy.yml`, `biome.json`, or
  `scripts/ops/codacy-discover-noise-patterns.mjs` — those are Phase 1
  artifacts and out of Phase 3 scope.
- Never delete tests. Refactor them if they break, but never delete to
  make a commit pass.

## Stop condition

Output `<promise>PHASE_3_DONE</promise>` when, and only when, a freshly
synced `PULSE_CODACY_STATE.json.totalIssues ≤ 11000`.

## Failure mode

If after 60 iterations the total is still > 13,000, it means each
iteration is making smaller deltas than projected (not that files are
being skipped — skipping is prohibited). In that case:

1. Write `docs/codacy/phase-3-interim-report.md` with:
   - Files completed and the per-file delta
   - The current top-N files and their projected delta
   - Root-cause analysis of why the delta-per-iteration is smaller
     than expected (are the issues we thought were type debt
     actually WRONG_RULE noise that should go through the Codacy
     coding-standard API instead? See Phase 1.5 for the recipe.)
   - Recommended next approach (finer-grained Ralph, different
     file selection heuristic, or Codacy API path for more noise)
2. Commit and push the interim report.
3. Exit via max-iterations (do NOT output the completion promise).

The operator (Daniel) reviews the interim report and decides whether
to re-launch Ralph with a tuned prompt, run the Codacy noise-disable
script for more patterns, or tackle specific files manually.
