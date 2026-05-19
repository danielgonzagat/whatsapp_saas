You are the NORMAL OpenCode lane in A/B Round 079.

Worktree:
`/private/tmp/kloel-ab079-normal-20260517143719`

Mission:
Repeat the Round 078 runtime-context extraction task after the Atomic lane was
updated. Extract the three private runtime-context helper methods from
`backend/src/kloel/unified-agent.service.ts` into a new helper module
`backend/src/kloel/unified-agent-runtime-context.helpers.ts`.

Methods to extract:
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`
- `UnifiedAgentService.buildAgentToolEnvelope`

Acceptance:
- Export helper functions named `buildAgentRuntimeContext`,
  `recordAgentRuntimeTurn`, and `buildAgentToolEnvelope`.
- The helper file must not contain `this.`.
- Pass the optional `AgentRuntimeContextService` dependency explicitly into the
  helper functions.
- Import the helpers into `unified-agent.service.ts`.
- Replace all service callsites so behavior is preserved and `this.agentRuntime`
  is passed explicitly.
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
- Private-method scan proving the three original methods are gone.

Report compactly with changed files, validations, and any residual risk.
