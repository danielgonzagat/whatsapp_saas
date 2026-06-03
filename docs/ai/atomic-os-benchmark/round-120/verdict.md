# Round 120 Verdict

Status: `accepted_strong_atomic_zero_loss_scale_next`

## Task

Repeat the five-helper `UnifiedAgentService` split from Round 119 after
compacting the Atomic incoming-message helper and minifying the Atomic prompt
surface. Do not increase task complexity yet.

## Result

- NORMAL: `completed`, focused Jest `13/13`, focused ESLint `0`, touched Kloel
  typecheck errors `0`, structural scans clean, protected diff empty.
- ATOMIC: `completed`, preprompt exit `0`, focused Jest `13/13`, focused
  ESLint `0`, touched Kloel typecheck errors `0`, structural scans clean,
  protected diff empty, `atomicModeClean=true`, and 49 isolated traces.
- Global backend typecheck remained red in both lanes only due shared non-Kloel
  Google Ads / Prisma noise; touched Kloel typecheck errors were `0` in both
  logs.

## Scorecard

| Metric | NORMAL | ATOMIC | Winner |
| --- | ---: | ---: | --- |
| Lane status | `completed` | `completed` | tie |
| First action | 20.135s | 4.661s | ATOMIC |
| Agent time | 1,006.407s | 238.694s | ATOMIC |
| Events | 125 | 3 | ATOMIC |
| Commands | 13 | 1 | ATOMIC |
| Failed commands | 4 | 0 | ATOMIC |
| Input tokens | 82.678 | 80.154 | ATOMIC |
| Output tokens | 14.699 | 142 | ATOMIC |
| Reasoning tokens | 9.557 | 391 | ATOMIC |
| Native file tool violations | allowed | 0 | ATOMIC |
| Traces | 0 | 49 | ATOMIC |
| Focused Jest | 13/13 | 13/13 | tie |
| Focused ESLint | pass | pass | tie |
| Service lines | 464 | 438 | ATOMIC |
| Total touched Kloel lines | 871 | 844 | ATOMIC |
| Source churn | 820 | 793 | ATOMIC |

## What NORMAL Beat

- Nothing material in this round. NORMAL completed and is accepted as a valid
  baseline, but it did not win any measured benchmark that matters here.

## What ATOMIC Beat

- Same focused functional gates with lower operational and product surface.
- First action improved by 76.85%.
- Agent time improved by 76.28%.
- Event rows improved by 97.60%.
- Completed commands improved by 92.31%.
- Failed commands improved by 100%.
- Input tokens improved by 3.05%; output tokens by 99.03%; reasoning tokens by
  95.91%.
- Service facade was 26 lines smaller.
- Total touched Kloel lines improved by 27 lines.
- Source churn improved by 27 lines.
- Produced 49 isolated traces with zero native file-tool violation in the
  ATOMIC lane.

## Atomic OS Update

- The Round 119 losses were closed:
  - prompt surface was reduced from 5.845 bytes to 603 bytes;
  - incoming helper budget passed at 53 lines;
  - macro validation passed `844/846` total lines and `793/798` source churn.
- The compiled fast-path now stores the large macro in `atomic-fastpath.sh` and
  keeps the OpenCode prompt small, preserving atomic-only enforcement while
  reducing input-token drag.

## Decision

Accept Round 120 as a comparable ATOMIC zero-loss win for the five-helper tier.
Escalate one controlled step in Round 121; keep two OpenCode workers,
persistent worktrees, external validation logs, atomic-only enforcement,
trace isolation and shape/churn gates.
