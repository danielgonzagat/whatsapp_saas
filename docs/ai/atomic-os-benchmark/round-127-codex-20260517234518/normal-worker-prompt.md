# Round 127 Normal Worker Prompt

You are the NORMAL Codex worker for an A/B benchmark.

You are not alone in the codebase. Work only inside this isolated worktree:

```txt
/private/tmp/kloel-ab127-normal-20260517234518
```

Do not edit the main workspace. Do not touch protected/governance files. Do not edit the spec file. Do not use any Atomic OS tooling: no `atomic-call.cjs`, no `atomic-batch.cjs`, no `atomic-edit`, no `semantic-edit`, and no MCP atomic-edit tools. Use the standard Codex path and normal repo tooling.

Mission:

Refactor `backend/src/kloel/unified-agent.service.ts` by extracting cohesive runtime/delegation modules from `UnifiedAgentService` while preserving the public service API and behavior.

Acceptance:

- Preserve constructor behavior and dependency wiring.
- Preserve public API/signatures used by `backend/src/kloel/unified-agent.service.spec.ts`.
- Keep the facade smaller and more focused.
- Avoid moving unrelated code.
- Do not introduce suppressions such as `as any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `biome-ignore`, `codacy:`, `NOSONAR`, or `noqa`.
- Do not edit protected/governance paths.

Validation to run before final:

```sh
npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent
npm --prefix backend run typecheck
git diff --check -- backend/src/kloel
```

Final report must include:

- files changed;
- validation commands and results;
- first durable code write timestamp if you can determine it;
- any blocker or risk.
