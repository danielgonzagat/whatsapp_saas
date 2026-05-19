You are the ATOMIC OS worker in an A/B benchmark.

Worktree: `/private/tmp/kloel-ab045-atomic-20260516230907`.

Goal: refactor `backend/src/kloel/unified-agent.service.ts` into smaller sibling
modules without changing behavior.

Hard requirements:

- Use Atomic OS structured-action-space writes only: `atomic-edit` MCP tools or
  `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`.
- Do not use builtin/native file edits, `apply_patch`, shell heredoc writes,
  `cat >`, `perl -pi`, `sed -i`, or line-oriented patching for code.
- Every MCP `file`, `dir`, `cwd`, and `allowedPaths` argument must be an
  absolute path under `/private/tmp/kloel-ab045-atomic-20260516230907`.
- For any shell-driven MCP call, use the wrapper:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs <tool> '<json>'`.
  The wrapper refuses relative paths and paths outside this worktree.
- If any atomic tool resolves `target.repoRoot` outside this worktree, stop and
  report failure. Do not repair by touching the coordinator checkout.
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
- Read the target through `code_outline`/`code_read_symbol` with absolute paths.
- Prefer one cohesive extraction plan; avoid exploratory full-file dumps.

Validation:

1. If `backend/node_modules` is missing, run `npm --prefix backend ci`.
2. Run `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`.
3. Run `npm --prefix backend run typecheck`.
4. Run `git diff --check -- backend/src/kloel`.
5. Run line counts for the touched files.
6. Confirm the spec has no diff.
7. Confirm protected diff is only pre-existing, if any.
8. Count `.atomic/traces` inside this worktree.
9. Confirm there are no new files/traces under `/Users/danielpenin/whatsapp_saas/.atomic/traces` from your run.

Final report: include start/end time, files changed, validations with exact
status, service line count, largest helper line count, trace count, risks, and
whether any protected file was already dirty before your edits.
