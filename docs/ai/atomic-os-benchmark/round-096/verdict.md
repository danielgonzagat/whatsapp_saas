# Round 096 OpenCode A/B Verdict

## Setup

- NORMAL worktree: `/private/tmp/kloel-ab096-normal-20260517202616`
- ATOMIC worktree: `/private/tmp/kloel-ab096-atomic-20260517202616`
- Target: `backend/src/kloel/unified-agent.service.ts`
- Helper target: `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- Task: repeat Round 095 difficulty with optional-deps normalization in the Atomic operator.

## Executive Result

ATOMIC wins functionally. Do not scale complexity yet.

The Atomic lane completed the task and passed the task-scoped acceptance gates. The Normal lane idled out without creating the helper or removing the private router cluster. Shape/churn metrics are marked `not_applicable` because comparing Atomic's completed product diff against Normal's no-op/stalled lane would be a false Normal win.

## Gates

- NORMAL: rejected. Lane `idle_timeout`; no helper file; private router methods remained; focused lint red; focused Jest passed only because the original behavior stayed intact; `typecheckKloelErrors=0` was shared-noise-only and not task completion.
- ATOMIC: accepted for this round. Lane `completed`; focused Jest/lint/diff/protected/suppression/helper/private scans passed; `typecheckKloelErrors=0`; `atomicModeClean=true`; 25 traces.

## Scorecard

| Metric | NORMAL | ATOMIC | Winner |
| --- | ---: | ---: | --- |
| Task functional pass | false | true | ATOMIC |
| Lane status | idle_timeout | completed | ATOMIC |
| Events | 17 | 3 | ATOMIC |
| First action | 22.124s | 5.336s | ATOMIC |
| Total agent time | 304.270s | 203.111s | ATOMIC |
| Commands | 1 | 1 | tie |
| Failed commands | 0 | 0 | tie |
| Input tokens | 69,937 | 61,120 | ATOMIC |
| Output tokens | 558 | 97 | ATOMIC |
| Reasoning tokens | 1,300 | 488 | ATOMIC |
| Traces | 0 | 25 | ATOMIC |
| Shape/churn | not applicable | not applicable | not comparable |

## What NORMAL Won

- Nothing accepted for the task. It only preserved the original file by failing to complete.

## What ATOMIC Won

- Completed the actual extraction.
- Fixed the Round 095 optional-deps type surface dynamically: the helper generated `riskGate: RiskGateService | undefined` and `agentRuntime: AgentRuntimeContextService | undefined` even though the prompt still contained optional `?` fields.
- Passed focused Jest, lint, diff-check, protected diff, suppression scan, helper no-`this`, private-method removal, residual-method preservation, and touched typecheck check.
- Won events, first action, total agent time, input/output/reasoning tokens, traces, lane completion, and atomic-only discipline.

## Atomic Defeats Formalized

- Shape/churn victory is not proven because Normal did not deliver a comparable implementation.
- `atomic_apply_eslint_dry_run_fixes` still reports noisy intermediate residue before later cleanup; the final state was green, but the operator report is harder to read than it should be.

## Atomic OS Update

- `round-audit.cjs` now marks shape/churn/touched-file winners as `not_applicable` unless both lanes are task-functional.
- The Round 095 `atomic-call.cjs` optional-deps normalization was validated in Round 096.

## Decision

Accepted as an Atomic functional win, but no complexity escalation yet. Repeat once more at the same difficulty in Round 097 to get either a comparable Normal baseline or a repeated Normal failure, then decide whether this tier is dominated enough to scale.

## Evidence

- `docs/ai/atomic-os-benchmark/round-096/audit.json`
- `docs/ai/atomic-os-benchmark/round-096/normal-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-096/atomic-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-096/opencode-watchdog-status.json`
- `docs/ai/atomic-os-benchmark/round-096/opencode-atomic-preprompt-output.log`
