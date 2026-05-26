# Round 038 Verdict

## Task

Same-tier preservation-topology worker test cleanup on three real files:

- `worker/test/channel-dispatcher.spec.ts`
- `worker/test/openai-models.spec.ts`
- `worker/test/opportunity-heuristic.spec.ts`

Required preserved anchors:

- `mailEnvBackup`
- `envBackup`
- `emptyDemographics`

Atomic OS update under test: `fast_path_atomic_prompt_reduce_reasoning`.

## Validation

Both variants completed successfully.

External validation, run after both workers completed:

- `(cd worker && npm exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts)`: pass on both
- `npm --prefix worker run typecheck`: pass on both
- `git diff --check -- worker/test/channel-dispatcher.spec.ts worker/test/openai-models.spec.ts worker/test/opportunity-heuristic.spec.ts`: pass on both
- `npm --prefix worker test -- test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts`: pass on both, `3` files / `57` tests
- `npm --prefix worker run build`: pass on both

## Result

Atomic wins this round by a large practical margin.

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker internal wall time | 172s | 116s | Atomic |
| JSONL event rows | 65 | 52 | Atomic |
| Completed commands | 23 | 20 | Atomic |
| Unique completed commands | 18 | 16 | Atomic |
| Input tokens | 1,162,404 | 758,493 | Atomic |
| Output tokens | 6,790 | 3,707 | Atomic |
| Reasoning tokens | 2,904 | 1,333 | Atomic |
| Target diff | 27 insertions / 15 deletions | 15 insertions / 6 deletions | Atomic |
| Full-diff commands | 0 | 0 | Tie |
| Proof code reads | 4 | 0 | Atomic |
| Atomic traces | 0 | 3 | Atomic |
| External validation wall time | 21s | 22s | Normal by 1s noise |
| Targeted test duration | 1.30s | 1.26s | Atomic |

## Formal Win/Loss

Normal wins:

- External validation wall clock by `1s`, treated as noise because both ran the same validation concurrently and the targeted test duration favored Atomic.

Atomic wins:

- Faster internal completion by `56s`.
- Smaller agent event surface by `13` rows.
- Fewer command executions.
- Lower input tokens by `403,911`.
- Lower output tokens by `3,083`.
- Lower reasoning tokens by `1,571`.
- Smaller target diff by `12` insertions and `9` deletions.
- Zero proof-oriented source reads after edit, because the trace carried preservation evidence.
- Three explicit atomic traces proving the intended preserved anchors.
- Same product validation result as normal.

## Conclusion

This is the first current same-tier topology round where Atomic beats Normal in every important measurable benchmark except one external wall-clock jitter point. The prior Round 037 still had a reasoning-token loss; the fast-path prompt update fixed that without losing validation quality.

Do not scale complexity yet under the strict loop rule. The next loop should confirm this win once more or pair it with a control-task rerun using the same fast-path prompt. If Atomic repeats this profile, the current complexity tier can be considered cleared and the benchmark can escalate.
