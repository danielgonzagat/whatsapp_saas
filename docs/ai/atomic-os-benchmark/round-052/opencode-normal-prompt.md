You are the NORMAL OpenCode A/B lane in an isolated worktree.

Worktree: `/private/tmp/kloel-ab052-normal-20260517074551`.

Goal: refactor `backend/src/kloel/unified-agent.service.ts` into smaller
sibling modules without changing behavior.

Rules:
- Use normal factory OpenCode editing only. Do not use atomic-edit,
  semantic-edit, `.atomic` helpers, MCP atomic tools, or
  `docs/ai/atomic-os-benchmark/tools/*`.
- Do not commit, push, reset, restore, checkout, clean, or force anything.
- Do not edit protected/governance files.
- Do not edit `backend/src/kloel/unified-agent.service.spec.ts`.
- Preserve public `UnifiedAgentService` class name, constructor injection, and
  public method signatures.
- `unified-agent.service.ts` must end at `<=350` lines.
- Every created/modified `backend/src/kloel/unified-agent*.ts` file must end at
  `<=400` lines.
- Keep largest helper `<=320` lines if practical.
- Do not add `as any`, ts-ignore/expect-error/nocheck, lint/Codacy
  suppressions, `NOSONAR`, or `noqa`.
- This prompt is the operating contract. Do not spend time re-reading long
  governance files unless a command output forces it.

Preferred decomposition map:
- Keep constructor, `processIncomingMessage`, `executeTool`, and
  `buildQuotedReplyPlan` in the service.
- Extract `processMessage` workflow to a message processor helper.
- Extract `executeToolAction` switch to a tool router helper.
- Extract tiny runtime/shared helpers separately if needed.

Validation:
1. Record start/end time.
2. Run `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`.
3. Run `npm --prefix backend run typecheck`.
4. Run `git diff --check -- backend/src/kloel`.
5. Confirm the spec has no diff.
6. Confirm protected diff is empty.
7. Report service line count, largest helper line count, files changed, exact
   validation results, risks, and final `git status --short`.
