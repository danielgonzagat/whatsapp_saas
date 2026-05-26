# Round 131 Verdict

## Status

- Verdict: no accepted final winner. Both lanes passed build-quality gates, but
  both failed the formal final contract used by this round.
- Complexity tier: seven-helper split of
  `backend/src/kloel/unified-agent.service.ts` with current-anchor macro facade
  compaction.
- Evidence level: N4 local A/B for measured gates and benchmarks; formal
  product-contract status remains rejected for this round.

## Functional Gates

- NORMAL: focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`,
  diff-check `0`, protected diff empty, suppression scan clean. Rejected by
  final extraction contract because `processMessage` orchestration stayed in
  `unified-agent.service.ts`: direct `chatCompletionWithFallback`,
  `recordAgentRuntimeTurn`, `buildUnifiedAgentCognitiveState`,
  `formatPromptValue`, `processUnifiedAgentToolCalls`, and
  `processUnifiedAgentPredecidedActions` remain in the service.
- ATOMIC: focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`,
  diff-check `0`, protected diff empty, suppression scan clean. Rejected by the
  round's literal final check because the incoming helper calls
  `processUnifiedAgentToolCalls(` and `processUnifiedAgentPredecidedActions(`
  without the exact `({` text shape.

## Benchmark Wins

- NORMAL wins:
  - Total Kloel helper surface: `1006` lines vs ATOMIC `1045`.
  - Source churn: `1101` vs ATOMIC `1534`.
  - Factory-mode contract purity: native tools are allowed in NORMAL.
- ATOMIC wins:
  - Agent time: `308.517s` vs NORMAL `1341.192s` (`77.0%` faster).
  - First action: `4.578s` vs `19.386s` (`76.4%` faster).
  - Event rows: `13` vs `185` (`93.0%` lower).
  - Commands: `1` vs `14` (`92.9%` lower).
  - Failed commands: `1` vs `5` (`80.0%` lower).
  - Input/output/reasoning tokens: `54086/738/506` vs
    `90137/20935/12904`.
  - Service facade compactness: `184` lines vs NORMAL `416`.
  - Traceability: `76` traces vs NORMAL `0`.

## Defeats To Absorb

- Final validation was too syntactic. It required `callee({` instead of the
  topological fact that the incoming helper owns the callee regardless of line
  break or argument formatting.
- ATOMIC became `atomicModeClean=false` after the preprompt failure because the
  fallback OpenCode agent used native `grep`/`glob`/`read` to inspect the failed
  state. Atomic-only must remain atomic-only even after failure.
- ATOMIC's current-anchor macro replacement reached the compact service facade,
  but at higher source churn and aggregate helper surface than NORMAL. The next
  operator needs less whole-file churn while preserving the same compact facade.

## Atomic OS Update

- Added `requiredRegexChecks` support to
  `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`.
- Prepared Round 132 with topology-aware final checks:
  `processUnifiedAgentToolCalls\\s*\\(` and
  `processUnifiedAgentPredecidedActions\\s*\\(`.
- Verified the new topology-aware contract against Round 131 results:
  ATOMIC passes the adjusted contract; NORMAL still fails because the incoming
  helper does not own the whole orchestration.

## Decision

- Do not scale complexity.
- Round 132 repeats the same tier with current-anchor macro compaction plus
  topology-aware final validation.
- Round 132 must also remove ATOMIC post-failure native inspection before the
  result can be considered zero-loss.
