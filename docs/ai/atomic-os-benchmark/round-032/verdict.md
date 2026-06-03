# Round 032 Verdict - Normal CLI vs Atomic OS

## Task

Both lanes started from the same base and fixed the same real `worker/**` ESLint debt:

- Baseline: 88 worker lint errors.
- Required validation: `lint:check`, `typecheck`, `git diff --check -- worker`, worker tests, worker build.
- Protected governance surfaces were checked by name-only diff; the pre-existing dirty `AGENTS.md` was not touched by either lane.

## Result

Both lanes completed the task and passed the full validation ladder.

### Functional Correctness

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| `lint:check` | pass | pass | tie |
| `typecheck` | pass | pass | tie |
| `git diff --check -- worker` | pass | pass | tie |
| Worker tests | 45 files / 431 tests passed | 45 files / 431 tests passed | tie |
| Worker build | pass | pass | tie |

### Operational Metrics

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker duration | 172s | 185s | Normal |
| JSONL rows | 71 | 68 | Atomic |
| Completed commands | 27 | 27 | tie |
| Unique completed commands | 22 | 24 | Normal |
| First-class MCP calls observed | 0 | 0 | tie by parser |
| Atomic trace files | 0 | 24 | Atomic |
| Built-in file-change items | 1 | 0 | Atomic |
| Full-diff commands | 0 | 0 | tie |
| Input tokens | 848,142 | 877,768 | Normal |
| Output tokens | 5,803 | 7,310 | Normal |
| Reasoning tokens | 2,482 | 3,924 | Normal |

The `completedMcpCalls=0` parser result is not proof that the Atomic lane avoided Atomic OS. It used the configured `atomic-edit` MCP through a shell Node client because first-class MCP tools were not mounted inside the Codex worker session. That preserved atomic writes and traces, but it cost extra discovery commands and tokens.

### Diff And Validation Surface

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker diff | 24 files, 251 insertions, 119 deletions | 24 files, 246 insertions, 119 deletions | Atomic |
| Raw changed lines | 370 | 365 | Atomic |
| External validation wall | 55s | 54s | Atomic |
| External test duration | 25.97s | 25.85s | Atomic |

## Wins

Normal won:

- Internal worker duration by 13s.
- Unique command count by 2.
- Input, output, and reasoning token volume.
- MCP zero-overhead in the literal parser sense.

Atomic won:

- Same functional result with 5 fewer raw changed lines.
- 24 trace artifacts for the atomic write transaction.
- No built-in file-change item.
- External validation wall by 1s.
- External worker test duration by 0.12s.
- Zero full-diff commands, matching Normal after prompt hardening.

## Formal Conclusion

Round 032 is **not eligible for complexity scaling**.

Atomic produced the cleaner code delta and slightly faster external validation, but it regressed in operational efficiency because the worker spent extra steps discovering and invoking MCP through shell instead of using a direct pre-specified Atomic OS call path. Under the benchmark standard, Atomic must beat Normal across the important measurable fronts with a large margin before complexity can increase. This round did not meet that bar.

## Atomic OS Update For Next Round

The next round must remove MCP-discovery overhead from the Atomic worker prompt:

- Do not run `codex mcp get`, `codex mcp --help`, `require.resolve` probes, or tool-listing scripts unless the direct MCP transaction fails.
- Provide the worker a direct one-shot MCP stdio invocation for `atomic_apply_eslint_dry_run_fixes`.
- Ban post-validation proof reads over changed code such as `nl`, `sed`, and `rg` unless a validation command fails.
- Keep proof to trace count, diff stat/shortstat, protected name-only diff, validation commands, and final status.

Next action: run Round 033 at the same complexity with the direct MCP invocation prompt.
