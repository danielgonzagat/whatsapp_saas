# Round 039 Verdict

## Task

Control-task rerun at the current complexity tier: repair real `worker/**` ESLint debt from the same base commit in two isolated Codex worktrees.

Atomic OS update under test: `fast_path_control_prompt_reduce_reasoning`.

## Validation

Both variants completed successfully.

External validation, run after both workers completed:

- `npm --prefix worker run lint:check`: pass on both
- `npm --prefix worker run typecheck`: pass on both
- `git diff --check -- worker`: pass on both
- `npm --prefix worker test`: pass on both
- `npm --prefix worker run build`: pass on both

## Result

Atomic wins the quality and proof benchmark, but this round is not an absolute all-front win because Normal used fewer input tokens.

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker internal wall time | 182s | 180s | Atomic |
| JSONL event rows | 60 | 52 | Atomic |
| Completed commands | 22 | 20 | Atomic |
| Unique completed commands | 18 | 16 | Atomic |
| Input tokens | 648,547 | 854,369 | Normal |
| Output tokens | 4,642 | 4,000 | Atomic |
| Reasoning tokens | 1,996 | 1,856 | Atomic |
| Worker target diff | 235 insertions / 134 deletions | 246 insertions / 119 deletions | Atomic by total line churn |
| Full-diff commands | 0 | 0 | Tie |
| Proof code reads | 4 | 0 | Atomic |
| Atomic traces | 0 | 24 | Atomic |
| External validation wall time | 54s | 54s | Tie |
| External test duration | 23.28s | 23.00s | Atomic |

## Preservation Topology

Normal made the smaller-looking test cleanup by deleting three anchors:

- `mailEnvBackup`
- `envBackup`
- `emptyDemographics`

Atomic preserved those anchors and used them:

- `mailEnvBackup` is restored in `afterEach`.
- `envBackup` is restored in `afterEach`.
- `emptyDemographics` is asserted against the empty-message result.

This is a material product-quality win for Atomic under the original principle: it preserved existing semantic anchors and converted them into behavior proof instead of removing them to satisfy lint.

## Protected Surface Note

Both worktrees showed the same protected `AGENTS.md` one-line memory-context mutation:

- Normal: `1` insertion / `1` deletion
- Atomic: `1` insertion / `1` deletion

This appears to be Codex CLI context injection tied to the temporary worktree name, not task code behavior. It is still a harness contamination and should be excluded from the worker task diff while remaining explicitly reported.

## Formal Win/Loss

Normal wins:

- Lower input tokens by `205,822`.
- Fewer raw insertions, though total worker line churn was slightly higher.

Atomic wins:

- Internal time by `2s`.
- Fewer event rows.
- Fewer completed commands.
- Lower output tokens.
- Lower reasoning tokens.
- Slightly lower total worker line churn.
- Zero proof-oriented source reads after the edit.
- `24` explicit traces.
- Better preservation topology: anchors were used as behavior proof instead of deleted.
- Same validation result as Normal.

## Conclusion

Atomic is now beating Normal on behavior quality, traceability, command/event surface, output/reasoning tokens, and validation result at the current complexity tier. However, the loop must not scale complexity yet because Atomic still lost an important measurable benchmark: input tokens.

Next Atomic OS update: remove the long inline MCP client snippet from the prompt by introducing a reusable benchmark helper command. The goal is to keep the same Atomic MCP transaction while cutting prompt/input-token overhead.
