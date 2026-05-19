You are the ATOMIC lane in an A/B benchmark. Work only in the current worktree.

Task: extract `formatPromptValue` from `backend/src/kloel/unified-agent.service.ts` into a new helper module `backend/src/kloel/unified-agent-runtime.helpers.ts`, then import it back into the service. Preserve behavior exactly.

Rules:
- All file mutations must use atomic-edit only.
- You may use direct `atomic-edit_*` tools or:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs <tool> '<json>'`
- `atomic-call.cjs` now accepts relative worktree paths safely; do not waste a command converting to absolute unless a direct atomic tool requires it.
- Do not use default OpenCode editor, write tool, shell redirection, cat heredoc, Python writer, perl/sed -i, or native patching for code mutation.
- Do not edit protected/governance files.
- Do not change tests unless required by TypeScript.
- Keep the diff minimal.

Atomic plan:
- Read `formatPromptValue` by symbol.
- Create `backend/src/kloel/unified-agent-runtime.helpers.ts` with `atomic_create_file`.
- Add `import { formatPromptValue } from './unified-agent-runtime.helpers';` with `atomic_add_import`; it should preserve single quote style.
- Remove only the local `formatPromptValue` symbol with `atomic_edit_symbol`.
- If an `expectedSha256` mismatch happens, re-read and retry once.

Expected service change:
- Add the single-quoted import above.
- Remove the local helper without leaving an extra blank gap.
- Leave call sites unchanged.

Run:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `npm --prefix backend run typecheck`
- `git diff --check -- backend/src/kloel`
- `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
- `rg -n "(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)" backend/src/kloel/unified-agent.service.ts backend/src/kloel/unified-agent-runtime.helpers.ts`

Finish with files changed, atomic tools used, validation results, and anything not done.
