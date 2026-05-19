You are the ATOMIC OS Codex A/B worker for Round 137.

Workspace:

`/private/tmp/kloel-ab137-atomic-20260518070737`

Mission:

Refactor `backend/src/kloel/unified-agent.service.ts` into a smaller service
facade by extracting cohesive runtime/support modules under
`backend/src/kloel/unified-agent*`.

Acceptance criteria:

- Preserve `UnifiedAgentService` class name.
- Preserve constructor injection/signature.
- Preserve all public method signatures.
- Do not edit `backend/src/kloel/unified-agent.service.spec.ts`.
- Do not edit protected/governance/package/workflow files.
- Do not add lint/type suppressions or `as any`.
- Keep the diff scoped to `backend/src/kloel/unified-agent*` source files plus
  Atomic trace artifacts.
- Make the service facade meaningfully smaller while keeping the focused spec
  green.

Atomic OS policy:

- Use only Atomic OS mutating tools for code writes:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs ...`
- Do not use builtin line patches, raw file writes, `perl -pi`, `sed -i`, or
  shell redirection for code changes.
- Read the compiled policy:
  `/Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-137-codex-20260518070737/atomic-fastpath.json`
- Follow `atomicWorkerBrief.executionStartCapsule`: it is the dynamic start
  path compiled from this worktree, not a fixed latency contract.
- Its first durable mutation target is
  `backend/src/kloel/unified-agent-process.ts`; start there as soon as its
  `startNowWhen` evidence is true.
- Follow the selected macro shape: `dependency_split_modules`.
- Follow the selected delegation shape: `direct_function_delegation`.
- Planned product batch units:
  `backend/src/kloel/unified-agent-process.ts`,
  `backend/src/kloel/unified-agent-execute.ts`,
  `backend/src/kloel/unified-agent.service.ts`.
- Do not materialize a runtime owner class here: the policy measured no strict
  dependency-surface win for class ownership.
- Use the dynamic dependency bundle because the compiled policy measured
  cross-owner dependency bundle economy.
- The shared bundle access mode is `direct_value_bundle`. Do not use a
  getter-heavy `const facade = this` accessor bundle unless the policy compiler
  changes the mode to `accessor_bundle`.
- Product batch units, not per-method micro-writes, define trace economy.
- You are not alone in the codebase. Work only in your worktree and do not
  revert or overwrite work outside this lane.

Validation commands from your worktree:

```sh
npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent
node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/refactor-scorecard.cjs --worktree /private/tmp/kloel-ab137-atomic-20260518070737 --target backend/src/kloel/unified-agent.service.ts --class UnifiedAgentService --spec backend/src/kloel/unified-agent.service.spec.ts --enforce-scope --allow-prefix backend/src/kloel/unified-agent --allow-atomic-traces --fastpath-policy /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-137-codex-20260518070737/atomic-fastpath.json --enforce-fastpath-policy --enforce-target-dominance-release --enforce-facade-private-helper-release --enforce-facade-type-surface-release --enforce-type-spillover-economy --enforce-extraction-economy --enforce-sibling-reuse --enforce-trace-economy --enforce-public-api --json
node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/typecheck-impact-audit.cjs --worktree /private/tmp/kloel-ab137-atomic-20260518070737 --allow-prefix backend/src/kloel/unified-agent --json -- npm --prefix backend run typecheck
git diff --check -- backend/src/kloel
rg -n '(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)' backend/src/kloel/unified-agent* || true
```

Final report:

- List files changed.
- Report first durable code write timestamp if you can identify it.
- Report validation results and any failures.
- Do not commit.
