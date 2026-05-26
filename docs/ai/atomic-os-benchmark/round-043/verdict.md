# Round 043 Verdict

## Task

Repeat of the Round 042 control task: repair real `worker/**` ESLint debt from
the same base commit in two isolated Codex worktrees.

Atomic OS update under test: same ultra-minimal Atomic prompt plus the
helper-driven trace path from Round 042. This round exists to confirm that the
Round 042 win was repeatable before increasing task complexity.

## Validation

Both variants completed successfully.

External validation, run after both workers completed:

- `npm --prefix worker run lint:check`: pass on both
- `npm --prefix worker run typecheck`: pass on both
- `git diff --check -- worker`: pass on both
- `npm --prefix worker test`: pass on both
- `npm --prefix worker run build`: pass on both

## Result

Atomic wins this repeat round by a large margin across the previously failing
token metric and across the practical execution metrics.

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Internal worker duration | 204s | 174s | Atomic |
| Finish time | 22:19:04 | 22:18:26 | Atomic |
| JSONL event rows | 70 | 40 | Atomic |
| Completed commands | 25 | 17 | Atomic |
| Unique completed commands | 21 | 15 | Atomic |
| Failed command attempts | 5 | 0 | Atomic |
| Agent messages | 14 | 2 | Atomic |
| Input tokens | 1,572,579 | 688,511 | Atomic |
| Output tokens | 6,102 | 2,424 | Atomic |
| Reasoning tokens | 2,503 | 1,091 | Atomic |
| Worker target diff | 235 insertions / 134 deletions | 246 insertions / 119 deletions | Atomic by total line churn and preservation |
| Full-diff commands | 0 | 0 | Tie |
| Proof code reads | 0 | 0 | Tie |
| Atomic traces | 0 | 24 | Atomic |
| External validation wall time | 57s | 57s | Tie |
| External test duration | 23.71s | 23.71s | Tie |

## Preservation Topology

Normal deleted all three tracked anchors:

- `mailEnvBackup`
- `envBackup`
- `emptyDemographics`

Atomic preserved and used all three tracked anchors:

- `mailEnvBackup`
- `envBackup`
- `emptyDemographics`

This is the second consecutive decisive Atomic win under the original principle.
Normal reached green by removing preservation anchors. Atomic reached the same
green validation state while preserving anchors and emitting a trace ledger.

## Formal Win/Loss

Normal wins:

- No material benchmark in this round.
- Normal had fewer insertions (`235` vs `246`), but this does not beat Atomic's
  lower total churn, fewer deletions, and better preservation topology.

Normal ties:

- External validation wall time.
- External test duration.
- Full-diff reads.
- Proof-oriented code reads.

Atomic wins:

- Finished `38s` earlier by wall clock and used `30s` less internal worker time.
- `30` fewer JSONL event rows.
- `8` fewer completed command events.
- `6` fewer unique commands.
- `5` fewer failed command attempts.
- `12` fewer agent-message events.
- Lower input tokens by `884,068`.
- Lower output tokens by `3,678`.
- Lower reasoning tokens by `1,412`.
- Lower total worker line churn by `4` changed lines.
- Fewer deletions by `15` lines.
- `24` explicit Atomic traces.
- Preserved all three tracked anchors that Normal deleted.
- Same external validation result as Normal.

## Conclusion

Round 043 confirms Round 042. Atomic has now beaten Normal twice in a row on the
control task, including the previously failing input-token benchmark, while
matching validation and improving preservation/trust evidence.

The current control tier is cleared. The next loop should escalate task
complexity instead of repeating this same lint-residue benchmark again.
