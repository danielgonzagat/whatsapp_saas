# Round 040 Verdict

## Task

Same control task as Round 039: repair real `worker/**` ESLint debt from the same base commit in two isolated Codex worktrees.

Atomic OS update under test: reusable helper command at `docs/ai/atomic-os-benchmark/tools/atomic-eslint-fix.cjs`.

## Validation

Both variants completed successfully.

External validation, run after both workers completed:

- `npm --prefix worker run lint:check`: pass on both
- `npm --prefix worker run typecheck`: pass on both
- `git diff --check -- worker`: pass on both
- `npm --prefix worker test`: pass on both
- `npm --prefix worker run build`: pass on both

## Result

Atomic improved the command surface but did not fix the input-token loss. No complexity escalation.

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker internal wall time | 177s | 170s | Atomic |
| JSONL event rows | 61 | 49 | Atomic |
| Completed commands | 23 | 19 | Atomic |
| Unique completed commands | 19 | 15 | Atomic |
| Input tokens | 696,994 | 1,529,219 | Normal |
| Output tokens | 5,598 | 3,663 | Atomic |
| Reasoning tokens | 2,949 | 1,268 | Atomic |
| Worker target diff | 245 insertions / 126 deletions | 246 insertions / 119 deletions | Atomic by total line churn |
| Full-diff commands | 0 | 0 | Tie |
| Proof code reads | 4 | 0 | Atomic |
| Atomic traces | 0 | 24 | Atomic |
| External validation wall time | 48s | 49s | Normal by 1s noise |
| External test duration | 23.87s | 23.95s | Normal by 0.08s noise |

## Preservation Topology

Normal preserved and used:

- `mailEnvBackup`
- `envBackup`

Normal deleted:

- `emptyDemographics`

Atomic preserved and used all three:

- `mailEnvBackup`
- `envBackup`
- `emptyDemographics`

Atomic still wins the preservation topology benchmark, but the gap narrowed because Normal improved versus Round 039.

## Input Token Diagnosis

The helper shortened the prompt and command surface, but the raw Codex usage still reported a larger input-token count for Atomic.

Largest command-output surfaces were effectively identical:

- Normal test output: `81,257` chars
- Atomic test output: `81,186` chars
- Normal initial lint output: `10,410` chars
- Atomic initial lint output: `10,410` chars

So the Round 040 input-token loss is not explained by helper stdout or validation output. The next fix should remove the duplicate initial lint emission from the Atomic path entirely: let the Atomic helper perform detection and fixing, then rely on post-change validation for proof.

## Formal Win/Loss

Normal wins:

- Lower input tokens by `832,225`.
- Slightly faster external wall time and test duration, both within noise.

Atomic wins:

- Internal time by `7s`.
- Fewer event rows.
- Fewer completed commands.
- Fewer unique commands.
- Lower output tokens.
- Lower reasoning tokens.
- Slightly lower total worker line churn.
- Zero proof-oriented source reads after the edit.
- `24` explicit traces.
- Better preservation topology.
- Same validation result as Normal.

## Conclusion

Atomic is operationally better in almost every practical dimension, but the strict loop still cannot scale complexity because input tokens remain a clear Normal win.

Next Atomic OS update: make the Atomic control path tool-first instead of lint-first. The Atomic worker should install worker dependencies, run the helper, then validate. That removes the initial full lint dump from the Atomic context while preserving behavior proof through post-change lint/typecheck/tests/build.
