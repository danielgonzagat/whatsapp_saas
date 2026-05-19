You are the ATOMIC lane in an A/B benchmark. Work only in the current worktree.

Task: extract `formatPromptValue` from `backend/src/kloel/unified-agent.service.ts`
into a new helper module `backend/src/kloel/unified-agent-runtime.helpers.ts`,
then import it back into the service. Preserve behavior exactly.

Hard rule: this lane is ATOMIC-ONLY. If you use native OpenCode file tools
(`read`, `glob`, `grep`, `list`, `write`, `edit`, `patch`) on code files, the
benchmark auditor marks the lane as failed even if tests pass.

Allowed code-reading and code-mutation surfaces:
- Direct `atomic-edit_*` MCP tools only, especially:
  `atomic-edit_code_outline`, `atomic-edit_code_read_symbol`,
  `atomic-edit_code_file_stat`, `atomic-edit_atomic_create_file`,
  `atomic-edit_atomic_add_import`, `atomic-edit_atomic_edit_symbol`,
  `atomic-edit_atomic_replace_text`.
- If direct MCP path handling is unclear, use:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs <tool> '<json>'`
  with worktree-relative paths. The wrapper resolves paths against the current
  worktree and refuses path escape.

Forbidden in the ATOMIC lane:
- Native `read`, `glob`, `grep`, `list`, `write`, `edit`, `patch`.
- Shell content reads of code files: `cat`, `sed`, `nl`, `awk`, `head`, `tail`,
  `shasum`/hashing a code file directly. Use `atomic-edit_code_file_stat` if
  you need hash/size metadata.
- Shell mutation paths: redirection, heredoc, `tee`, `sed -i`, `perl -pi`,
  Node/Python/Ruby writers, native patching.

Atomic plan:
- Read `formatPromptValue` by symbol.
- Create `backend/src/kloel/unified-agent-runtime.helpers.ts` with
  `atomic_create_file`.
- Add `import { formatPromptValue } from './unified-agent-runtime.helpers';`
  with `atomic_add_import`. It must preserve single quote style.
- Remove only the local `formatPromptValue` symbol with `atomic_edit_symbol`.
- If an `expectedSha256` mismatch happens, re-read with atomic tools and retry
  once.

Expected service change:
- Add the single-quoted import.
- Remove the local helper without leaving an extra blank gap.
- Leave call sites unchanged.

Run only these validation commands after mutation:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `npm --prefix backend run typecheck`
- `git diff --check -- backend/src/kloel`
- `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
- `rg -n "(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)" backend/src/kloel/unified-agent.service.ts backend/src/kloel/unified-agent-runtime.helpers.ts`

Finish with files changed, atomic tools used, validation results,
`atomicModeClean` self-check, and anything not done.
