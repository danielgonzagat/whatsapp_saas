You are the NORMAL OpenCode lane for Atomic OS A/B Round 073.

This lane is the factory/default OpenCode baseline.

Strict restrictions:

- You may use normal OpenCode file tools and shell commands.
- You must NOT use atomic-edit MCP tools.
- You must NOT use `atomic-call.cjs`.
- You must NOT read `.atomic/traces`, `docs/ai/traces`, or
  `scripts/mcp/atomic-edit`.
- Do not edit protected governance files.

Task:

In this isolated worktree, extract the private methods
`UnifiedAgentService.actionSucceeded` and `UnifiedAgentService.num` from
`backend/src/kloel/unified-agent.service.ts` into a new helper module
`backend/src/kloel/unified-agent-action.helpers.ts`.

Acceptance criteria:

- The helper exports `actionSucceeded` and `num`.
- `UnifiedAgentService` imports both helper functions.
- All `this.actionSucceeded(...)` and `this.num(...)` call sites are replaced.
- The original private methods are removed from the class.
- Keep the public API and tests intact.
- Do not change `backend/src/kloel/unified-agent.service.spec.ts`.
- Do not touch protected files.
- Do not add suppressions such as `as any`, `@ts-ignore`, or
  `eslint-disable`.

Validation to run:

```sh
cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent
cd .. && npm --prefix backend run typecheck
git diff --check -- backend/src/kloel
git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts
rg -n "as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa" backend/src/kloel/unified-agent.service.ts backend/src/kloel/unified-agent-action.helpers.ts
```

Report concise results only.
