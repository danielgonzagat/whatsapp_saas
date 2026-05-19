You are the NORMAL Codex A/B lane in an isolated worktree.

Benchmark exception explicitly authorized by the human: do not use atomic-edit,
semantic-edit, `.atomic` helpers, or atomic MCP tools in this lane. Use the
normal factory Codex editing path available to you. Still obey repository
governance, protected-file rules, non-destructive git discipline, and the
anti-gambiarra rule.

Goal: refactor `backend/src/kloel/unified-agent.service.ts` by decomposing it
into smaller cohesive sibling modules without changing runtime behavior.

Hard requirements:

- Do not edit `backend/src/kloel/unified-agent.service.spec.ts`.
- Keep the public `UnifiedAgentService` class surface unchanged: class name,
  constructor injection, and every public method signature.
- `backend/src/kloel/unified-agent.service.ts` must end at `<= 350` lines.
- Every TypeScript file you create or modify under `backend/src/kloel/` must end
  at `<= 400` lines.
- Do not add `as any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or
  lint suppression comments.
- Do not touch protected governance files.
- Do not commit, push, reset, restore, checkout, or clean.

Suggested validation:

1. If dependencies are missing, run `npm --prefix backend ci`.
2. Run `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`.
3. Run `npm --prefix backend run typecheck`.
4. Run `git diff --check -- backend/src/kloel`.
5. Confirm the line-count requirements with `wc -l`.
6. Confirm the spec file was not modified.

Report start/end time, files changed, validations, and any risks. Keep the
report concise and evidence-based.
