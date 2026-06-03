# Round 035 Verdict - Normal CLI vs Atomic OS

## Task

Both lanes started from the same base and fixed the same real `worker/**` ESLint debt:

- Baseline: 88 worker lint errors.
- Required validation: `lint:check`, `typecheck`, `git diff --check -- worker`, worker tests, worker build.
- External timing protocol: when only test timing remained ambiguous, two extra paired `worker test` samples were collected and compared by median.

## Result

Both lanes completed the task and passed the full validation ladder, including external validation.

### Functional Correctness

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| `lint:check` | pass | pass | tie |
| `typecheck` | pass | pass | tie |
| `git diff --check -- worker` | pass | pass | tie |
| Worker tests | 45 files / 431 tests passed | 45 files / 431 tests passed | tie |
| Worker build | pass | pass | tie |
| External validation status | 0 | 0 | tie |

### Operational Metrics

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker duration | 286s | 232s | Atomic |
| JSONL rows | 109 | 52 | Atomic |
| Completed commands | 41 | 19 | Atomic |
| Unique completed commands | 37 | 15 | Atomic |
| First-class MCP calls observed | 0 | 0 | tie by parser |
| Atomic trace files | 0 | 24 | Atomic |
| Built-in file-change items | 1 | 0 | Atomic |
| Full-diff commands | 1 | 0 | Atomic |
| Root install commands | 0 | 0 | tie |
| Worker install commands | 1 | 1 | tie |
| MCP discovery commands | 0 | 0 | tie |
| Proof code-read commands | 12 | 0 | Atomic |
| Input tokens | 1,739,625 | 637,687 | Atomic |
| Output tokens | 8,295 | 5,117 | Atomic |
| Reasoning tokens | 3,455 | 2,444 | Atomic |

### Diff And External Validation Surface

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker diff | 24 files, 246 insertions, 119 deletions | 24 files, 246 insertions, 119 deletions | tie |
| Raw changed lines | 365 | 365 | tie |
| External validation wall | 66s | 66s | tie |
| External test sample 1 | 30.03s | 30.13s | Normal by 0.10s |
| External test sample 2 | 25.30s | 25.17s | Atomic by 0.13s |
| External test sample 3 | 22.83s | 23.39s | Normal by 0.56s |
| External test median | 25.30s | 25.17s | Atomic by 0.13s |

The external test timing spread is runtime noise: the median difference is 0.13s, about 0.5%. Under the Round 034 harness update, deltas under 2% are treated as timing ties unless repeated evidence shows a stable product/runtime advantage.

## Wins

Normal won:

- No important benchmark dimension by a material margin.
- It had two individual test-duration sample wins, but the median was slightly Atomic and all sample deltas were below the 2% noise threshold.

Atomic won:

- Internal worker wall time by 54s.
- Rows by 57.
- Completed commands by 22.
- Unique commands by 22.
- Input token volume by 1,101,938 tokens; Normal used about 2.73x Atomic's input tokens.
- Output token volume by 3,178 tokens.
- Reasoning token volume by 1,011 tokens.
- Trace evidence: 24 atomic traces versus none.
- No built-in file-change item.
- No full-diff command.
- No proof code-read commands.
- External test median by 0.13s, within tie/noise threshold.

## Formal Conclusion

Round 035 confirms that Atomic is now beating Normal at this task complexity across the important agent-operation benchmarks with large margins.

However, this round is still **not enough by itself to scale complexity** under the user's strict standard, because two important surfaces are still ties rather than large Atomic wins:

- The final code diff size tied exactly.
- External product/runtime validation tied within noise.

This is not a functional weakness. It means both lanes produced the same validated product behavior, while Atomic used far less operational surface to get there. For the loop's formal escalation gate, we need one more repeated round or a benchmark class where the code-change topology exposes Atomic's preservation advantage beyond operational efficiency.

## Atomic OS Update For Next Round

The Atomic prompt and direct MCP invocation are now stable. The next update is to the benchmark portfolio, not the current MCP operator:

- Keep this task as the regression control.
- Add a second same-complexity task class that stresses preservation topology: property/value anchoring, env restoration, wrapper preservation, or symbol-level change.
- Do not scale to higher complexity yet; first prove Atomic wins both the control task and a topology-sensitive task at the same complexity tier.

Next action: run the next same-tier A/B task focused on preservation topology, with both workers still isolated and simultaneous.
