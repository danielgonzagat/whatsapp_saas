# Round 036 Verdict - Preservation Topology Task

## Task

Both lanes started from the same base and fixed only the real lint debt in three worker test files:

- `worker/test/channel-dispatcher.spec.ts`
- `worker/test/openai-models.spec.ts`
- `worker/test/opportunity-heuristic.spec.ts`

Preservation requirement:

- Keep `mailEnvBackup` and use it to restore mail env after each test.
- Keep `envBackup` and use it to restore `process.env` after each test.
- Keep `emptyDemographics` and assert it in the empty-message case.

## Result

Both lanes completed the task and passed targeted external validation.

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
| Worker duration | 223s | 224s | Normal by 1s |
| JSONL rows | 77 | 61 | Atomic |
| Completed commands | 28 | 24 | Atomic |
| Unique completed commands | 22 | 20 | Atomic |
| First-class MCP calls observed | 0 | 0 | tie by parser |
| Atomic trace files | 0 | 3 | Atomic |
| Built-in file-change items | 3 | 0 | Atomic |
| Full-diff commands | 1 | 0 | Atomic |
| Root install commands | 0 | 0 | tie |
| Worker install commands | 1 | 1 | tie |
| MCP discovery commands | 0 | 0 | tie |
| Proof code-read commands | 5 | 0 | Atomic |
| Input tokens | 1,497,001 | 1,235,914 | Atomic |
| Output tokens | 8,153 | 8,181 | Normal by 28 |
| Reasoning tokens | 3,781 | 4,534 | Normal |

### Diff And External Validation Surface

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Target diff | 3 files, 15 insertions, 6 deletions | 3 files, 15 insertions, 6 deletions | tie |
| Raw changed lines | 21 | 21 | tie |
| External validation wall | 25s | 25s | tie |
| External targeted test duration | 1.36s | 1.47s | Normal by 0.11s |

## Wins

Normal won:

- Internal wall time by 1s.
- Output tokens by 28.
- Reasoning tokens by 753.
- Single-run targeted test duration by 0.11s.

Atomic won:

- Rows, completed commands, and unique commands.
- Input tokens by 261,087.
- Trace evidence: 3 atomic traces.
- No built-in file-change items.
- No full-diff command.
- No proof code-read commands.
- Same preserved-anchor behavior as Normal with less read surface.

## Formal Conclusion

Round 036 is **not eligible for complexity scaling**.

Atomic preserved the required anchors and produced the same validated behavior with less operational/read surface, but the harness made the task noisier than intended:

- The prompt's lint command was cwd-sensitive.
- Both agents spent effort recovering from `npm --prefix worker exec` path/config behavior.
- Atomic used more reasoning than Normal and lost wall time by 1s.

This round is still useful: it proves the Atomic operator can preserve anchors on a topology-sensitive task, but it also exposes a harness defect that must be removed before the next comparison.

## Atomic OS / Harness Update For Next Round

The next prompt must use only the reliable targeted lint form:

```sh
(cd worker && npm exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts)
```

Changes for Round 037:

- Replace all targeted lint commands with the worker-cwd form above.
- Remove the root `npm --prefix worker exec -- eslint ...` validation variant.
- Keep the same direct Atomic MCP transaction.
- Keep the same preservation-topology task.

Next action: rerun this same topology task after fixing the harness so the comparison measures the editor/operator, not ESLint cwd recovery.
