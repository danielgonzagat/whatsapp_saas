# Round 033 Verdict - Normal CLI vs Atomic OS

## Task

Both lanes started from the same base and fixed the same real `worker/**` ESLint debt:

- Baseline: 88 worker lint errors.
- Required validation: `lint:check`, `typecheck`, `git diff --check -- worker`, worker tests, worker build.
- Atomic OS update under test: direct stdio MCP invocation, no MCP discovery.

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
| Worker duration | 232s | 238s | Normal |
| JSONL rows | 90 | 72 | Atomic |
| Completed commands | 35 | 28 | Atomic |
| Unique completed commands | 30 | 23 | Atomic |
| First-class MCP calls observed | 0 | 0 | tie by parser |
| Atomic trace files | 0 | 24 | Atomic |
| Built-in file-change items | 1 | 0 | Atomic |
| Full-diff commands | 0 | 0 | tie |
| Worker name-only proof command | 1 | 0 | Atomic |
| MCP discovery commands | 0 | 0 | tie |
| Input tokens | 2,092,124 | 729,789 | Atomic |
| Output tokens | 9,223 | 6,321 | Atomic |
| Reasoning tokens | 4,646 | 2,880 | Atomic |

The direct-MCP prompt update worked on the intended axis: the Atomic lane did not run `codex mcp get`, `codex mcp --help`, `require.resolve`, or tool-listing scripts. It used the prescribed stdio MCP transaction and produced 24 traces.

### Diff And External Validation Surface

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker diff | 24 files, 246 insertions, 119 deletions | 24 files, 246 insertions, 119 deletions | tie |
| Raw changed lines | 365 | 365 | tie |
| External validation wall | 63s | 62s | Atomic |
| External test duration | 30.71s | 30.24s | Atomic |

## Wins

Normal won:

- Internal worker wall time by 6s.

Atomic won:

- Rows, completed commands, unique commands, and token volume.
- Input token volume by 1,362,335 tokens; Normal used about 2.87x Atomic's input tokens.
- Output token volume by 2,902 tokens.
- Reasoning token volume by 1,766 tokens.
- Trace evidence: 24 atomic traces versus none.
- No built-in file-change item.
- No worker name-only proof command.
- External validation wall by 1s.
- External test duration by 0.47s.

Ties:

- Functional result.
- Diff size.
- Full-diff avoidance.
- First-class MCP call count by parser, because the Atomic worker invoked MCP through a shell stdio client rather than Codex-native MCP event items.

## Formal Conclusion

Round 033 is a strong Atomic operational win, but it is **not eligible for complexity scaling**.

Atomic now beats Normal on almost every important efficiency and trust metric, but it still lost internal worker wall time by 6s and only tied diff size. The benchmark rule requires Atomic to beat Normal across all important measurable fronts with a large margin before increasing task complexity.

## Atomic OS Defeat To Fix

The remaining Atomic loss is not the edit operator. It is dependency/bootstrap overhead:

- The Atomic worker initially could not resolve `@modelcontextprotocol/sdk` from the isolated worktree.
- It ran root dependency commands before successfully invoking the direct MCP transaction.
- That bootstrap overhead likely explains the 6s internal wall-time loss despite much lower token/command volume.

## Atomic OS Update For Next Round

The next prompt/harness must:

- Use `createRequire('/Users/danielpenin/whatsapp_saas/package.json')` in the direct MCP snippet so the worker resolves the MCP SDK from the canonical repo dependency graph.
- If ESLint dependencies are missing, run `npm --prefix worker ci`, not root `npm ci`.
- Forbid root `npm ci` / root install commands in the Atomic lane unless both the canonical SDK require and worker package install fail.
- Keep the no-discovery rule from Round 033.

Next action: run Round 034 at the same complexity with canonical SDK resolution and worker-only dependency bootstrap.
