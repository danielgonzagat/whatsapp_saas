You are the NORMAL OpenCode lane in A/B Round 075.

Worktree:
`/private/tmp/kloel-ab075-normal-20260517131404`

Mission:
Extract the two private helper methods `UnifiedAgentService.actionSucceeded` and `UnifiedAgentService.num` from `backend/src/kloel/unified-agent.service.ts` into a new helper module `backend/src/kloel/unified-agent-action.helpers.ts`.

Acceptance:
- Export `actionSucceeded` and `num` from `backend/src/kloel/unified-agent-action.helpers.ts`.
- Import those helpers into `unified-agent.service.ts`.
- Replace all `this.actionSucceeded(...)` call sites with `actionSucceeded(...)`.
- Replace all `this.num(...)` call sites with `num(...)`.
- Remove the original private methods from `UnifiedAgentService`.
- Preserve public API and behavior.
- Do not touch protected governance files.
- Do not add suppressions such as `as any`, `@ts-ignore`, `eslint-disable`, `NOSONAR`, or `noqa`.
- Run the focused Jest test and focused diff/protected/suppression checks.

Normal-mode constraint:
- You may use factory OpenCode tools and normal shell commands.
- You must not use Atomic OS, atomic-edit MCP/tools, `atomic-call.cjs`, `.atomic/traces`, or `scripts/mcp/atomic-edit`.

Report compactly with changed files, validations, and any residual risk.
