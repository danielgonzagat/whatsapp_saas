You are the ATOMIC lane in an A/B benchmark. Work only in the current worktree.

Task: extract `formatPromptValue` from
`backend/src/kloel/unified-agent.service.ts` to
`backend/src/kloel/unified-agent-runtime.helpers.ts`, import it back, preserve
behavior.

First command MUST be exactly this. No `git status`, `ls`, read, glob, grep,
cat, sed, head, tail, nl, awk, hashing, or exploration before it:

`node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_symbol_to_file '{"sourceFile":"backend/src/kloel/unified-agent.service.ts","targetFile":"backend/src/kloel/unified-agent-runtime.helpers.ts","selector":"formatPromptValue","importName":"formatPromptValue","importModule":"./unified-agent-runtime.helpers"}'`

Native OpenCode file tools are forbidden on code: `read`, `glob`, `grep`,
`list`, `write`, `edit`, `patch`. Shell mutation/read paths are forbidden.
Touch only the two target Kloel files plus `.atomic/traces`.

After mutation run only:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `npm --prefix backend run typecheck`
- `git diff --check -- backend/src/kloel`
- `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
- `rg -n "(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)" backend/src/kloel/unified-agent.service.ts backend/src/kloel/unified-agent-runtime.helpers.ts`

Finish with files changed, atomic tools used, validation results and
`atomicModeClean=true/false`.
