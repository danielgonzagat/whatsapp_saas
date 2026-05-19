You are the NORMAL OpenCode lane in A/B Round 111.

Worktree:
`/Users/danielpenin/kloel-ab-worktrees/kloel-ab111-normal-20260518043230`

Mission:
Solve the exact same real workspace task as the Atomic lane, but use factory
OpenCode behavior only. You may use normal source reading/editing tools and
shell commands, but you must not use Atomic OS tooling. Round 109 and Round 110
validated the two-helper split; this round scales one controlled step.

Task:
Split the real `UnifiedAgentService` tool/router/runtime/parser cluster across
three helper modules:

- `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- `backend/src/kloel/unified-agent-runtime.helpers.ts`
- `backend/src/kloel/unified-agent-tool-parser.helpers.ts`

Runtime helper module must export:
- `buildAgentRuntimeContext`
- `recordAgentRuntimeTurn`

Tool-router helper module must export:
- `num`
- `actionSucceeded`
- `buildAgentToolEnvelope`
- `executeToolAction`

Tool-parser helper module must export:
- top-level `isAllowedTool`
- top-level `formatPromptValue`
- safe parser helper `parseToolArgs`

Parser behavior:
- Service must use
  `parseToolArgs(this.logger, toolName, toolCall.function.arguments)`.
- `parseToolArgs` must preserve the original behavior: invalid JSON logs
  `Failed to parse tool args for ${toolName}` and returns `{}`.

Acceptance:
- The three helper modules must not contain `this.`.
- `executeToolAction` must use explicit dependencies.
- `buildAgentToolEnvelope` must receive runtime dependency explicitly.
- `buildAgentRuntimeContext` and `recordAgentRuntimeTurn` must receive runtime
  dependency explicitly in the runtime helper module.
- Service callsites must use imported helper functions, not private methods.
- Remove the original six private methods from the service.
- Remove the original two top-level helper functions from the service.
- Preserve public `async executeTool(...)` and
  `async buildQuotedReplyPlan(...)` in the service.
- Do not create `toolRouterDeps()`.
- Do not create or use the rejected `routerDeps` getter.
- `backend/src/kloel/unified-agent-runtime.helpers.ts` must not import or
  contain `ToolArgs`.
- Do not touch protected governance files.
- Do not add suppressions such as `as any`, `@ts-ignore`, `eslint-disable`,
  `NOSONAR`, or `noqa`.

Required validation:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand`
- `cd backend && npx eslint src/kloel/unified-agent.service.ts src/kloel/unified-agent-tool-router.helpers.ts src/kloel/unified-agent-runtime.helpers.ts src/kloel/unified-agent-tool-parser.helpers.ts --max-warnings 0`
- `cd backend && npm run typecheck`
- `git diff --check -- backend/src/kloel`
- Protected diff check for governance files.
- Suppression scan on the four touched Kloel files.
- Helper scan proving all three helpers contain no `this.`.
- Private-method scan proving the six extracted private methods are gone.
- Top-level scan proving the two extracted top-level functions are gone from
  the service.
- Public API scan proving `async executeTool(` and
  `async buildQuotedReplyPlan(` remain in the service.

Report:
- Files changed.
- Commands run and exact pass/fail.
- Residual risks.
