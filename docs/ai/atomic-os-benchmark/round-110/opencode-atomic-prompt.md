You are the ATOMIC OpenCode lane in A/B Round 110.

Worktree:
`/Users/danielpenin/kloel-ab-worktrees/kloel-ab110-atomic-20260518041225`

Mission:
Solve the exact same real workspace task as the Normal lane, but use Atomic OS
only. Round 109 passed this multi-module helper split with a strong Atomic win;
this round repeats the same complexity once to confirm stability before any
scale-up. Keep the Round 109 policy frozen: the runtime helper must not import
or contain `ToolArgs`.

Task:
Extract the `UnifiedAgentService` tool/router/runtime cluster into two helper
modules:

- `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- `backend/src/kloel/unified-agent-runtime.helpers.ts`

Runtime helper module must export:
- `buildAgentRuntimeContext`
- `recordAgentRuntimeTurn`

Tool-router helper module must export:
- top-level `isAllowedTool`
- top-level `formatPromptValue`
- `num`
- `actionSucceeded`
- `buildAgentToolEnvelope`
- `executeToolAction`
- safe parser helper `parseToolArgs`

Atomic-only constraints:
- Do not use OpenCode native file tools for source reading or editing (`read`,
  `write`, `edit`, `multiedit`, `patch`, `grep`, `glob`, `list`) on source
  code.
- Do not use shell readers such as `cat`, `sed`, `nl`, `awk`, `head`, or `tail`
  on `backend/src/kloel/**`.
- Execute the macro shell block below exactly once from the atomic worktree as
  the first action.
- Keep every command pinned to the atomic worktree with both `cd` and
  `ATOMIC_OS_REPO_ROOT`.
- Do not pipe atomic commands through `head`, `tail`, `sed`, `awk`, or `nl`.
- If the macro fails, repair only through Atomic OS operations or
  `atomic-call.cjs`; do not fall back to native file tools or shell code writes.
- Do not touch protected governance files.
- Do not add suppressions such as `as any`, `@ts-ignore`, `eslint-disable`,
  `NOSONAR`, or `noqa`.

Acceptance:
- The two helper modules must not contain `this.`.
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
- Service must use
  `parseToolArgs(this.logger, toolName, toolCall.function.arguments)` instead
  of inline unknown-safe JSON parsing.
- `parseToolArgs` must preserve invalid JSON behavior by logging
  `Failed to parse tool args for ${toolName}` and returning `{}`.
- `backend/src/kloel/unified-agent-runtime.helpers.ts` must not import or
  contain `ToolArgs`.

Command:
```sh
cd /Users/danielpenin/kloel-ab-worktrees/kloel-ab110-atomic-20260518041225 && export ATOMIC_OS_REPO_ROOT=/Users/danielpenin/kloel-ab-worktrees/kloel-ab110-atomic-20260518041225 && R=/Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-110 && W=/Users/danielpenin/kloel-ab-worktrees/kloel-ab110-atomic-20260518041225 && RUNTIME_ARGS="$(node -e 'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$R/atomic-runtime-extract-args.json")" && node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" extract_class_methods_to_file "$RUNTIME_ARGS" && ROUTER_ARGS="$(node -e 'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$R/atomic-router-extract-args.json")" && node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" extract_class_methods_to_file "$ROUTER_ARGS" && node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"ExecuteToolActionDeps","typeOnly":true}' && node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"parseToolArgs"}' && PARSE_ARGS="$(node -e 'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$R/atomic-parser-replace-args.json")" && node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" atomic_replace_text "$PARSE_ARGS" && node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"num"}' && node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"buildAgentToolEnvelope"}' && TOP_ARGS="$(node -e 'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$R/atomic-top-extract-args.json")" && node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" extract_symbols_to_file "$TOP_ARGS" && node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" atomic_apply_eslint_dry_run_fixes '{"cwd":"backend","args":["src/kloel/unified-agent.service.ts","src/kloel/unified-agent-tool-router.helpers.ts","src/kloel/unified-agent-runtime.helpers.ts","--fix-dry-run","--fix-type","layout","--format","json"],"allowedPaths":["backend/src/kloel/unified-agent.service.ts","backend/src/kloel/unified-agent-tool-router.helpers.ts","backend/src/kloel/unified-agent-runtime.helpers.ts"],"applyKnownResidueFixes":false}'
```
