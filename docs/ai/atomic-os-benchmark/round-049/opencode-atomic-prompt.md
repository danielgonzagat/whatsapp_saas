You are the ATOMIC OpenCode A/B lane in an isolated worktree.

Worktree: `/private/tmp/kloel-ab049-atomic-20260516234815`.

Goal: refactor `backend/src/kloel/unified-agent.service.ts` into smaller
sibling modules without changing behavior.

Atomic-only write rules:
- Code writes must use atomic-edit MCP tools or:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs <tool> '<json>'`
- Never use native/builtin file edit, apply_patch, shell heredoc writes,
  `cat >`, `tee`, `sed -i`, `perl -pi`, Node/Python file-write scripts, or any
  normal file writer for code.
- Every atomic `file`, `dir`, `cwd`, and `allowedPaths` argument must be
  absolute and under `/private/tmp/kloel-ab049-atomic-20260516234815`.
- If any atomic result resolves `target.repoRoot` outside this worktree, stop
  and report `WRONG_ROOT_ATOMIC_FAILURE`.

Scope rules:
- Do not commit, push, reset, restore, checkout, clean, or force anything.
- Do not edit protected/governance files.
- Do not edit `backend/src/kloel/unified-agent.service.spec.ts`.
- Preserve public `UnifiedAgentService` class name, constructor injection, and
  public method signatures.
- `unified-agent.service.ts` must end at `<=300` lines.
- Every created/modified `backend/src/kloel/unified-agent*.ts` file must end at
  `<=320` lines.
- Do not add `as any`, ts-ignore/expect-error/nocheck, lint/Codacy
  suppressions, `NOSONAR`, or `noqa`.
- This prompt is the operating contract. Do not spend time re-reading long
  governance files unless a command output forces it.

Compact extraction map:
- Keep constructor, `processIncomingMessage`, `executeTool`, and
  `buildQuotedReplyPlan` in the service.
- Extract `processMessage` workflow to `unified-agent-message-processor.ts`.
- Extract `executeToolAction` switch to `unified-agent-tool-router.ts`.
- Extract shared helpers to `unified-agent-runtime.helpers.ts` or
  `unified-agent.shared.ts`; split helpers before any file exceeds 320 lines.
- Read minimally: one outline/read of the service, then mutate with atomic
  operators. Use validation commands for proof.

Validation:
1. Record start/end time.
2. Run `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`.
3. Run `npm --prefix backend run typecheck`.
4. Run `git diff --check -- backend/src/kloel`.
5. Confirm the spec has no diff.
6. Confirm protected diff is empty.
7. Run:
   `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/trace-isolation-check.cjs --worktree /private/tmp/kloel-ab049-atomic-20260516234815 --coordinator /Users/danielpenin/whatsapp_saas --since '<your start time>' --json`
8. Report service line count, largest helper line count, MCP/trace count, exact
   validation results, risks, and final `git status --short`.
