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

## What one iteration does

One iteration = fix ONE file completely, then commit or PR, then check
completion.

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
   - Backend file: `npm --prefix backend run typecheck && npm --prefix backend test -- --testPathPattern=<related> --runInBand`
   - Frontend file: `npm --prefix frontend run typecheck && npm --prefix frontend test -- --runTestsByPath <related>`
   - Worker file: `npm --prefix worker run typecheck && npm --prefix worker test`
   - Always: `npm run ratchet:check`

6. If green:
   - Non-sensitive: `git fetch origin main && git rebase origin/main && git add <file> && git commit -m "refactor(codacy): type debt in <path>" && git push`
   - Sensitive: `gh pr create --title "refactor(codacy): type debt in <path>" --body "Phase 3 Ralph iteration. Validation green." --label auto-merge`

7. If red: `git restore <file>`, append the file path to
   `/tmp/ralph-phase3-skipped.log` with the reason, continue to next file.

8. Every 10 successful iterations:
   - `npm run codacy:sync` (refresh `PULSE_CODACY_STATE.json` from live Codacy)
   - `npm run ratchet:update` (tighten ratchet floor)
   - Inspect `PULSE_CODACY_STATE.json.totalIssues`. If `≤ 11000`, output
     `<promise>PHASE_3_DONE</promise>` and exit.

## Conflict avoidance

Every iteration runs `git fetch origin main && git rebase origin/main`
**before** push. If a rebase conflict happens:

- If the conflict is in the file you just edited → auto-resolve (favor
  your version, then re-run the validation gate).
- If the conflict is elsewhere → `git rebase --abort`, `git stash`,
  `git pull --rebase`, `git stash pop`. If conflict still occurs →
  skip this iteration's file, log to `/tmp/ralph-phase3-skipped.log`,
  pick a different file.

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

If after 60 iterations the total is still > 13,000:

1. Write `docs/codacy/phase-3-interim-report.md` summarizing
   `/tmp/ralph-phase3-skipped.log`, the largest skipped files, and the
   remaining gap to target.
2. Commit and push the interim report.
3. Exit via max-iterations (do NOT output the completion promise).

The operator (Daniel) reviews the interim report and tackles the
largest skips manually before re-launching the loop.
