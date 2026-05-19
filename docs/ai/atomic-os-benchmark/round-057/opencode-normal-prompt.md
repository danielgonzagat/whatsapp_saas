You are the NORMAL lane in an A/B benchmark. Work only in the current worktree.

Task: extract `formatPromptValue` from `backend/src/kloel/unified-agent.service.ts`
into a new helper module `backend/src/kloel/unified-agent-runtime.helpers.ts`,
then import it back into the service. Preserve behavior exactly.

Rules:
- Use factory OpenCode behavior. Do not use atomic-edit MCP tools, semantic-edit,
  atomic-edit.mjs, `.atomic` helpers, or
  `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`.
- Do not edit protected/governance files.
- Do not change tests unless TypeScript forces it.
- Keep the diff minimal.

Expected service change:
- Add `import { formatPromptValue } from './unified-agent-runtime.helpers';`.
- Remove only the local `formatPromptValue` function.
- Leave call sites unchanged.

Run:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `npm --prefix backend run typecheck`
- `git diff --check -- backend/src/kloel`
- `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
- `rg -n "(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)" backend/src/kloel/unified-agent.service.ts backend/src/kloel/unified-agent-runtime.helpers.ts`

Finish with files changed, tools used, validation results and anything not done.
