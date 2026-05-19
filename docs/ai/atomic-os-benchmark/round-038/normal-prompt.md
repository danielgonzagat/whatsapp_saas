You are the NORMAL CLI baseline worker in an A/B benchmark. This lane intentionally measures mainstream Codex CLI behavior without the Atomic OS editor.

Hard constraints:
- Work only inside this worktree.
- Do not use atomic-edit MCP tools, semantic-edit, atomic-edit.mjs, or any Atomic OS helper.
- Do not touch protected/governance files: AGENTS.md, CLAUDE.md, CODEX.md, ops/**, scripts/ops/**, .github/**, docs/codacy/**, docs/design/**, .codacy.yml, package.json, .husky/pre-push, backend/frontend/worker eslint configs, scripts/pulse/no-hardcoded-reality-audit.ts.
- Do not commit, push, reset, restore, checkout, or clean.
- Work only on:
  - `worker/test/channel-dispatcher.spec.ts`
  - `worker/test/openai-models.spec.ts`
  - `worker/test/opportunity-heuristic.spec.ts`

Mission:
1. Record start time with `date`; capture `pwd`, branch, and `git status --short`.
2. Run targeted baseline lint exactly as:
   - `(cd worker && npm exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts)`
   - If dependencies are missing, run `npm --prefix worker ci` and rerun the same worker-cwd lint.
3. Fix only the current lint debt in those three files using normal CLI/tooling.
4. Preservation requirement: do not delete `mailEnvBackup`, `envBackup`, or `emptyDemographics`; use them for env restoration / expected empty demographics.
5. Validate with:
   - `(cd worker && npm exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts)`
   - `npm --prefix worker run typecheck`
   - `git diff --check -- worker/test/channel-dispatcher.spec.ts worker/test/openai-models.spec.ts worker/test/opportunity-heuristic.spec.ts`
   - `npm --prefix worker test -- test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts`
   - `npm --prefix worker run build`
6. Capture target diff stat/shortstat, protected-surface name-only diff, final `git status --short`, and end time.
7. Final report must include changed files, why, validation results, risks, and whether behavior is proven by tests.
