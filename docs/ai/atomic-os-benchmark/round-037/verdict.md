# Round 037 Verdict - Preservation Topology Task, Fixed Harness

## Task

Both lanes repeated the Round 036 preservation-topology task with the lint harness fixed to run from `worker` cwd:

- Preserve and use `mailEnvBackup`.
- Preserve and use `envBackup`.
- Preserve and assert `emptyDemographics`.
- Touch only the three target test files.

## Result

Both lanes completed the task and passed external validation.

### Functional Correctness

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Targeted lint | pass | pass | tie |
| `typecheck` | pass | pass | tie |
| `git diff --check` | pass | pass | tie |
| Targeted tests | 3 files / 57 tests passed | 3 files / 57 tests passed | tie |
| Worker build | pass | pass | tie |
| External validation status | 0 | 0 | tie |
| Preservation anchors | preserved | preserved | tie |

### Operational Metrics

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker duration | 138s | 110s | Atomic |
| JSONL rows | 72 | 52 | Atomic |
| Completed commands | 28 | 19 | Atomic |
| Unique completed commands | 24 | 15 | Atomic |
| First-class MCP calls observed | 0 | 0 | tie by parser |
| Atomic trace files | 0 | 3 | Atomic |
| Built-in file-change items | 1 | 0 | Atomic |
| Full-diff commands | 1 | 0 | Atomic |
| Worker install commands | 1 | 1 | tie |
| MCP discovery commands | 0 | 0 | tie |
| Proof code-read commands | 7 | 0 | Atomic |
| Input tokens | 1,224,442 | 452,793 | Atomic |
| Output tokens | 5,878 | 5,323 | Atomic |
| Reasoning tokens | 1,935 | 2,643 | Normal |

### Diff And External Validation Surface

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Target diff | 3 files, 21 insertions, 6 deletions | 3 files, 15 insertions, 6 deletions | Atomic |
| Raw changed lines | 27 | 21 | Atomic |
| External validation wall | 21s | 20s | Atomic |
| External targeted test duration | 1.24s | 1.19s | Atomic |

## Wins

Normal won:

- Reasoning tokens by 708.

Atomic won:

- Internal wall time by 28s.
- Rows by 20.
- Completed commands by 9.
- Unique commands by 9.
- Input tokens by 771,649.
- Output tokens by 555.
- Diff size by 6 raw changed lines.
- External validation wall by 1s.
- External targeted test duration by 0.05s.
- Trace evidence: 3 atomic traces.
- No built-in file-change items.
- No full-diff command.
- No proof code-read commands.

## Formal Conclusion

Round 037 is a strong Atomic win on the preservation-topology task, but it is **not eligible for complexity scaling** under the strict loop rule.

Atomic now wins the meaningful product, edit, trust, and operational surfaces for this same-tier task. The remaining measurable loss is reasoning-token volume. The Atomic prompt is still heavier than it needs to be, so the next loop should optimize the Atomic lane prompt into a fast-path executor.

## Atomic OS Update For Next Round

Round 038 should keep the same topology task but shrink the Atomic prompt:

- Remove explanatory doctrine from the worker prompt.
- Keep only hard constraints, exact commands, exact direct MCP snippet, and exact report requirements.
- Add explicit instruction: do not analyze alternatives unless a command fails; execute the prescribed path.

Next action: rerun the same topology task with the fast-path Atomic prompt. If Atomic wins reasoning too while preserving all current wins, this same-tier task is cleared.
