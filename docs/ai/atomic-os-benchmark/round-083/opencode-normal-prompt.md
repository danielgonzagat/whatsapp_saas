You are the NORMAL OpenCode lane in A/B Round 083.

Worktree:
`/private/tmp/kloel-ab083-normal-20260517153044`

Mission:
Scale one step beyond Round 082. Perform a multi-module extraction from
`backend/src/kloel/unified-agent.service.ts`:

Pure helper module:
`backend/src/kloel/unified-agent-action.helpers.ts`
- `UnifiedAgentService.actionSucceeded`
- `UnifiedAgentService.num`

Runtime helper module:
`backend/src/kloel/unified-agent-runtime-context.helpers.ts`
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`
- `UnifiedAgentService.buildAgentToolEnvelope`

Acceptance:
- Export `actionSucceeded` and `num` from `unified-agent-action.helpers.ts`.
- Export `buildAgentRuntimeContext`, `recordAgentRuntimeTurn`, and
  `buildAgentToolEnvelope` from `unified-agent-runtime-context.helpers.ts`.
- Neither helper file may contain `this.`.
- Runtime-context helpers must receive `AgentRuntimeContextService | undefined`
  explicitly.
- Pure helpers must remain pure and must not receive unused runtime dependencies.
- Import the helpers into `unified-agent.service.ts` from their respective modules.
- Replace all service callsites so behavior is preserved.
- Remove the original five private methods from `UnifiedAgentService`.
- Preserve public API and focused Jest behavior.
- Touch only the service file and the two new helper files unless validation proves
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
- Suppression scan on the three touched Kloel files.
- Helper scan proving both helper files contain no `this.`.
- Private-method scan proving the five original methods are gone.

Report compactly with changed files, validations, and any residual risk.
