You are the ATOMIC OpenCode lane in A/B Round 105.

Worktree:
`/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829`

Mission:
Solve the exact same real workspace task as the Normal lane, but use Atomic OS only. This round repeats Round 103/104 at the same complexity. Round 104 rejected the `routerDeps` getter because it did not improve service-line/churn shape. Round 105 tests a compact helper-parser policy while returning to the stable constructor-property dependency container.

Task:
Extract this mixed cluster from `backend/src/kloel/unified-agent.service.ts` into:

`backend/src/kloel/unified-agent-tool-router.helpers.ts`

Mixed cluster to extract:
- top-level `isAllowedTool`
- top-level `formatPromptValue`
- `UnifiedAgentService.executeToolAction`
- `UnifiedAgentService.num`
- `UnifiedAgentService.buildAgentToolEnvelope`
- `UnifiedAgentService.actionSucceeded`
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`

Atomic-only constraints:
- Do not use OpenCode native file tools for source reading or editing (`read`, `write`, `edit`, `multiedit`, `patch`, `grep`, `glob`, `list`) on source code.
- Do not use shell readers such as `cat`, `sed`, `nl`, `awk`, `head`, or `tail` on `backend/src/kloel/**`.
- Execute the macro shell block below exactly once from the atomic worktree as the first action.
- Keep every command pinned to the atomic worktree with both `cd` and `ATOMIC_OS_REPO_ROOT`.
- Do not pipe atomic commands through `head`, `tail`, `sed`, `awk`, or `nl`.
- If the macro fails, repair only through Atomic OS operations or `atomic-call.cjs`; do not fall back to native file tools or shell code writes.
- Do not touch protected governance files.
- Do not add suppressions such as `as any`, `@ts-ignore`, `eslint-disable`, `NOSONAR`, or `noqa`.

Acceptance:
- Export all eight mixed-cluster functions from `unified-agent-tool-router.helpers.ts`; an additional `parseToolArgs` helper is allowed only for reducing inline parsing overhead.
- The helper must not contain `this.`.
- `executeToolAction` must use explicit dependencies.
- `buildAgentToolEnvelope`, `buildAgentRuntimeContext`, and `recordAgentRuntimeTurn` must receive runtime dependency explicitly.
- Service callsites must use imported helper functions, not private methods.
- Remove the original six private methods from the service.
- Remove the original two top-level helper functions from the service.
- Preserve public `async executeTool(...)` and `async buildQuotedReplyPlan(...)` in the service.
- Do not create `toolRouterDeps()`.
- Do not create or use the rejected `routerDeps` getter.
- Service must use `parseToolArgs(toolCall.function.arguments)` instead of inline unknown-safe JSON parsing.

Command:
```sh
cd /Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829 && ARGS="$(node -e 'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))' /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-105/atomic-class-extract-args.json)" && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_class_methods_to_file "$ARGS" && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"ExecuteToolActionDeps","typeOnly":true}' && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"parseToolArgs"}' && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"num"}' && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"buildAgentToolEnvelope"}' && TOP_ARGS="$(node -e 'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))' /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-105/atomic-top-extract-args.json)" && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_symbols_to_file "$TOP_ARGS" && ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829 node /Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs atomic_apply_eslint_dry_run_fixes '{"cwd":"backend","args":["src/kloel/unified-agent.service.ts","src/kloel/unified-agent-tool-router.helpers.ts","--fix-dry-run","--fix-type","layout","--format","json"],"allowedPaths":["backend/src/kloel/unified-agent.service.ts","backend/src/kloel/unified-agent-tool-router.helpers.ts"],"applyKnownResidueFixes":false}'
```
