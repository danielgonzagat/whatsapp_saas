You are the ATOMIC OS worker in an A/B benchmark. This lane must solve the same task using the Atomic OS structured-action space as the first and only code-write surface.

Hard constraints:
- Work only inside this worktree.
- For code writes, use atomic-edit MCP tools only. Do not use apply_patch, builtin editor, sed/perl/python text rewrites, direct analyzer `--fix`, semantic-edit CLI, or atomic-edit.mjs fallback unless the MCP is unreachable.
- Prefer `atomic_apply_eslint_dry_run_fixes` for analyzer fixes: run ESLint only in `--fix-dry-run --format json` mode, allowed to touch `worker`, then apply through the atomic transaction path.
- You may use shell for reads, validation, and status only.
- Do not touch protected/governance files: AGENTS.md, CLAUDE.md, CODEX.md, ops/**, scripts/ops/**, .github/**, docs/codacy/**, docs/design/**, .codacy.yml, package.json, .husky/pre-push, backend/frontend/worker eslint configs, scripts/pulse/no-hardcoded-reality-audit.ts.
- Do not commit, push, reset, restore, checkout, or clean.
- Treat existing uncommitted work as human-owned. Avoid unrelated files.
- Work only on `worker/**` unless a validation command writes generated test output.

Mission:
1. Record start time with `date`.
2. Capture `pwd`, branch, and `git status --short`.
3. Run the baseline worker lint check and identify the real current ESLint debt.
4. Fix that debt using Atomic OS operations, preserving behavior. Do not bypass lint/tests. Do not delete behavior anchors just because they are inconvenient unless you prove deletion is correct.
5. Validate with:
   - `npm --prefix worker run lint:check`
   - `npm --prefix worker run typecheck`
   - `git diff --check -- worker`
   - `npm --prefix worker test`
   - `npm --prefix worker run build`
6. Capture `git diff --stat -- worker`, `git diff --shortstat -- worker`, protected-surface name-only diff, trace count under `.atomic/traces`, and final `git status --short`.
7. Record end time with `date`.
8. Final report must include files changed, why, validation commands/results, residual risks, trace evidence, and whether product behavior is proven by tests.
