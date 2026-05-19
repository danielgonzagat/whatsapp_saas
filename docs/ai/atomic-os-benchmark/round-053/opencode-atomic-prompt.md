You are the ATOMIC OpenCode A/B lane in an isolated worktree.

Worktree: `/private/tmp/kloel-ab053-atomic-20260517075310`.

Goal: behavior-preserving multi-file refactor in `backend/src/kloel`.

Exact task:
- Move the top-level helper function `formatPromptValue` out of
  `unified-agent.service.ts` into a new sibling file
  `unified-agent-runtime.helpers.ts`.
- Export `formatPromptValue` from the new helper file and import it back in
  `unified-agent.service.ts`.
- Do not move anything else unless required for this exact extraction.

Atomic-only write rules:
- Code writes must use atomic-edit MCP tools or:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs <tool> '<json>'`
- Never use native/builtin file edit, apply_patch, shell heredoc writes,
  `cat >`, `tee`, `sed -i`, `perl -pi`, Node/Python file-write scripts, or any
  normal file writer for code.
- Every atomic `file`, `dir`, `cwd`, and `allowedPaths` argument must be
  absolute and under `/private/tmp/kloel-ab053-atomic-20260517075310`.
- If any atomic result resolves outside this worktree, stop and report
  `WRONG_ROOT_ATOMIC_FAILURE`.

Scope rules:
- Do not commit, push, reset, restore, checkout, clean, or force anything.
- Do not edit protected/governance files.
- Do not edit `backend/src/kloel/unified-agent.service.spec.ts`.
- Do not change public class/method signatures.
- Do not add `as any`, ts-ignore/expect-error/nocheck, lint/Codacy
  suppressions, `NOSONAR`, or `noqa`.
- Use one outline/read, then mutate with the highest faithful atomic operator.

Acceptance:
- `unified-agent.service.ts` loses the helper body and compiles through import.
- New helper file exists and is under 80 lines.
- Jest/typecheck/diff-check pass.

Validation:
1. Record start/end time.
2. Run `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`.
3. Run `npm --prefix backend run typecheck`.
4. Run `git diff --check -- backend/src/kloel`.
5. Confirm the spec has no diff.
6. Confirm protected diff is empty.
7. Run:
   `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/trace-isolation-check.cjs --worktree /private/tmp/kloel-ab053-atomic-20260517075310 --coordinator /Users/danielpenin/whatsapp_saas --since '<your start time>' --json`
8. Report line counts, MCP/trace count, exact validation results, risks, and
   final `git status --short`.
