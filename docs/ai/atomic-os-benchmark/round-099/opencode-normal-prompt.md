You are the NORMAL OpenCode lane in A/B Round 099.

Worktree:
`/Users/danielpenin/kloel-ab-worktrees/kloel-ab099-normal-20260517211534`

Mission:
Escalate one controlled step from Round 098. Solve the real Kloel refactor using
standard OpenCode behavior only. You may use normal OpenCode tools, but you
must not use Atomic OS, `atomic-edit`, `.atomic/traces`, `atomic-call.cjs`, or
the shared MCP atomic tools.

Extract this larger cluster from `backend/src/kloel/unified-agent.service.ts`
into:

`backend/src/kloel/unified-agent-tool-router.helpers.ts`

Cluster to extract:
- `UnifiedAgentService.executeToolAction`
- `UnifiedAgentService.num`
- `UnifiedAgentService.buildAgentToolEnvelope`
- `UnifiedAgentService.actionSucceeded`
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`

Acceptance:
- Export `executeToolAction`, `num`, `buildAgentToolEnvelope`,
  `actionSucceeded`, `buildAgentRuntimeContext`, and `recordAgentRuntimeTurn`
  from the helper.
- The helper must not contain `this.`.
- `executeToolAction` must use explicit dependencies.
- `buildAgentToolEnvelope`, `buildAgentRuntimeContext`, and
  `recordAgentRuntimeTurn` must receive runtime dependency explicitly.
- Remove the original six private methods from the service.
- Preserve public `executeTool(...)` in the service.
- Keep focused lint green on the two touched files.
- Do not touch protected governance files.
- Do not add suppressions such as `as any`, `@ts-ignore`, `eslint-disable`,
  `NOSONAR`, or `noqa`.

Required validation:
- Focused Jest for `src/kloel/unified-agent.service.spec.ts`.
- `git diff --check -- backend/src/kloel`.
- Protected diff check for governance files.
- Suppression scan on the two touched Kloel files.
- Helper scan proving the helper contains no `this.`.
- Private-method scan proving the six extracted private methods are gone.
- Residual public API scan proving public `executeTool` remains in the service.
- Lint the two touched files with `npx eslint src/kloel/unified-agent.service.ts
  src/kloel/unified-agent-tool-router.helpers.ts --max-warnings 0` from
  `backend`.

Report compactly with files changed, validation status, and residual risk.
