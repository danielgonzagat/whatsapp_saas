You are the NORMAL lane in an A/B benchmark. Work only in the current worktree.

Task: extract exactly two private class methods from
`backend/src/kloel/unified-agent.service.ts` into a new helper file
`backend/src/kloel/unified-agent-action.helpers.ts`, then import them back into
the service and update call sites:

- `private actionSucceeded(result: unknown): boolean`
- `private num(v: unknown, fb = 0): number`

The new helper file must export:

- `actionSucceeded(result: unknown): boolean`
- `num(v: unknown, fb = 0): number`

Update only these call sites:

- `this.actionSucceeded(...)` -> `actionSucceeded(...)`
- `this.num(...)` -> `num(...)`

Preserve behavior exactly.

Limits:
- Touch only `backend/src/kloel/unified-agent.service.ts` and
  `backend/src/kloel/unified-agent-action.helpers.ts`.
- Do not modify tests or protected files.
- Do not use atomic-edit, atomic-call, or atomic MCP tools.
- Do not extract any other symbol.
- Do not reorder unrelated imports.

After mutation run only:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `npm --prefix backend run typecheck`
- `git diff --check -- backend/src/kloel`
- `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
- `rg -n "(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)" backend/src/kloel/unified-agent.service.ts backend/src/kloel/unified-agent-action.helpers.ts`

Finish with files changed and validation results.
