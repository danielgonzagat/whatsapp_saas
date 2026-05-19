Atomic worker. No analysis unless a command fails. No protected edits. No commits/push/reset/restore/checkout/clean. Edit only through the helper.

Run exactly:
1. `date`
2. `pwd`
3. `git branch --show-current`
4. `git status --short`
5. `npm --prefix worker ci`
6. `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-eslint-fix.cjs --cwd worker -- . --fix-dry-run --format json`
7. `npm --prefix worker run lint:check`
8. `npm --prefix worker run typecheck`
9. `git diff --check -- worker`
10. `npm --prefix worker test`
11. `npm --prefix worker run build`
12. `git diff --stat -- worker`
13. `git diff --shortstat -- worker`
14. `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
15. `find .atomic -type f | wc -l`
16. `git status --short`
17. `date`

Final report: max 6 bullets: changed files summary, validations, trace count, risks.
