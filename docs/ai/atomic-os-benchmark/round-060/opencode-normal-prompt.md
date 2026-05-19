You are the NORMAL lane in an A/B benchmark. Work only in the current worktree.

Task: extract only `formatPromptValue` from
`backend/src/kloel/unified-agent.service.ts` into
`backend/src/kloel/unified-agent-runtime.helpers.ts`, then import it back into
the service. Preserve behavior exactly.

This is a two-file extraction, not a service decomposition.

Hard acceptance limits:
- Touch exactly these two Kloel source files and no others:
  - `backend/src/kloel/unified-agent.service.ts`
  - `backend/src/kloel/unified-agent-runtime.helpers.ts`
- Do not create shared/router/processor/flow/helper files other than
  `unified-agent-runtime.helpers.ts`.
- Do not modify tests.
- Do not modify protected/governance files.
- If you believe more files are needed, stop and report that the task cannot be
  completed inside scope. Do not widen scope.
- The benchmark rejects this lane if more than two Kloel source files are
  touched or if it times out.

NORMAL rule:
- Use the standard OpenCode file tools as you normally would.
- Do not use atomic-edit, atomic-call, or atomic MCP tools.

Expected service change:
- Add the single-quoted import.
- Remove only the local helper.
- Leave call sites unchanged.
- Do not perform cosmetic whitespace cleanup unless `git diff --check`,
  TypeScript, or Jest fails.

Run only these validation commands after mutation:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `npm --prefix backend run typecheck`
- `git diff --check -- backend/src/kloel`
- `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
- `rg -n "(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)" backend/src/kloel/unified-agent.service.ts backend/src/kloel/unified-agent-runtime.helpers.ts`

Finish with files changed, validation results, and whether the two-file scope
limit was kept.
