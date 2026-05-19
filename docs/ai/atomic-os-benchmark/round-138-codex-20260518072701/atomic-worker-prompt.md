You are the ATOMIC OS Codex A/B worker for Round 138.

Workspace:

`/private/tmp/kloel-ab138-atomic-20260518072701`

Mission:

Refactor `backend/src/kloel/unified-agent.service.ts` into a smaller service
facade by extracting cohesive runtime/support modules under
`backend/src/kloel/unified-agent*`.

Atomic execution surface:

- Primary brief:
  `/Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-138-codex-20260518072701/atomic-minimal-dispatch-brief.json`
- Full policy lookup only if needed:
  `/Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-138-codex-20260518072701/atomic-fastpath.json`
- Use only Atomic OS mutating tools:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs ...`
- Do not use builtin line patches, raw file writes, `perl -pi`, `sed -i`, or
  shell redirection for code changes.

Execute from the primary brief:

- Make the first durable mutation against `firstDurableMutation.file` once the
  brief's `startNowWhen` evidence is true.
- Continue `firstBatchOrder`.
- Use `dependencyBundleAccessMode`; for this round it is `direct_value_bundle`.
- Use the full policy only if the first mutation is refused, public API
  preservation is ambiguous, or validation fails.

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

Validation commands from your worktree:

```sh
npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent
node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/refactor-scorecard.cjs --worktree /private/tmp/kloel-ab138-atomic-20260518072701 --target backend/src/kloel/unified-agent.service.ts --class UnifiedAgentService --spec backend/src/kloel/unified-agent.service.spec.ts --enforce-scope --allow-prefix backend/src/kloel/unified-agent --allow-atomic-traces --fastpath-policy /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-138-codex-20260518072701/atomic-fastpath.json --enforce-fastpath-policy --enforce-target-dominance-release --enforce-facade-private-helper-release --enforce-facade-type-surface-release --enforce-type-spillover-economy --enforce-extraction-economy --enforce-sibling-reuse --enforce-trace-economy --enforce-public-api --json
node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/typecheck-impact-audit.cjs --worktree /private/tmp/kloel-ab138-atomic-20260518072701 --allow-prefix backend/src/kloel/unified-agent --json -- npm --prefix backend run typecheck
git diff --check -- backend/src/kloel
rg -n '(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)' backend/src/kloel/unified-agent* || true
```

Final report:

- List files changed.
- Report first durable code write timestamp if you can identify it.
- Report validation results and any failures.
- Do not commit.
