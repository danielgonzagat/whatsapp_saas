You are the NORMAL OpenCode lane in A/B Round 132.

Worktree:
`/Users/danielpenin/kloel-ab-worktrees/kloel-ab132-normal-20260518110954`

Factory OpenCode only. Do not use Atomic OS tools, atomic-edit commands,
`.atomic` traces or the atomic fast-path.

Task: split `backend/src/kloel/unified-agent.service.ts` into this seven-helper
target:

- `unified-agent-tool-router.helpers.ts`: `num`, `actionSucceeded`,
  `buildAgentToolEnvelope`, `executeToolAction`.
- `unified-agent-runtime.helpers.ts`: `buildAgentRuntimeContext`,
  `recordAgentRuntimeTurn`.
- `unified-agent-tool-parser.helpers.ts`: `isAllowedTool`,
  `formatPromptValue`, `parseToolArgs`.
- `unified-agent-cognitive-state.helpers.ts`:
  `buildUnifiedAgentCognitiveState`.
- `unified-agent-incoming-message.helpers.ts`:
  `processIncomingUnifiedAgentMessage`.
- `unified-agent-tool-call-processing.helpers.ts`:
  `processUnifiedAgentToolCalls`.
- `unified-agent-predecided-processing.helpers.ts`:
  `processUnifiedAgentPredecidedActions`.

Keep public service methods `processIncomingMessage`, `processMessage`, `executeTool` and
`buildQuotedReplyPlan`. Helpers must not contain `this.`. Remove extracted
private methods and inline blocks from the service. Service must delegate
incoming-message, tool-call and predecided-action processing to helpers.

Hard prohibitions: no protected/governance edits, no suppressions, no `as any`,
no `@ts-ignore`, no `eslint-disable`, no `toolRouterDeps()` or `routerDeps`
getter. Runtime helper must not import or contain `ToolArgs`. Service must no
longer import `validateAbiPayload`, `forEachSequential`,
`buildPredecidedActionDraft` or `executePredecidedAgentActions`.

Validation, in this order:

```sh
cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent
cd backend && npx eslint src/kloel/unified-agent.service.ts src/kloel/unified-agent-tool-router.helpers.ts src/kloel/unified-agent-runtime.helpers.ts src/kloel/unified-agent-tool-parser.helpers.ts src/kloel/unified-agent-cognitive-state.helpers.ts src/kloel/unified-agent-incoming-message.helpers.ts src/kloel/unified-agent-tool-call-processing.helpers.ts src/kloel/unified-agent-predecided-processing.helpers.ts --max-warnings 0
npm --prefix backend run typecheck
git diff --check -- backend/src/kloel
```

If global typecheck is red, isolate whether any error is in touched
`src/kloel/**` files. Final report must include changed files, command results,
touched Kloel typecheck errors, and residual risk.
