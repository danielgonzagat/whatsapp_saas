# Round 127 Atomic Worker Prompt

You are the ATOMIC Codex worker for an A/B benchmark.

You are not alone in the codebase. Work only inside this isolated worktree:

```txt
/private/tmp/kloel-ab127-atomic-20260517234518
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
fastpath_capture=/Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-127-codex-20260517234518/atomic-fastpath.json
delegationShape=runtime_owner_class_delegation
runtimeOwnerClassEconomy.pass=true
firstObservableWriteTarget=backend/src/kloel/unified-agent-process.ts
retainedPublicLeafRuntimeOwnerDelegationPass=true
```

Read the fast-path JSON and follow its generated recipe rather than rediscussing the architecture from scratch. The first durable code write should materialize the generated first write target. If the JSON differs from this prompt, prefer the JSON.

Acceptance:

- Preserve constructor behavior and dependency wiring.
- Preserve public API/signatures used by `backend/src/kloel/unified-agent.service.spec.ts`.
- Keep the facade smaller and more focused.
- Move owner-local private helper/callback surface out of the facade when the generated runtime-owner class plan says it is economical.
- Delegate retained public leaf wrappers through their selected runtime owner when the generated `publicLeafReleaseEconomy.runtimeOwnerDelegationPass` is true.
- Avoid moving unrelated code.
- Do not introduce suppressions such as `as any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `biome-ignore`, `codacy:`, `NOSONAR`, or `noqa`.
- Do not edit protected/governance paths.

Validation to run before final:

```sh
npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent
npm --prefix backend run typecheck
git diff --check -- backend/src/kloel
node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/refactor-scorecard.cjs --worktree /private/tmp/kloel-ab127-atomic-20260517234518 --target backend/src/kloel/unified-agent.service.ts --json
```

Final report must include:

- files changed;
- Atomic tools used;
- validation commands and results;
- first durable code write timestamp if you can determine it;
- any blocker or risk.
