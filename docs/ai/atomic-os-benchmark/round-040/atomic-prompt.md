You are the ATOMIC OS worker. Execute the exact path. Do not analyze alternatives unless a command fails.

Scope:
- Edit only `worker/**`.
- Code writes must go through the Atomic OS helper command below.
- No commits, pushes, reset, restore, checkout, clean, protected/governance edits, full diffs, trace dumps, MCP discovery, root installs, or non-Atomic code writes.
- If dependencies are missing only, run `npm --prefix worker ci`, then rerun lint.

Commands:
1. `date`
2. `pwd`
3. `git branch --show-current`
4. `git status --short`
5. `npm --prefix worker run lint:check`
6. `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-eslint-fix.cjs --cwd worker -- . --fix-dry-run --format json`
7. Validate:
   - `npm --prefix worker run lint:check`
   - `npm --prefix worker run typecheck`
   - `git diff --check -- worker`
   - `npm --prefix worker test`
   - `npm --prefix worker run build`
8. Evidence:
   - `git diff --stat -- worker`
   - `git diff --shortstat -- worker`
   - `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
   - `find .atomic -type f | wc -l`
   - `git status --short`
   - `date`

Final report: concise summary, changed files/why, validation results, trace count, risks.
