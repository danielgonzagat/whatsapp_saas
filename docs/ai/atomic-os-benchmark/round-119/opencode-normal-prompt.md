You are the NORMAL OpenCode lane in A/B Round 119.

Worktree:
`/Users/danielpenin/kloel-ab-worktrees/kloel-ab119-normal-20260518073232`

Use factory OpenCode only. You may read/edit normally, but do not use Atomic OS
tools, atomic-edit commands, `.atomic` traces, or copied Atomic fast-paths.

Task:
Split `backend/src/kloel/unified-agent.service.ts` into exactly these five
helpers:

- `unified-agent-tool-router.helpers.ts`: export `num`, `actionSucceeded`,
  `buildAgentToolEnvelope`, `executeToolAction`
- `unified-agent-runtime.helpers.ts`: export `buildAgentRuntimeContext`,
  `recordAgentRuntimeTurn`
- `unified-agent-tool-parser.helpers.ts`: export `isAllowedTool`,
  `formatPromptValue`, `parseToolArgs`
- `unified-agent-cognitive-state.helpers.ts`: export
  `buildUnifiedAgentCognitiveState`
- `unified-agent-incoming-message.helpers.ts`: export
  `processIncomingUnifiedAgentMessage`; public `processIncomingMessage` must
  remain on `UnifiedAgentService` and delegate to this helper.

Acceptance:
- Helpers contain no `this.`
- Service imports helper functions and keeps public `async processIncomingMessage(`,
  `async executeTool(` and `async buildQuotedReplyPlan(`
- Remove extracted private methods/top-level helper functions from service
- Remove inline ABI cognitive-state block from service
- Service no longer imports `validateAbiPayload`; cognitive helper owns it
- Runtime helper must not import/contain `ToolArgs`
- Do not create `toolRouterDeps()` or `routerDeps`
- Do not touch protected/governance files
- Do not add suppressions (`as any`, `@ts-ignore`, `eslint-disable`, `NOSONAR`,
  `noqa`)

Required commands:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `cd backend && npx eslint src/kloel/unified-agent.service.ts src/kloel/unified-agent-tool-router.helpers.ts src/kloel/unified-agent-runtime.helpers.ts src/kloel/unified-agent-tool-parser.helpers.ts src/kloel/unified-agent-cognitive-state.helpers.ts src/kloel/unified-agent-incoming-message.helpers.ts --max-warnings 0`
- `npm --prefix backend run typecheck` (report global pre-existing errors separately from touched Kloel errors)
- `git diff --check -- backend/src/kloel`

Report files changed, exact command results, and residual risk.
