You are the NORMAL OpenCode lane for Atomic OS A/B Round 071.

Mission: repeat Round 069 exactly. In this isolated worktree, extract the
private `UnifiedAgentService` class methods `actionSucceeded` and `num` from
`backend/src/kloel/unified-agent.service.ts` into a new helper file:

`backend/src/kloel/unified-agent-action.helpers.ts`

NORMAL lane rule:

- You may use normal OpenCode reads, edits, shell commands, and native file
  operations.
- You must not use `atomic-edit`, `atomic-call.cjs`, `.atomic`, `docs/ai/traces`,
  or `scripts/mcp/atomic-edit`.
- If any atomic tool or atomic trace surface is used, this lane is invalid.

Requirements:

- Export top-level functions `actionSucceeded` and `num` from the helper.
- Import both functions in `unified-agent.service.ts`.
- Replace `this.actionSucceeded(...)` with `actionSucceeded(...)`.
- Replace `this.num(...)` with `num(...)`.
- Remove the original private methods from the class.
- Preserve behavior and keep the diff small.
- Do not touch protected/governance files.
- Do not change tests.

Validation to run before final:

- `npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `npm --prefix backend run typecheck`
- `git diff --check -- backend/src/kloel`
- `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
- `rg -n "as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa" backend/src/kloel/unified-agent.service.ts backend/src/kloel/unified-agent-action.helpers.ts`

Report commands/results briefly. If typecheck fails outside touched files, report
the exact external error and keep the implementation intact.
