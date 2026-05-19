You are the NORMAL OpenCode lane in A/B Round 085.

Worktree:
`/private/tmp/kloel-ab085-normal-20260517161619`

Mission:
Scale one step beyond Round 084. Extract the private tool-router method
`UnifiedAgentService.executeToolAction` from
`backend/src/kloel/unified-agent.service.ts` into:

`backend/src/kloel/unified-agent-tool-router.helpers.ts`

Acceptance:
- Export `executeToolAction` from `unified-agent-tool-router.helpers.ts`.
- The helper must not contain `this.`.
- All service callsites must use the exported helper with explicit
  dependencies.
- The predecided-action executor path must keep behavior: it receives
  `workspaceId`, `contactId`, `phone`, `tool`, `args`, and `context`, then calls
  the helper.
- Remove the original private `executeToolAction` method from
  `UnifiedAgentService`.
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

Report compactly with changed files, validations, and any residual risk.
