You are the NORMAL CLI baseline worker in an A/B benchmark. This lane intentionally measures mainstream Codex CLI behavior without the Atomic OS editor.

Hard constraints:
- Work only inside this worktree.
- Do not use atomic-edit MCP tools, semantic-edit, atomic-edit.mjs, or any Atomic OS helper.
- Do not touch protected/governance files: AGENTS.md, CLAUDE.md, CODEX.md, ops/**, scripts/ops/**, .github/**, docs/codacy/**, docs/design/**, .codacy.yml, package.json, .husky/pre-push, backend/frontend/worker eslint configs, scripts/pulse/no-hardcoded-reality-audit.ts.
- Do not commit, push, reset, restore, checkout, or clean.
- Treat existing uncommitted work as human-owned. Avoid unrelated files.
- Work only on these files unless a validation command writes generated test output:
  - `worker/test/channel-dispatcher.spec.ts`
  - `worker/test/openai-models.spec.ts`
  - `worker/test/opportunity-heuristic.spec.ts`

Mission:
1. Record start time with `date`.
2. Capture `pwd`, branch, and `git status --short`.
3. Run targeted baseline lint:
   - `npm --prefix worker exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts`
   - If dependencies are missing, run `npm --prefix worker ci` and rerun the targeted baseline lint.
4. Fix only the real current lint debt in those three files with the normal CLI/tooling path.
5. Preservation requirement: do not delete `mailEnvBackup`, `envBackup`, or `emptyDemographics`. Use those anchors to preserve test isolation/expected shape:
   - `mailEnvBackup` should restore mail env after each test.
   - `envBackup` should restore `process.env` after each test.
   - `emptyDemographics` should be asserted in the empty-message case.
6. Validate with:
   - `npm --prefix worker exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts`
   - `npm --prefix worker run typecheck`
   - `git diff --check -- worker/test/channel-dispatcher.spec.ts worker/test/openai-models.spec.ts worker/test/opportunity-heuristic.spec.ts`
   - `npm --prefix worker test -- test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts`
   - `npm --prefix worker run build`
7. Capture `git diff --stat -- worker/test/channel-dispatcher.spec.ts worker/test/openai-models.spec.ts worker/test/opportunity-heuristic.spec.ts`, `git diff --shortstat -- worker/test/channel-dispatcher.spec.ts worker/test/openai-models.spec.ts worker/test/opportunity-heuristic.spec.ts`, protected-surface name-only diff, and final `git status --short`.
8. Record end time with `date`.
9. Final report must include files changed, why, validation commands/results, residual risks, and whether product behavior is proven by tests.
