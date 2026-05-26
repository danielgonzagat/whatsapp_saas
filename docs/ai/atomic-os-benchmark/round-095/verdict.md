# Round 095 OpenCode A/B Verdict

## Setup

- NORMAL worktree: `/private/tmp/kloel-ab095-normal-20260517195614`
- ATOMIC worktree: `/private/tmp/kloel-ab095-atomic-20260517195614`
- Target: `backend/src/kloel/unified-agent.service.ts`
- Helper target: `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- Task: repeat Round 094 difficulty with newline-safe Atomic macro and compact dependency surface.

## Executive Result

No accepted winner. Do not scale complexity.

ATOMIC fixed the Round 094 escaped-newline failure and completed the lane with a much smaller operational surface, but it failed the in-scope typecheck impact. NORMAL produced the smaller final product shape but timed out and left focused lint red.

## Gates

- NORMAL: rejected. Jest focused passed, `typecheckKloelErrors=0`, diff-check passed, protected diff empty, helper had no `this.`, and private router methods were removed, but focused ESLint remained red at `unified-agent.service.ts:404`.
- ATOMIC: rejected. Lane completed, focused Jest/lint/diff/protected/suppression/router scans passed, `atomicModeClean=true`, and 25 traces were produced, but `typecheckKloelErrors=1` on `ExecuteToolActionDeps` under `exactOptionalPropertyTypes`.
- Global backend typecheck still had out-of-scope Google Ads/Prisma noise; this does not rescue the ATOMIC in-scope type error or NORMAL lint failure.

## Scorecard

| Metric | NORMAL | ATOMIC | Winner |
| --- | ---: | ---: | --- |
| Task functional pass | false | false | tie |
| Lane status | max_timeout | completed | ATOMIC |
| Events | 122 | 3 | ATOMIC |
| First action | 23.128s | 6.021s | ATOMIC |
| Total agent time | 900.791s | 192.132s | ATOMIC |
| Commands | 13 | 1 | ATOMIC |
| Failed commands | 2 | 0 | ATOMIC |
| Input tokens | 77,842 | 61,085 | ATOMIC |
| Output tokens | 10,124 | 178 | ATOMIC |
| Reasoning tokens | 11,733 | 356 | ATOMIC |
| Traces | 0 | 25 | ATOMIC |
| Service lines | 535 | 542 | NORMAL |
| Total Kloel lines | 767 | 777 | NORMAL |
| Source churn | 232 | 235 | NORMAL |

## What NORMAL Won

- Smaller service/helper/product source shape.
- Zero touched Kloel typecheck errors.
- Useful baseline implementation shape despite timeout.

## What ATOMIC Won

- Completed the lane while NORMAL hit `max_timeout`.
- Preserved atomic-only discipline: zero native file-tool violation, zero shell source read, zero worktree escape.
- Strongly won operational economy: events, commands, failed commands, total time, input/output/reasoning tokens.
- Produced 25 atomic traces and passed focused Jest, lint, diff, protected, suppression, helper, and private-method scans.

## Atomic Defeats Formalized

- The compact dependency property generated optional fields as `riskGate?:` and `agentRuntime?:` while the service assigned explicit `undefined`; this fails with `exactOptionalPropertyTypes`.
- The macro validation profile skipped full typecheck because global typecheck has known out-of-scope noise; the external auditor caught the touched error, but the macro should prevent this class earlier.
- Atomic still lost final shape/churn to NORMAL by 10 total Kloel lines.

## Atomic OS Update

- `round-audit.cjs` now parses external `== ... ==` validation sections, `*_done` markers, `touched_typecheck_error_count`, metadata keys `normal_worktree`/`atomic_worktree`, and worktree trace counts.
- `atomic-call.cjs` now dynamically converts optional dependency properties in `targetHeader` to `Type | undefined` when the same property is explicitly assigned from `this.<name>` in post-removal replacements. This is policy-derived, not hardcoded to `riskGate` or `agentRuntime`.

## Decision

Rejected Atomic win. Repeat the same difficulty in Round 096. Do not escalate until ATOMIC and NORMAL both reach task-functional gates and ATOMIC wins/equals the important shape metrics while preserving the operational margin.

## Evidence

- `docs/ai/atomic-os-benchmark/round-095/audit.json`
- `docs/ai/atomic-os-benchmark/round-095/normal-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-095/atomic-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-095/opencode-watchdog-status.json`
- `docs/ai/atomic-os-benchmark/round-095/opencode-atomic-preprompt-output.log`
