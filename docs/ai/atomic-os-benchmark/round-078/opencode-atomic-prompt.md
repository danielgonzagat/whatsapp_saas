You are the ATOMIC OpenCode lane in A/B Round 078.

Worktree:
`/private/tmp/kloel-ab078-atomic-20260517141423`

Mission:
Extract the three private runtime-context helper methods from
`backend/src/kloel/unified-agent.service.ts` into a new helper module
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

Command:
```sh
cd /private/tmp/kloel-ab078-atomic-20260517141423 && ATOMIC_OS_REPO_ROOT=/private/tmp/kloel-ab078-atomic-20260517141423 node /private/tmp/kloel-ab078-atomic-20260517141423/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_class_methods_to_file '{"sourceFile":"backend/src/kloel/unified-agent.service.ts","targetFile":"backend/src/kloel/unified-agent-runtime-context.helpers.ts","className":"UnifiedAgentService","methods":["buildAgentRuntimeContext","recordAgentRuntimeTurn","buildAgentToolEnvelope"],"importNames":["buildAgentRuntimeContext","recordAgentRuntimeTurn","buildAgentToolEnvelope"],"importModule":"./unified-agent-runtime-context.helpers","callsiteReplacements":[{"oldText":"this.buildAgentRuntimeContext(","newText":"buildAgentRuntimeContext(this.agentRuntime,","expectedCount":1},{"oldText":"this.recordAgentRuntimeTurn(","newText":"recordAgentRuntimeTurn(this.agentRuntime,","expectedCount":2},{"oldText":"this.buildAgentToolEnvelope(","newText":"buildAgentToolEnvelope(this.agentRuntime,","expectedCount":1}],"validate":true,"includeTypecheck":false,"validationProfile":"kloel-unified-agent-runtime-context-method-extract-no-typecheck","scanFiles":["backend/src/kloel/unified-agent.service.ts","backend/src/kloel/unified-agent-runtime-context.helpers.ts"],"report":"compact"}'
```

Required validation:
- Focused Jest for `src/kloel/unified-agent.service.spec.ts`.
- `git diff --check -- backend/src/kloel`.
- Protected diff check for governance files.
- Suppression scan on the two touched Kloel files.
- Helper scan proving `unified-agent-runtime-context.helpers.ts` contains no
  `this.`.

Report compactly with operator status, validation status, trace count if visible,
and residual risk.
