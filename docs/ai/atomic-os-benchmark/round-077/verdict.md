# Round 077 Verdict

Status: `validated_atomic_decisive_win_same_complexity`

## Task

Repeat the same method-extraction benchmark as Round 076:
extract `UnifiedAgentService.actionSucceeded` and `UnifiedAgentService.num`
from `backend/src/kloel/unified-agent.service.ts` into
`backend/src/kloel/unified-agent-action.helpers.ts`.

## Atomic OS Change Tested

The watchdog launched the Atomic lane through an OpenCode custom command with a
preprompt shell fast path:

- `--atomic-command-mode preprompt-shell`
- Atomic command ran inside the assigned worktree with
  `ATOMIC_OS_REPO_ROOT=<atomic-worktree>`.
- The macro operator executed before the model spent a normal reasoning turn on
  the implementation.

## Validation

- Atomic OpenCode completed with exit code `0`.
- Normal OpenCode hit the watchdog `max_timeout` after about 600s.
- Both lanes produced the requested two-file product shape.
- Both lanes passed focused Jest for `unified-agent.service.spec.ts`.
- Both lanes passed `git diff --check`.
- Both lanes produced no protected-file diff.
- Both lanes introduced no suppression patterns in the touched Kloel files.
- Both lanes still failed package typecheck because of unrelated pre-existing
  `google-ads-*` Prisma errors outside this benchmark task.
- Benchmark isolation passed.
- Normal did not use Atomic tools.
- Atomic used no native file tools, no shell source reads, no masked pipeline
  commands, and no worktree escape.

## Benchmark Results

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Event rows | 100 | 3 | Atomic |
| First action | 20,774 ms | 6,103 ms | Atomic |
| Total agent time | 577,539 ms | 57,247 ms | Atomic |
| Completed commands | 14 | 1 | Atomic |
| Failed commands | 1 | 0 | Atomic |
| Input tokens | 73,285 | 53,003 | Atomic |
| Output tokens | 4,376 | 91 | Atomic |
| Reasoning tokens | 1,522 | 114 | Atomic |
| Atomic traces | 0 | 10 | Atomic |
| Touched Kloel files | 2 | 2 | Tie |
| Source churn | 32 | 32 | Tie |

## Wins

Atomic won every measured operational metric and tied only on intentional code
surface. The first-action loss from Rounds 073-076 is closed: Atomic acted in
6.103s, while Normal first acted in 20.774s.

Normal has no benchmark win in Round 077. It reached the correct code shape, but
timed out before a compact final handoff and spent far more surface on tool
reads, edits, validation attempts, events, commands and tokens.

## Diagnosis

The remaining bottleneck was at the OpenCode launch/command layer, not the macro
operator. The custom command preprompt converted the already-compiled Atomic
macro into the first real action while preserving Atomic-only execution,
traceability, worktree containment and external validation.

## Decision

The method-extraction tier is closed for escalation. Atomic won this tier with a
large margin across first action, total time, commands, failures, events,
tokens, traceability and discipline, with no measured Normal win.

The next loop may scale complexity one step, but the new tier must keep the same
rules: two isolated OpenCode workers, same real task, external validation,
Atomic-only discipline, trace isolation, protected-diff check, and formal
conversion of every Atomic loss into tooling/policy updates before any further
scale.
