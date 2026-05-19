You are the NORMAL CLI worker in an A/B benchmark.

Worktree: `/private/tmp/kloel-ab045-normal-20260516230907`.

Goal: refactor `backend/src/kloel/unified-agent.service.ts` into smaller sibling
modules without changing behavior.

Hard requirements:

- Use normal Codex tools. Do not use `atomic-edit`, MCP atomic tools, semantic
  edit, or `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`.
- Do not commit, push, reset, restore, checkout, clean, or force anything.
- Do not edit protected/governance files: `AGENTS.md`, `CLAUDE.md`, `CODEX.md`,
  `ops/**`, `scripts/ops/**`, `.github/**`, `docs/codacy/**`, `docs/design/**`,
  `.codacy.yml`, `package.json`, `.husky/pre-push`, eslint configs,
  `scripts/pulse/no-hardcoded-reality-audit.ts`.
- Do not edit `backend/src/kloel/unified-agent.service.spec.ts`.
- Keep public `UnifiedAgentService` class name, constructor injection, and public
  method signatures unchanged.
- `backend/src/kloel/unified-agent.service.ts` must end at `<=350` lines.
- Every created/modified `backend/src/kloel/unified-agent*.ts` file must end at
  `<=400` lines.
- Do not add `as any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, lint
  suppressions, Codacy suppressions, `NOSONAR`, or `noqa`.

Token discipline:

- The operating context is in this prompt. Avoid long governance/skill reads
  unless a command fails and exact recovery context is needed.
- Prefer structured, focused reads of the target service and adjacent extracted
  helpers.

Validation:

1. If `backend/node_modules` is missing, run `npm --prefix backend ci`.
2. Run `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`.
3. Run `npm --prefix backend run typecheck`.
4. Run `git diff --check -- backend/src/kloel`.
5. Run line counts for the touched files.
6. Confirm the spec has no diff.
7. Confirm protected diff is only pre-existing, if any.

Final report: include start/end time, files changed, validations with exact
status, service line count, largest helper line count, risks, and whether any
protected file was already dirty before your edits.
