You are the NORMAL Codex CLI worker in an isolated A/B benchmark.

Worktree: `/private/tmp/kloel-ab048-normal-20260516234505`.

Goal: refactor `backend/src/kloel/unified-agent.service.ts` into smaller sibling
modules without changing behavior.

Rules:

- Use normal factory Codex editing. Do not use atomic-edit, semantic-edit,
  `.atomic` helpers, MCP atomic tools, or `docs/ai/atomic-os-benchmark/tools/*`.
- Do not commit, push, reset, restore, checkout, clean, or force anything.
- Do not edit protected/governance files.
- Do not edit `backend/src/kloel/unified-agent.service.spec.ts`.
- Preserve public `UnifiedAgentService` class name, constructor injection, and
  public method signatures.
- `backend/src/kloel/unified-agent.service.ts` must end at `<=350` lines.
- Every created/modified `backend/src/kloel/unified-agent*.ts` file must end at
  `<=400` lines.
- Do not add `as any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, lint
  suppressions, Codacy suppressions, `NOSONAR`, or `noqa`.

Validation:

1. Record start/end time.
2. If `backend/node_modules` is missing, run `npm --prefix backend ci`.
3. Run `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`.
4. Run `npm --prefix backend run typecheck`.
5. Run `git diff --check -- backend/src/kloel`.
6. Confirm the spec has no diff.
7. Confirm protected diff is only pre-existing, if any.
8. Report service line count, largest helper line count, files changed, exact
   validation results, risks, and final `git status --short`.

