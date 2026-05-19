You are the NORMAL OpenCode lane in A/B Round 088.

Worktree:
`/private/tmp/kloel-ab088-normal-20260517171947`

Mission:
Escalate one controlled step beyond Round 087. Extract the complete
tool-router helper cluster from
`backend/src/kloel/unified-agent.service.ts` into:

`backend/src/kloel/unified-agent-tool-router.helpers.ts`

Cluster to extract:
- `UnifiedAgentService.executeToolAction`
- `UnifiedAgentService.num`
- `UnifiedAgentService.buildAgentToolEnvelope`

Acceptance:
- Export `executeToolAction`, `num`, and `buildAgentToolEnvelope` from
  `unified-agent-tool-router.helpers.ts`.
- The helper must not contain `this.`.
- `executeToolAction` must use explicit dependencies. Do not reach back into
  `UnifiedAgentService`.
- `buildAgentToolEnvelope` must receive the runtime dependency explicitly.
- All service callsites must use the exported router helper with explicit
  dependencies.
- Remove the original private `executeToolAction`, `num`, and
  `buildAgentToolEnvelope` methods from `UnifiedAgentService`.
- Preserve `private actionSucceeded`, `private buildAgentRuntimeContext`, and
  `private recordAgentRuntimeTurn` in `UnifiedAgentService`; do not move or
  delete them.
- Preserve public API and focused Jest behavior.
- Touch only the service file and the new helper unless validation proves
  another non-protected file is required.
- Do not touch protected governance files.
- Do not add suppressions such as `as any`, `@ts-ignore`, `eslint-disable`,
  `NOSONAR`, or `noqa`.

Normal-mode constraint:
- You may use factory OpenCode tools and normal shell commands.
- You must not use Atomic OS, atomic-edit MCP/tools, `atomic-call.cjs`,
  `.atomic/traces`, or `scripts/mcp/atomic-edit`.

Required validation:
- Focused Jest for `src/kloel/unified-agent.service.spec.ts`.
- `git diff --check -- backend/src/kloel`.
- Protected diff check for governance files.
- Suppression scan on the two touched Kloel files.
- Helper scan proving the helper contains no `this.`.
- Private-method scan proving `private async executeToolAction` is gone.
- Router-cluster absence scan proving `private num` and
  `private buildAgentToolEnvelope` are gone from the service.
- Residual-scope scan proving `private actionSucceeded`,
  `private buildAgentRuntimeContext`, and `private recordAgentRuntimeTurn`
  remain in the service.

Report compactly with changed files, validations, router-cluster status,
residual-scope status, and residual risk.
