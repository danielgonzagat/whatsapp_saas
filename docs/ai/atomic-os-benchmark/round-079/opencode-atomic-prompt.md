You are the ATOMIC OpenCode lane in A/B Round 079.

Worktree:
`/private/tmp/kloel-ab079-atomic-20260517143719`

Mission:
Repeat the Round 078 runtime-context extraction task after the Atomic operator
was updated. Extract the three private runtime-context helper methods from
`backend/src/kloel/unified-agent.service.ts` into
`backend/src/kloel/unified-agent-runtime-context.helpers.ts`.

Methods to extract:
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`
- `UnifiedAgentService.buildAgentToolEnvelope`

Atomic-only constraints:
- Do not use OpenCode native file tools for source reading or editing (`read`,
  `write`, `edit`, `multiedit`, `patch`, `grep`, `glob`, `list`) on source code.
- Do not use shell readers such as `cat`, `sed`, `nl`, `awk`, `head`, or `tail`
  on `backend/src/kloel/**`.
- Execute the macro atomic operator below exactly once from the atomic worktree
  as the first action.
- Keep the command pinned to the atomic worktree with both `cd` and
  `ATOMIC_OS_REPO_ROOT`.
- Do not pipe the atomic command through `head`, `tail`, `sed`, `awk`, or `nl`.
- If the macro fails, repair only through Atomic OS operations or
  `atomic-call.cjs`; do not fall back to native file tools or shell code writes.
- Do not touch protected governance files.
- Do not add suppressions such as `as any`, `@ts-ignore`, `eslint-disable`,
  `NOSONAR`, or `noqa`.

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

Command:
```sh
cd /private/tmp/kloel-ab079-atomic-20260517143719 && ATOMIC_OS_REPO_ROOT=/private/tmp/kloel-ab079-atomic-20260517143719 node /private/tmp/kloel-ab079-atomic-20260517143719/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_class_methods_to_file '{"sourceFile":"backend/src/kloel/unified-agent.service.ts","targetFile":"backend/src/kloel/unified-agent-runtime-context.helpers.ts","className":"UnifiedAgentService","methods":["buildAgentRuntimeContext","recordAgentRuntimeTurn","buildAgentToolEnvelope"],"importNames":["buildAgentRuntimeContext","recordAgentRuntimeTurn","buildAgentToolEnvelope"],"importModule":"./unified-agent-runtime-context.helpers","targetHeader":"import type { AgentRuntimeContextService } from \u0027./agent-runtime\u0027;","methodAdapter":{"signaturePrefixParam":"agentRuntime: AgentRuntimeContextService | undefined, ","bodyReplacements":[{"oldText":"this.agentRuntime","newText":"agentRuntime"}]},"callsiteReplacements":[{"oldText":"this.buildAgentRuntimeContext(","newText":"buildAgentRuntimeContext(this.agentRuntime, ","expectedCount":1},{"oldText":"this.recordAgentRuntimeTurn(","newText":"recordAgentRuntimeTurn(this.agentRuntime, ","expectedCount":2},{"oldText":"this.buildAgentToolEnvelope(","newText":"buildAgentToolEnvelope(this.agentRuntime, ","expectedCount":1}],"validate":true,"includeTypecheck":false,"validationProfile":"kloel-unified-agent-runtime-context-method-extract-no-typecheck","scanFiles":["backend/src/kloel/unified-agent.service.ts","backend/src/kloel/unified-agent-runtime-context.helpers.ts"],"forbiddenTextChecks":[{"file":"backend/src/kloel/unified-agent-runtime-context.helpers.ts","text":"this.","label":"runtime helper no this"},{"file":"backend/src/kloel/unified-agent.service.ts","text":"private async buildAgentRuntimeContext","label":"private build runtime context removed"},{"file":"backend/src/kloel/unified-agent.service.ts","text":"private async recordAgentRuntimeTurn","label":"private record runtime turn removed"},{"file":"backend/src/kloel/unified-agent.service.ts","text":"private buildAgentToolEnvelope","label":"private build tool envelope removed"}],"report":"compact"}'
```

Required validation:
- The macro's embedded validation must pass.
- External focused Jest for `src/kloel/unified-agent.service.spec.ts`.
- `git diff --check -- backend/src/kloel`.
- Protected diff check for governance files.
- Suppression scan on the two touched Kloel files.
- Helper scan proving `unified-agent-runtime-context.helpers.ts` contains no
  `this.`.
- Private-method scan proving the three original methods are gone.

Report compactly with operator status, validation status, trace count if visible,
and residual risk.
