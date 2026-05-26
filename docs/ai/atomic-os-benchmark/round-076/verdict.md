# Round 076 Verdict

Status: `atomic_win_not_decisive_first_action_remaining`

## Task

Same complex benchmark as the prior rounds: extract
`UnifiedAgentService.actionSucceeded` and `UnifiedAgentService.num` from
`backend/src/kloel/unified-agent.service.ts` into
`backend/src/kloel/unified-agent-action.helpers.ts`, preserving public behavior
and focused Jest coverage.

## Atomic OS Change Tested

The watchdog used dynamic OpenCode variant policy:

- Normal lane: `max`
- Atomic lane: `minimal`
- Atomic prompt: command-first minified prompt

This tests whether Atomic can reduce first-action latency by compiling the
worker policy down to the smallest faithful launch profile.

## Validation

- Normal OpenCode completed with exit code `0`.
- Atomic OpenCode completed with exit code `0`.
- Both lanes passed focused Jest for `unified-agent.service.spec.ts`.
- Both lanes passed `git diff --check`.
- Both lanes produced no protected-file diff.
- Both lanes still failed package typecheck because of unrelated pre-existing
  `google-ads-*` Prisma type errors outside this benchmark task.
- Benchmark isolation passed.
- Normal did not use Atomic tools.
- Atomic used no native file tools and no native shell source-read commands.

## Benchmark Results

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Event rows | 114 | 6 | Atomic |
| First action | 14,252 ms | 49,923 ms | Normal |
| Total agent time | 453,993 ms | 70,012 ms | Atomic |
| Completed commands | 16 | 1 | Atomic |
| Failed commands | 4 | 0 | Atomic |
| Input tokens | 60,161 | 53,404 | Atomic |
| Output tokens | 5,807 | 441 | Atomic |
| Reasoning tokens | 2,664 | 420 | Atomic |
| Atomic traces | 0 | 10 | Atomic |
| Touched Kloel files | 2 | 2 | Tie |
| Source churn | 32 | 32 | Tie |

## Wins

Atomic won the operational surface decisively: one command, no failed commands,
far fewer events, lower total agent time, lower input/output/reasoning tokens,
zero native file-tool use, and 10 trace artifacts.

Normal's only meaningful win was first-action latency. It started acting in
14.252 seconds versus Atomic's 49.923 seconds.

## Diagnosis

The dynamic `minimal` variant improved Atomic's first-action latency versus
Round 075 (`61,159 ms -> 49,923 ms`), but did not close the gap. The remaining
loss is no longer a doctrine/prompt-size problem; it sits at the OpenCode
launch/command layer.

## Decision

Do not scale task complexity yet. Atomic is dominant overall, but not dominant
in every meaningful measured benchmark. The next Atomic OS update must attack
first-action latency at the launcher/command layer while preserving Atomic-only
execution, traceability, and worktree containment.
