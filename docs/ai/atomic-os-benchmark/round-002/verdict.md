# Atomic OS Benchmark - Round 002 Verdict

## Mission

Two Codex workers were launched simultaneously against the same real repo
problem in isolated worktrees:

- Normal worker: `/private/tmp/kloel-ab2-normal-20260516142852`
- Atomic worker: `/private/tmp/kloel-ab2-atomic-20260516142852`

Mission:

```sh
npm --prefix worker run lint:check
```

Baseline: `88` worker lint errors.

## Result

Atomic recovered from the Round 001 worktree-routing failure and completed the
mission. Normal still won Round 002 on practical efficiency.

Both workers produced the same worker diff and passed the same validation gates.
The measured gap moved from "atomic cannot safely target the worker worktree" to
"atomic can complete, but requires much more agent/tool overhead for a
mechanical lint intention."

## Scorecard

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Mission completed | yes | yes | tie |
| Final lint | pass | pass | tie |
| Final typecheck | pass | pass | tie |
| Final worker tests | pass, 45 files / 431 tests | pass, 45 files / 431 tests | tie |
| Worker diff hash | `7530d88c249010adad97c0af8f38e89a3ee6b2032be0412a10e1ca9be903bb69` | `7530d88c249010adad97c0af8f38e89a3ee6b2032be0412a10e1ca9be903bb69` | tie |
| Worker files changed | 24 | 24 | tie |
| Worker changed lines | 235 insertions / 134 deletions | 235 insertions / 134 deletions | tie |
| Wall time | 168s | 613s | Normal |
| Event log lines | 82 | 245 | Normal |
| Command execution items | 58 | 116 | Normal |
| Input tokens | 1,635,992 | 12,868,849 | Normal |
| Output tokens | 6,666 | 26,476 | Normal |
| Reasoning tokens | 2,443 | 7,426 | Normal |
| Coarse code editor use | yes, `eslint --fix` + `apply_patch` | no | Atomic |
| Atomic ambiguity refusal | no | yes, 1 refused no-write attempt | Atomic |
| Worktree target correctness | correct | correct | tie |
| Protected files touched by worker | no | no | tie |

## Formal Distance

- Speed: normal was `613 / 168 = 3.65x` faster.
- Event surface: atomic emitted `245 / 82 = 2.99x` more event lines.
- Command surface: atomic used `116 / 58 = 2.00x` more command execution items.
- Input-token surface: atomic used `12,868,849 / 1,635,992 = 7.87x` more input
  tokens.
- Output-token surface: atomic used `26,476 / 6,666 = 3.97x` more output tokens.
- Reasoning-token surface: atomic used `7,426 / 2,443 = 3.04x` more reasoning
  tokens.
- Diff equivalence: worker diffs were byte-identical by SHA-256, so the quality
  result was equal for this mission.

## What Normal Wins

- Speed to green.
- Lower token cost.
- Lower event and command volume.
- Better throughput for broad mechanical lint cleanup.
- Fewer agent decision points.

## What Atomic Wins

- No coarse direct code write by formatter, linter, `apply_patch`, `sed`,
  `python`, or `node`.
- Ambiguous mutation was refused before writing.
- Multi-worktree routing defect from Round 001 was fixed and verified by this
  live worker run.
- Final worker diff matched normal while preserving atomic-only discipline.

## Principle Gap

Under the Atomic Product-Oriented Action Principle, this is not enough.

Atomic did not yet represent the user/product intention as a high-level,
verifiable operation. It decomposed "make worker lint pass" into `52`
`atomic_replace_text` calls. That preserved write safety, but it did not
preserve intention atomicity, topology-aware proof, or non-technical trust well
enough.

Missing capabilities exposed by Round 002:

- A lint intention should become one guarded transaction with a plan, not dozens
  of unrelated text replacements.
- Tool traces should classify preservation topology: preserved key, modified
  value, added wrapper, removed unused declaration, list item inserted, body
  preserved, signature changed, and similar zones.
- The report should show which surfaces were behavior-preserving and which
  changed contracts or runtime behavior.
- Atomic should expose the smallest sufficient trust surface for a non-technical
  human: what behavior was affected, what was preserved, what was validated, and
  where to test the result.
- Atomic should be able to use external analyzers in read-only or dry-run mode
  and then commit the exact suggested ranges through atomic validation.

## Atomic OS Defect Opened

Atomic needs an intent-level batch operator for analyzer-proposed fixes:

- Input: command, working root, target paths, expected changed paths, protected
  path policy, and optional validation commands.
- Analyzer execution must be non-mutating, for example `eslint --fix-dry-run`
  rather than `eslint --fix`.
- Each proposed file rewrite must be normalized into a transaction with
  before/after hashes, changed ranges, preservation map, and inline preview.
- Writes must still be atomic, governance guarded, and syntax validated.
- The final result must include one consolidated trace: intention, modified
  zones, preserved zones, refused zones, validations, and product-facing proof.

## Loop Decision

Round 003 should not merely repeat Round 002. The next Atomic OS update must add
a higher-level verified analyzer-fix transaction so the atomic worker can
express this class of task as one product/intention operation instead of a long
manual chain of text replacements.
