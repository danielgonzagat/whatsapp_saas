# Round 042 Verdict

## Task

Same control task: repair real `worker/**` ESLint debt from the same base commit in two isolated Codex worktrees.

Atomic OS update under test: ultra-minimal Atomic prompt with one compact helper-driven command sequence and terse final report.

## Validation

Both variants completed successfully.

External validation, run after both workers completed:

- `npm --prefix worker run lint:check`: pass on both
- `npm --prefix worker run typecheck`: pass on both
- `git diff --check -- worker`: pass on both
- `npm --prefix worker test`: pass on both
- `npm --prefix worker run build`: pass on both

## Result

Atomic wins this round by a large margin across the previously failing token metric and almost every other benchmark.

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Relative finish | finished after Atomic | finished `62s` before Normal | Atomic |
| JSONL event rows | 53 | 10 | Atomic |
| Completed commands | 18 | 1 | Atomic |
| Unique completed commands | 17 | 1 | Atomic |
| Input tokens | 1,163,825 | 151,204 | Atomic |
| Output tokens | 5,355 | 1,637 | Atomic |
| Reasoning tokens | 2,492 | 1,102 | Atomic |
| Worker target diff | 235 insertions / 134 deletions | 246 insertions / 119 deletions | Atomic by total line churn and preservation |
| Full-diff commands | 0 | 0 | Tie |
| Proof code reads | 4 | 0 | Atomic |
| Atomic traces | 0 | 24 | Atomic |
| External validation wall time | 51s | 51s | Tie |
| External test duration | 24.37s | 24.81s | Normal by 0.44s noise |

## Preservation Topology

Normal deleted all three anchors:

- `mailEnvBackup`
- `envBackup`
- `emptyDemographics`

Atomic preserved and used all three:

- `mailEnvBackup`
- `envBackup`
- `emptyDemographics`

This is a decisive Atomic win under the original principle. Normal reached green by shrinking code surface and removing latent test-state anchors. Atomic reached green while preserving and proving those anchors.

## Formal Win/Loss

Normal wins:

- External test duration by `0.44s`, treated as noise because both external validations passed and wall time tied.

Atomic wins:

- Finished `62s` earlier in the worker logs.
- `43` fewer event rows.
- `17` fewer completed command events.
- `16` fewer unique command events.
- Lower input tokens by `1,012,621`.
- Lower output tokens by `3,718`.
- Lower reasoning tokens by `1,390`.
- Lower total worker line churn by `4` lines.
- Zero proof-oriented code reads.
- `24` explicit traces.
- Better preservation topology.
- Same validation result as Normal.

## Conclusion

This is the first control-task round where Atomic beats Normal on the previously failing input-token benchmark by a very large margin while also winning the practical engineering benchmarks.

Do not scale complexity yet from one control win alone. Next loop should repeat the same ultra-minimal Atomic setup once. If it repeats this profile, the current control tier is cleared and the benchmark can escalate complexity.
