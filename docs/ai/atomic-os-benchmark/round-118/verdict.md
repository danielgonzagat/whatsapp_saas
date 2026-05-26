# Round 118 Verdict

Status: `accepted_strong_atomic_zero_loss_scale_next`

## Task

Repeat the four-helper split of `UnifiedAgentService` with the compact NORMAL
prompt and the Atomic shape budget recovered in Round 117.

## Result

- NORMAL: `completed`, focused Jest `13/13`, focused ESLint `0`, touched Kloel
  typecheck errors `0`, structural scans clean, protected diff empty.
- ATOMIC: `completed`, preprompt exit `0`, focused Jest `13/13`, focused
  ESLint `0`, touched Kloel typecheck errors `0`, structural scans clean,
  protected diff empty, `atomicModeClean=true`, and 46 isolated traces.
- Global backend typecheck remained red in both lanes only due shared non-Kloel
  noise; touched Kloel typecheck errors were `0` in both logs.

## Scorecard

| Metric | NORMAL | ATOMIC | Winner |
| --- | ---: | ---: | --- |
| Lane status | `completed` | `completed` | tie |
| First action | 17.856s | 5.054s | ATOMIC |
| Agent time | 1,019.334s | 202.582s | ATOMIC |
| Events | 154 | 3 | ATOMIC |
| Commands | 9 | 1 | ATOMIC |
| Failed commands | 3 | 0 | ATOMIC |
| Input tokens | 98.317 | 75.220 | ATOMIC |
| Output tokens | 15.017 | 106 | ATOMIC |
| Reasoning tokens | 11.616 | 245 | ATOMIC |
| Native file tool violations | allowed | 0 | ATOMIC |
| Traces | 0 | 46 | ATOMIC |
| Focused Jest | 13/13 | 13/13 | tie |
| Focused ESLint | pass | pass | tie |
| Service lines | 468 | 456 | ATOMIC |
| Total touched Kloel lines | 825 | 809 | ATOMIC |
| Source churn | 746 | 718 | ATOMIC |

## What NORMAL Beat

- Nothing material in this round. NORMAL completed and is accepted as a valid
  baseline, but it did not win any measured benchmark that matters here.

## What ATOMIC Beat

- Same functional gates with much lower operational surface.
- First action improved by 71.70%.
- Agent time improved by 80.13%.
- Event rows improved by 98.05%.
- Completed commands improved by 88.89%.
- Failed commands improved by 100%.
- Input tokens improved by 23.49%; output tokens by 99.29%; reasoning tokens
  by 97.89%.
- Service facade was 12 lines smaller.
- Total touched Kloel lines improved by 1.94%.
- Source churn improved by 3.75%.
- Produced 46 isolated traces with zero native file-tool violation in the
  ATOMIC lane.

## Atomic OS Update

- The compact parser/cognitive templates from Round 117 are now validated
  against a completed current NORMAL baseline.
- The shape budget (`<=817` touched Kloel lines and `<=730` source churn) is
  now not just a recovery guard; it produced a zero-loss comparable win.

## Decision

Accept Round 118 as a strong comparable ATOMIC zero-loss win for the four-helper
tier. Escalate one controlled step in Round 119; keep two OpenCode workers,
persistent worktrees, external validation logs, atomic-only enforcement and
shape/churn gates.
