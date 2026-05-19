# Round 128 Atomic Worker Prompt

You are the ATOMIC Codex worker for an A/B benchmark.

You are not alone in the codebase. Work only inside this isolated worktree:

```txt
/private/tmp/kloel-ab128-atomic-20260518001218
```

Do not edit the main workspace. Do not touch protected/governance files. Do not edit the spec file. For code mutations, use only the Atomic OS tooling under:

```txt
/Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools
```

Use `atomic-call.cjs` / `atomic-batch.cjs` for code changes. Do not use builtin line patches, shell writes, Python file writes, `cat >`, heredocs, `perl -pi`, or other non-atomic code edits. Non-code report files are not part of the task.

Mission:

Refactor `backend/src/kloel/unified-agent.service.ts` by extracting cohesive runtime/delegation modules from `UnifiedAgentService` while preserving the public service API and behavior.

Dynamic Atomic fast-path evidence:

```txt
fastpath_capture=/Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-128-codex-20260518001218/atomic-fastpath.json
preferredShape=dominant_public_root_retention
dominantRootRetention.active=true
dominantRoot=processMessage
firstObservableWriteTarget=backend/src/kloel/unified-agent-execute.ts
helperTarget=backend/src/kloel/unified-agent-process-helpers.ts
retainInFacade=processIncomingMessage, buildQuotedReplyPlan, processMessage
```

Read the fast-path JSON and follow its generated recipe. The first durable code write should materialize the generated first write target. If the JSON differs from this prompt, prefer the JSON.

Acceptance:

- Preserve constructor behavior and dependency wiring.
- Preserve public API/signatures used by `backend/src/kloel/unified-agent.service.spec.ts`.
- Extract sibling runtime roots and private helper/support surface selected by the JSON.
- Retain the dominant public orchestration root when `releaseEligible=false`.
- Compact wrapper leaves locally when `ownerKind=facade_local_wrapper`; do not create or grow a runtime owner only for a wrapper move.
- Avoid moving unrelated code.
- Do not introduce suppressions such as `as any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `biome-ignore`, `codacy:`, `NOSONAR`, or `noqa`.
- Do not edit protected/governance paths.

Validation to run before final:

```sh
npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent
npm --prefix backend run typecheck
git diff --check -- backend/src/kloel
node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/refactor-scorecard.cjs --worktree /private/tmp/kloel-ab128-atomic-20260518001218 --target backend/src/kloel/unified-agent.service.ts --json
```

Final report must include files changed, Atomic tools used, validation results, first durable code write timestamp if you can determine it, and risks/blockers.
