You are the NORMAL lane in an A/B benchmark. Work only in the current worktree.

Task: extract only `formatPromptValue` from
`backend/src/kloel/unified-agent.service.ts` into
`backend/src/kloel/unified-agent-runtime.helpers.ts`, then import it back into
the service. Preserve behavior exactly.

Limits:
- Touch only `backend/src/kloel/unified-agent.service.ts` and
  `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Do not modify tests or protected files.
- Do not use atomic-edit, atomic-call, or atomic MCP tools.

After mutation run only:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `npm --prefix backend run typecheck`
- `git diff --check -- backend/src/kloel`
- `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
- `rg -n "(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)" backend/src/kloel/unified-agent.service.ts backend/src/kloel/unified-agent-runtime.helpers.ts`

Finish with files changed and validation results.
