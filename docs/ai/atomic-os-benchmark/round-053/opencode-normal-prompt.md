You are the NORMAL OpenCode A/B lane in an isolated worktree.

Worktree: `/private/tmp/kloel-ab053-normal-20260517075310`.

Goal: behavior-preserving multi-file refactor in `backend/src/kloel`.

Exact task:
- Move the top-level helper function `formatPromptValue` out of
  `unified-agent.service.ts` into a new sibling file
  `unified-agent-runtime.helpers.ts`.
- Export `formatPromptValue` from the new helper file and import it back in
  `unified-agent.service.ts`.
- Do not move anything else unless required for this exact extraction.

Rules:
- Use normal factory OpenCode editing only. Do not use atomic-edit,
  semantic-edit, `.atomic` helpers, MCP atomic tools, or
  `docs/ai/atomic-os-benchmark/tools/*`.
- Do not commit, push, reset, restore, checkout, clean, or force anything.
- Do not edit protected/governance files.
- Do not edit `backend/src/kloel/unified-agent.service.spec.ts`.
- Do not change public class/method signatures.
- Do not add `as any`, ts-ignore/expect-error/nocheck, lint/Codacy
  suppressions, `NOSONAR`, or `noqa`.
- Read only what is needed for this exact extraction.

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
7. Report line counts, files changed, exact validation results, risks, and
   final `git status --short`.
