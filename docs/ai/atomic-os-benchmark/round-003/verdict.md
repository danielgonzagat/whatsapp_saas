# Atomic OS A/B Benchmark - Round 003 Verdict

Date: 2026-05-16

## Mission

Same complexity as round 002. Both workers received the same real workspace
mission: fix `worker` lint debt from the same dirty branch snapshot, then prove
`worker` lint, typecheck, tests, and diff-check.

Complexity was not escalated because round 002 did not prove decisive Atomic OS
superiority.

## Workspaces

- Normal worker: `/private/tmp/kloel-ab3-normal-20260516145426`
- Atomic worker: `/private/tmp/kloel-ab3-atomic-20260516145426`
- Normal branch: `codex/ab3-normal-20260516145426`
- Atomic branch: `codex/ab3-atomic-20260516145426`

## Result

Atomic OS improved sharply versus round 002, but it still did not beat the
normal CLI path by a large margin. It completed the task correctly and reduced
the final diff surface, yet it remained slower and more expensive in tokens.

Verdict: **do not escalate task complexity yet**.

## Benchmarks

| Benchmark | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Completed mission | yes | yes | tie |
| Final lint | pass | pass | tie |
| Final typecheck | pass | pass | tie |
| Final tests | pass, 45 files / 431 tests | pass, 45 files / 431 tests | tie |
| Final diff-check | pass | pass | tie |
| Wall time | 447s | 473s | Normal |
| Event log lines | 68 | 98 | Normal |
| Command execution items | 52 | 50 | Atomic, slight |
| Completed command executions | 23 | 23 | tie |
| Input tokens | 1,054,608 | 2,368,516 | Normal |
| Cached input tokens | 992,768 | 2,219,392 | Normal |
| Output tokens | 6,349 | 8,774 | Normal |
| Reasoning tokens | 2,680 | 4,346 | Normal |
| Files changed | 24 | 24 | tie |
| Changed lines | 382 | 369 | Atomic |
| Insertions | 256 | 235 | Atomic |
| Deletions | 126 | 134 | Normal, slight |
| Diff hash | `eb55396ac847e22b67c1e7c00c5cc5893cea1725194c95695091d089188832f0` | `7530d88c249010adad97c0af8f38e89a3ee6b2032be0412a10e1ca9be903bb69` | different outputs |

## What Normal Won

- Wall-clock speed: 447s versus 473s.
- Token efficiency: Atomic used about 2.25x the input tokens, 1.38x the output
  tokens, and 1.62x the reasoning tokens.
- Log compactness: 68 event lines versus 98.
- Semantic quality on the three remaining `no-unused-vars` fixes: normal used
  the existing environment backup variables by adding `afterEach` restoration,
  preserving and completing an apparent test-isolation intent.
- No editor-tool defect appeared in the normal path.

## What Atomic Won

- Used the shared Atomic MCP write path for code changes.
- Completed the real mission after the round 002 tooling upgrade.
- Reduced final changed-line surface by 13 lines, from 382 to 369.
- Avoided direct `eslint --fix`, `apply_patch`, shell write scripts, and coarse
  code patching.
- Applied 85 ESLint dry-run fixes as one validated analyzer transaction through
  `atomic_apply_eslint_dry_run_fixes`.
- Produced a more auditable write story: one intent-level analyzer transaction
  plus focused atomic repairs.

## Atomic OS Defects Found

1. `atomic_edit_symbol(remove)` left a broken `const ;` residue while removing
   `mailEnvBackup` from `worker/test/channel-dispatcher.spec.ts`.
2. The Atomic path still spent too much token and event budget around a task
   where the new analyzer transaction should have made the workflow cheaper
   than normal.
3. Atomic minimized the diff, but the normal worker found a more behaviorally
   conservative fix for unused environment backup variables.

## Required Update Before Round 004

The loop must stay on this same task complexity until Atomic wins decisively.
The next Atomic OS update must at minimum:

- add a regression smoke for removing a `const` variable declaration without
  leaving syntactic residue;
- fix `atomic_edit_symbol(remove)` so variable declaration removal removes the
  complete declarator or declaration statement safely;
- preserve the Atomic doctrine: smallest faithful change, explicit topology,
  validation before persistence, trace, and product-facing proof.

Only after Atomic OS beats the normal CLI path with a large measured margin on
this same complexity should the loop escalate to a harder task.
