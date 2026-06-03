# Round 045 Verdict - Escalated Refactor Repeat

Task: repeat the Round 044 complexity class with a behavior-preserving
decomposition of `backend/src/kloel/unified-agent.service.ts` in two isolated
worktrees.

Atomic OS update under test:
`absolute_worktree_path_contract_plus_atomic_call_wrapper`.

## Result

Functional result: tie. Both lanes passed the external focused Jest suite,
backend typecheck, and diff check. Neither lane modified the protected spec.

Benchmark result: Atomic still did **not** beat normal by the required margin at
this escalated refactor tier. Atomic fixed the Round 044 wrong-root trace
contamination and produced the smaller service facade, but normal still won the
operational economy benchmarks.

## Validation

- Normal external Jest: `13/13` passed.
- Atomic external Jest: `13/13` passed.
- Normal backend typecheck: passed.
- Atomic backend typecheck: passed.
- Normal `git diff --check -- backend/src/kloel`: passed.
- Atomic `git diff --check -- backend/src/kloel`: passed.
- Spec diff: empty for both lanes.
- Protected diff: both lanes showed only `AGENTS.md`, already dirty at boot.

## Scorecard

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker internal duration | 474s | 575s | Normal |
| JSONL event rows | 112 | 180 | Normal |
| Completed commands | 42 | 74 | Normal |
| Unique completed commands | 38 | 65 | Normal |
| Failed command attempts | 0 | 2 | Normal |
| Input tokens | 1,692,185 | 5,167,577 | Normal |
| Output tokens | 23,503 | 33,010 | Normal |
| Reasoning tokens | 8,063 | 13,989 | Normal |
| Native file-change items | 4 | 0 | Atomic |
| MCP calls | 0 | 6 | Atomic |
| Worktree trace files | 0 | 14 | Atomic |
| Service line count | 345 | 197 | Atomic |
| Largest helper line count | 280 | 366 | Normal |
| External validation wall time | 53s | 52s | Atomic by 1s noise |

## Atomic Wins

- Smaller facade: `UnifiedAgentService` ended at `197` lines versus normal's
  `345`.
- Zero native `file_change` items; all Atomic code mutations flowed through
  atomic-edit MCP calls.
- `14` worktree trace files and no matching trace IDs in the coordinator
  checkout, proving the Round 044 wrong-root hazard was materially improved.
- Same functional validation result as normal.

## Normal Wins

- Lower wall-clock worker duration by `101s`.
- Fewer JSONL rows, completed commands, unique commands, and failed command
  attempts.
- Lower input tokens by `3,475,392`.
- Lower output tokens by `9,507`.
- Lower reasoning tokens by `5,926`.
- Smaller largest helper module (`280` lines versus Atomic's `366`).

## Formal Conclusion

Round 045 confirms that the absolute-path wrapper fixed the wrong-root trace
mistake, but it did not make Atomic dominate normal at the escalated refactor
tier. Atomic remains better on traceability, mutation governance, and facade
shrinkage; normal remains better on token economy, command economy, and worker
completion time.

Do not scale complexity further. Keep this same refactor class and update
Atomic OS before the next loop:

1. Make trace isolation a one-command helper instead of ad hoc shell.
2. Avoid `--help` probes failing as benchmark command failures.
3. Provide a compact extraction map in the Atomic prompt so the worker does not
   spend many reads rediscovering the same service anatomy.
4. Cap largest helper size as a first-class target, not only service size.
5. Preserve absolute worktree paths for every mutating MCP call.

## Tooling Update After Loss

Applied after measuring the round:

- `round-audit.cjs` now parses `*_exit` markers from the external validation
  logs, so Round 045 correctly reports `functionalPass=true`.
- `atomic-call.cjs --help` exits `0`, preventing a harmless help probe from
  counting as an Atomic failure in future rounds.
- `trace-isolation-check.cjs` was added to replace noisy shell trace checks with
  one deterministic helper that fails only when worker trace IDs also appear in
  the coordinator checkout.
