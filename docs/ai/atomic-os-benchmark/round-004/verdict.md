# Atomic OS A/B Benchmark - Round 004 Verdict

Date: 2026-05-16

## Mission

Same complexity as round 003. Both workers received the same real workspace
mission: fix `worker` lint debt from the same checkout baseline, then prove
`worker` lint, typecheck, tests, and diff-check.

Complexity was not escalated because round 003 did not prove decisive Atomic OS
superiority.

## Workspaces

- Normal worker: `/private/tmp/kloel-ab4-normal-20260516151313`
- Atomic worker: `/private/tmp/kloel-ab4-atomic-20260516151313`
- Normal branch: `codex/ab4-normal-20260516151313`
- Atomic branch: `codex/ab4-atomic-20260516151313`

## Result

Atomic OS completed the mission and produced a more semantically conservative
test cleanup than normal, but it still lost materially on speed and token cost.

Verdict: **do not escalate task complexity yet**.

## Benchmarks

| Benchmark | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Completed mission | yes | yes | tie |
| Final lint | pass | pass | tie |
| Final typecheck | pass | pass | tie |
| Final tests | pass, 45 files / 431 tests | pass, 45 files / 431 tests | tie |
| Final diff-check | pass | pass | tie |
| Worker wall time | 121s | 246s | Normal |
| Event log lines | 72 | 102 | Normal |
| JSON event lines | 70 | 100 | Normal |
| Command execution items | 54 | 46 | Atomic |
| Completed command executions | 25 | 21 | Atomic |
| MCP tool calls | 0 | 40 | expected Atomic cost |
| Input tokens | 580,495 | 1,642,036 | Normal |
| Cached input tokens | 494,720 | 1,541,632 | Normal |
| Output tokens | 7,435 | 10,451 | Normal |
| Reasoning tokens | 4,116 | 5,898 | Normal |
| Files changed | 24 | 24 | tie |
| Changed lines | 369 | 376 | Normal |
| Insertions | 235 | 250 | Normal |
| Deletions | 134 | 126 | Atomic, slight |
| External worker test duration | 21.14s | 21.16s | tie/noise |
| Diff hash | `7530d88c249010adad97c0af8f38e89a3ee6b2032be0412a10e1ca9be903bb69` | `c421a233465c3b42cde30cc9801ec36d0f44808f1bc2db22d38f0cc914a3c198` | different outputs |

## What Normal Won

- Speed: 121s versus 246s. Normal was about 2.03x faster.
- Token cost: Atomic used about 2.83x input tokens, 1.41x output tokens, and
  1.43x reasoning tokens.
- Diff surface: normal changed 369 lines versus Atomic 376.
- Event compactness: 72 lines versus Atomic's 102.

## What Atomic Won

- Code writes stayed inside the shared Atomic MCP path.
- It completed the mission with lint, typecheck, tests, and diff-check passing.
- It avoided direct `eslint --fix`, `apply_patch`, shell write scripts, and
  coarse code writes.
- It preserved the existing environment backup intent in
  `channel-dispatcher.spec.ts` and `openai-models.spec.ts` by adding
  `afterEach` restoration, whereas normal removed those backups.
- It used an analyzer transaction for the broad ESLint fixes and focused atomic
  edits for the remaining cleanup.
- The round 003 `atomic_edit_symbol(remove)` defect did not recur.

## Ties

- Both workers finished all required package gates.
- Both touched 24 `worker/**` files.
- Neither worker edited protected files; both inherited the same pre-existing
  dirty `AGENTS.md` baseline.
- External coordinator verification passed for both worktrees:
  `lint:check`, `typecheck`, `worker test`, and `git diff --check -- worker`.

## Atomic OS Defects / Gaps Found

1. Relative MCP reads still resolve against the global MCP server root, not the
   isolated benchmark worktree. The Atomic worker detected this and switched to
   absolute paths, but the discovery cost is avoidable.
2. The worker duplicated several atomic operations as `preview:true` followed by
   apply. Preview is useful when unsure, but defaulting to preview+apply wastes
   tool calls and tokens when the operation is already exact and validated.
3. Atomic produced a better semantic test cleanup, but paid too much for it.

## Required Update Before Round 005

The loop must stay on this same task complexity until Atomic wins decisively.
The next Atomic OS update must at minimum:

- make worktree targeting harder to misuse, especially for relative
  `code_outline` / `code_read_symbol` in linked worktrees;
- reduce unnecessary preview+apply duplication in tool descriptions or workflow
  guidance;
- keep the semantic win from this round: prefer using preserved test fixtures
  when they express state-restoration intent, not deleting them just to satisfy
  lint.

Only after Atomic OS beats the normal CLI path with a large measured margin on
this same complexity should the loop escalate to a harder task.
