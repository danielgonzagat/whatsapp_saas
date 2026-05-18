# Round 044 Verdict - Escalated Refactor

Task: behavior-preserving decomposition of
`backend/src/kloel/unified-agent.service.ts` in isolated worktrees.

## Result

Functional result: tie. Both lanes passed the external focused Jest suite and
backend typecheck.

Benchmark result: Atomic did **not** beat normal by the required margin at this
complexity. Atomic won structural evidence and service shrinkage, but normal
won token economy, event volume, elapsed worker finish, and avoided the
wrong-root atomic path mistake.

## Evidence

Validation:

- Normal external Jest: `13/13` passed.
- Atomic external Jest: `13/13` passed.
- Normal external typecheck: passed.
- Atomic external typecheck: passed.
- Spec diff: empty for both lanes.
- Protected diff: both worktrees showed the same `AGENTS.md` memory-context
  line already dirty at boot; classify as harness/environment contamination,
  not a discriminating worker edit.

Measured deltas:

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Service lines | 347 | 254 | Atomic |
| New helper modules | 3 | 3 | Tie |
| Largest new touched helper | 259 | 384 | Normal |
| Event rows | 160 | 180 | Normal |
| Completed shell commands | 68 | 55 | Atomic |
| MCP trace calls | 0 | 26 | Atomic |
| Final input tokens | 4,518,651 | 5,909,657 | Normal |
| Final output tokens | 28,379 | 29,047 | Normal |
| Final reasoning tokens | 11,190 | 13,485 | Normal |
| Worker status | 0 | 0 | Tie |
| Main checkout side effects | none | 2 trace JSON files | Normal |

## Atomic Wins

- Smaller façade: `UnifiedAgentService` ended at `254` lines vs `347`.
- No native `file_change` items: all code writes flowed through MCP atomic
  tools.
- 16 worktree trace files and 26 completed MCP calls gave better operation
  provenance than the normal lane.
- Fewer shell commands than normal.

## Normal Wins

- Lower input tokens by `1,391,006`.
- Lower output tokens by `668`.
- Lower reasoning tokens by `2,295`.
- Fewer event rows by `20`.
- Finished its worker turn earlier.
- Avoided wrong-root side effects. Atomic initially created a file against the
  coordinator checkout with a relative path, deleted it, and left 2 trace JSON
  artifacts in the main checkout.
- Produced a smaller largest helper module (`259` lines vs `384`).

## Formal Conclusion

Round 044 is a controlled partial loss for Atomic OS after complexity scaling.
Atomic remained functionally correct and more traceable, but the operational
overhead and wrong-root path hazard mean it does not yet dominate the normal
CLI mode on complex behavior-preserving refactors.

Do not scale complexity further. Next loop must keep the same complexity class
and improve Atomic OS on:

1. Worktree-safe path discipline: no relative MCP path writes in benchmark
   workers.
2. Token budget: avoid reading long skill/governance files already summarized
   in the prompt.
3. Helper topology: preserve traceability without creating a larger extracted
   module than the normal lane.
4. Harness scoring: distinguish dirty protected state present at worker boot
   from protected files touched by the worker.

## Tooling Update After Loss

Added:

- `docs/ai/atomic-os-benchmark/tools/round-audit.cjs`: parses round JSONL and
  external validation logs into a structured scorecard.
- `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`: generic MCP client for
  benchmark workers that refuses relative `file`, `dir`, `cwd`, and
  `allowedPaths` arguments and rejects paths outside the current worktree.

Next atomic prompt must require either direct MCP calls with absolute worktree
paths or the `atomic-call.cjs` wrapper for every mutating atomic operation.
