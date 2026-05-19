You are the NORMAL OpenCode lane in A/B Round 081.

Worktree:
`/private/tmp/kloel-ab081-normal-20260517150722`

Mission:
Scale one step beyond Round 080. Extract a mixed set of five private helper
methods from `backend/src/kloel/unified-agent.service.ts` into a new helper
module `backend/src/kloel/unified-agent-private.helpers.ts`.

Methods to extract:
- `UnifiedAgentService.actionSucceeded`
- `UnifiedAgentService.num`
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`
- `UnifiedAgentService.buildAgentToolEnvelope`

Acceptance:
- Export helper functions named `actionSucceeded`, `num`,
  `buildAgentRuntimeContext`, `recordAgentRuntimeTurn`, and
  `buildAgentToolEnvelope`.
- The helper file must not contain `this.`.
- Runtime-context helpers must receive `AgentRuntimeContextService | undefined`
  explicitly.
- Pure helpers `actionSucceeded` and `num` must remain pure and must not
  receive unused runtime dependencies.
- Import the helpers into `unified-agent.service.ts`.
- Replace all service callsites so behavior is preserved.
- Remove the original five private methods from `UnifiedAgentService`.
- Preserve public API and focused Jest behavior.
- Touch only the service file and the new helper file unless validation proves
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
- Helper scan proving `unified-agent-private.helpers.ts` contains no `this.`.
- Private-method scan proving the five original methods are gone.

Report compactly with changed files, validations, and any residual risk.
