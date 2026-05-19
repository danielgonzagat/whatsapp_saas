You are the NORMAL CLI baseline worker in an A/B benchmark. This lane intentionally measures mainstream Codex CLI behavior without the Atomic OS editor.

Hard constraints:
- Work only inside this worktree.
- Do not use atomic-edit MCP tools, semantic-edit, atomic-edit.mjs, or any Atomic OS helper.
- Do not touch protected/governance files: AGENTS.md, CLAUDE.md, CODEX.md, ops/**, scripts/ops/**, .github/**, docs/codacy/**, docs/design/**, .codacy.yml, package.json, .husky/pre-push, backend/frontend/worker eslint configs, scripts/pulse/no-hardcoded-reality-audit.ts.
- Do not commit, push, reset, restore, checkout, or clean.
- Treat existing uncommitted work as human-owned. Avoid unrelated files.
- Work only on `worker/**` unless a validation command writes generated test output.

Mission:
1. Record start time with `date`.
2. Capture `pwd`, branch, and `git status --short`.
3. Run the baseline worker lint check and identify the real current ESLint debt.
4. Fix that debt with the normal CLI/tooling path, preserving behavior. Do not bypass lint/tests. Do not delete behavior anchors just because they are inconvenient unless you prove deletion is correct.
5. Validate with:
   - `npm --prefix worker run lint:check`
   - `npm --prefix worker run typecheck`
   - `git diff --check -- worker`
   - `npm --prefix worker test`
   - `npm --prefix worker run build`
6. Capture `git diff --stat -- worker`, `git diff --shortstat -- worker`, protected-surface name-only diff, and final `git status --short`.
7. Record end time with `date`.
8. Final report must include files changed, why, validation commands/results, residual risks, and whether product behavior is proven by tests.
