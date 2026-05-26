# Round 132 Verdict — topology-aware seven-helper tier

## Decision

- Winner for functional contract: ATOMIC.
- Scaling decision: do not scale yet.
- Next round: repeat the same complexity after compacting successful
  preprompt output so the ATOMIC lane stops paying hidden input-token overhead.

## Gates

- NORMAL: lane completed exit `0`; focused Jest `13/13`, focused ESLint `0`,
  backend typecheck `0`, diff-check `0`, protected diff empty, helper/private
  scans clean.
- ATOMIC: lane completed exit `0`; focused Jest `13/13`, focused ESLint `0`,
  backend typecheck `0`, diff-check `0`, protected diff empty,
  suppression/helper/private scans clean, final topology-aware validation
  `0`, `atomicModeClean=true`, trace count `76`.

## Functional Result

- NORMAL failed the final topology-aware contract:
  - incoming helper did not own `chatCompletionWithFallback(`;
  - incoming helper did not own `recordAgentRuntimeTurn(`;
  - incoming helper did not call `processUnifiedAgentToolCalls(`;
  - incoming helper did not call `processUnifiedAgentPredecidedActions(`.
- ATOMIC passed the same final contract with `service_residue_status=1`.

## Benchmark Wins

- ATOMIC won wall time: `286.691s` vs `1261.358s` (`77.3%` lower).
- ATOMIC won first action: `4.869s` vs `19.244s` (`74.7%` lower).
- ATOMIC won event rows: `3` vs `95` (`96.8%` lower).
- ATOMIC won commands: `1` vs `11` (`90.9%` lower).
- ATOMIC won failed commands: `0` vs `5`.
- ATOMIC won output tokens: `315` vs `13999`.
- ATOMIC won reasoning tokens: `50` vs `20567`.
- ATOMIC won service facade: `184` vs `409` lines.
- ATOMIC won traceability: `76` vs `0`.

## Normal Wins / Atomic Debt

- NORMAL won input tokens: `73577` vs ATOMIC `145910`.
- NORMAL had lower total Kloel line surface: `961` vs ATOMIC `1045`, but its
  shape is not accepted because the functional contract failed.
- NORMAL had lower source churn: `1072` vs ATOMIC `1534`, also non-accepted
  because the final contract failed.

## Atomic OS Update

- `docs/ai/atomic-os-benchmark/tools/opencode-round-watchdog.cjs` now compacts
  successful preprompt output.
- The previous runner grepped raw JSON logs and could inject huge `atomicDiff`
  lines into the model context.
- The new success output reports only:
  - `ATOMIC_PREPROMPT_EXIT`;
  - `ATOMIC_PREPROMPT_OUTPUT_BYTES`;
  - `ATOMIC_PREPROMPT_VALIDATION=passed`;
  - `ATOMIC_PREPROMPT_TRACE_COUNT`;
  - a compact summary pointing to the on-disk audit log.
- Full preprompt logs remain on disk for audit; they are no longer fed to the
  worker model on successful runs.

## Evidence

- `docs/ai/atomic-os-benchmark/round-132/audit.json`
- `docs/ai/atomic-os-benchmark/round-132/normal-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-132/atomic-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-132/opencode-watchdog-status.json`
- `docs/ai/atomic-os-benchmark/tools/opencode-round-watchdog.cjs`
