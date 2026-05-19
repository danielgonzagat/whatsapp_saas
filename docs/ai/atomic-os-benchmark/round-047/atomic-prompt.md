You are the ATOMIC OS Codex CLI worker in an isolated A/B benchmark.

Worktree: `/private/tmp/kloel-ab047-atomic-20260516234217`.

Goal: refactor `backend/src/kloel/unified-agent.service.ts` into smaller sibling
modules without changing behavior.

Atomic-only write rules:

- Code writes must use atomic-edit MCP tools or:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs <tool> '<json>'`
- Prefer batch wrapper when making more than one MCP call:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-batch.cjs <calls.json|calls.jsonl|->`
- Never use native/builtin file edit, apply_patch, shell heredoc writes, `cat >`,
  `tee`, `sed -i`, `perl -pi`, Node/Python file-write scripts, or any normal
  file writer for code.
- Every MCP `file`, `dir`, `cwd`, and `allowedPaths` argument must be absolute
  and under `/private/tmp/kloel-ab047-atomic-20260516234217`.
- If any atomic result resolves `target.repoRoot` outside this worktree, stop and
  report `WRONG_ROOT_ATOMIC_FAILURE`.

Scope rules:

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

Compact extraction map:

- Keep constructor, `processIncomingMessage`, `executeTool`, and
  `buildQuotedReplyPlan` in the service.
- Extract `processMessage` workflow to `unified-agent-message-processor.ts`.
- Extract `executeToolAction` switch to `unified-agent-tool-router.ts`.
- Extract tiny shared/runtime helpers to `unified-agent-runtime.helpers.ts` or
  `unified-agent.shared.ts`; avoid one 350+ line helper if practical.
- Do not rediscover governance docs; this prompt is the operating contract.
- Read minimally: one outline/read of the service, then mutate. Use validation
  commands for proof instead of full-diff loops.

Validation:

1. Record start/end time.
2. If `backend/node_modules` is missing, run `npm --prefix backend ci`.
3. Run `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`.
4. Run `npm --prefix backend run typecheck`.
5. Run `git diff --check -- backend/src/kloel`.
6. Confirm the spec has no diff.
7. Confirm protected diff is only pre-existing, if any.
8. Run:
   `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/trace-isolation-check.cjs --worktree /private/tmp/kloel-ab047-atomic-20260516234217 --coordinator /Users/danielpenin/whatsapp_saas --since '<your start time>' --json`
9. Report service line count, largest helper line count, MCP/trace count, exact
   validation results, risks, and final `git status --short`.

