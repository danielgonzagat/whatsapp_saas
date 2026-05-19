You are the NORMAL OpenCode lane in A/B Round 105.

Worktree:
`/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-normal-20260518020829`

Mission:
Solve the exact same real workspace task as the Atomic lane, but use factory OpenCode behavior only. You may use normal source reading/editing tools and shell commands, but you must not use Atomic OS tooling.

Task:
Extract a mixed cluster from `backend/src/kloel/unified-agent.service.ts` into:

`backend/src/kloel/unified-agent-tool-router.helpers.ts`

Mixed cluster to extract:
- top-level `isAllowedTool`
- top-level `formatPromptValue`
- `UnifiedAgentService.executeToolAction`
- `UnifiedAgentService.num`
- `UnifiedAgentService.buildAgentToolEnvelope`
- `UnifiedAgentService.actionSucceeded`
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`

Acceptance:
- Export all eight mixed-cluster functions from `unified-agent-tool-router.helpers.ts`.
- The helper must not contain `this.`.
- `executeToolAction` must use explicit dependencies.
- `buildAgentToolEnvelope`, `buildAgentRuntimeContext`, and `recordAgentRuntimeTurn` must receive runtime dependency explicitly.
- Service callsites must use imported helper functions, not private methods.
- Remove the original six private methods from the service.
- Remove the original two top-level helper functions from the service.
- Preserve public `async executeTool(...)` and `async buildQuotedReplyPlan(...)` in the service.
- Do not create `toolRouterDeps()`; if dependencies are grouped, use an explicit property/object.
- Do not touch protected governance files.
- Do not add suppressions such as `as any`, `@ts-ignore`, `eslint-disable`, `NOSONAR`, or `noqa`.

Required validation:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand`
- `cd backend && npx eslint src/kloel/unified-agent.service.ts src/kloel/unified-agent-tool-router.helpers.ts --max-warnings 0`
- `cd backend && npm run typecheck`
- `git diff --check -- backend/src/kloel`
- Protected diff check for governance files.
- Suppression scan on the two touched Kloel files.
- Helper scan proving the helper contains no `this.`.
- Private-method scan proving the six extracted private methods are gone.
- Top-level scan proving the two extracted top-level functions are gone from the service.
- Public API scan proving `async executeTool(` and `async buildQuotedReplyPlan(` remain in the service.

Report:
- Files changed.
- Commands run and exact pass/fail.
- Residual risks.
