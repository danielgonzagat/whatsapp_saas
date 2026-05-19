You are the NORMAL OpenCode lane in A/B Round 078.

Worktree:
`/private/tmp/kloel-ab078-normal-20260517141423`

Mission:
Extract the three private runtime-context helper methods from
`backend/src/kloel/unified-agent.service.ts` into a new helper module
`backend/src/kloel/unified-agent-runtime-context.helpers.ts`.

Methods to extract:
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`
- `UnifiedAgentService.buildAgentToolEnvelope`

Acceptance:
- Export helper functions named `buildAgentRuntimeContext`,
  `recordAgentRuntimeTurn`, and `buildAgentToolEnvelope` from
  `backend/src/kloel/unified-agent-runtime-context.helpers.ts`.
- The helper file must not contain `this.`. Pass the optional
  `AgentRuntimeContextService` dependency explicitly into the helper functions.
- Import the helpers into `unified-agent.service.ts`.
- Replace all service callsites so behavior is preserved:
  - `this.buildAgentRuntimeContext(...)` becomes a call that passes
    `this.agentRuntime` explicitly.
  - `this.recordAgentRuntimeTurn(...)` becomes a call that passes
    `this.agentRuntime` explicitly.
  - `this.buildAgentToolEnvelope(...)` becomes a call that passes
    `this.agentRuntime` explicitly.
- Remove the original three private methods from `UnifiedAgentService`.
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
- Helper scan proving `unified-agent-runtime-context.helpers.ts` contains no
  `this.`.

Report compactly with changed files, validations, and any residual risk.
