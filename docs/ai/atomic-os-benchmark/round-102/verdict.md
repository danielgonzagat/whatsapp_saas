# Round 102 Verdict

Status: rejected_tool_policy_regression

## Task

Repeat Round 101 on the same real Kloel task: extract the mixed tool-router
cluster from `backend/src/kloel/unified-agent.service.ts` into
`backend/src/kloel/unified-agent-tool-router.helpers.ts`, comparing OpenCode
NORMAL versus OpenCode ATOMIC in isolated persistent worktrees.

## Result

No A/B winner accepted.

- NORMAL was still running when the round was stopped because the ATOMIC lane
  had already invalidated the comparison.
- ATOMIC OpenCode process exited `0`, but the Atomic preprompt exited `1`.
- ATOMIC passed the core behavioral smoke inside the preprompt (`13/13` Jest),
  but failed its own validation gate: `no deps builder method`.

## Root Cause

The Round 101 fix made `dependencyContainer` insert a dynamic getter:

`private get toolRouterDeps(): ExecuteToolActionDeps`

The validation gate still used forbidden text `toolRouterDeps()`, which also
matches getter syntax because the getter signature contains `toolRouterDeps():`.
The prompt simultaneously required the getter and forbade the textual shape.

This is an Atomic OS policy/tool regression, not a valid product-task result.

## Evidence

- `opencode-atomic-preprompt-exit.txt`: `1`
- `opencode-atomic-events.jsonl`: ATOMIC reported `ATOMIC_PREPROMPT_EXIT=1`
- `opencode-atomic-preprompt-output.log`: extraction wrote helper/service and
  failed validation at `no deps builder method`
- `audit.json`: ATOMIC preprompt exit `1`; NORMAL partial and not accepted
- Processes for Round 102 were stopped after invalidation.

## Tool Update

`docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` now supports
`dependencyContainer.style = "constructorProperty"`, generating:

- `private readonly <name>: <typeName>;`
- constructor assignment from dynamic `entries`

This preserves the dynamic policy compiler behavior without generating a getter
or method-like text that collides with `toolRouterDeps()` checks.

## Decision

Do not scale complexity.

Round 103 must repeat the same task with `dependencyContainer` style
`constructorProperty`, using the same two-worker OpenCode A/B shape and the
same external validation gates.
