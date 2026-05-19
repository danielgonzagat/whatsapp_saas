You are the ATOMIC lane in an A/B benchmark. Work only in the current worktree.

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
  touched, if it times out, or if `atomicModeClean` is false.

ATOMIC-ONLY rule:
- Do not use native OpenCode file tools on code files: `read`, `glob`, `grep`,
  `list`, `write`, `edit`, `patch`.
- Do not use shell content reads of code files or tooling files: `cat`, `sed`,
  `nl`, `awk`, `head`, `tail`, direct hashing.
- Do not pipe `atomic-call.cjs` output into `head`, `tail`, `sed`, `awk`, or
  `nl`; that can mask failed exit codes.
- Do not use shell mutation paths: redirection, `tee`, `sed -i`, `perl -pi`,
  Node/Python/Ruby writers, native patching.

Allowed code-reading and code-mutation surfaces:
- Direct `atomic-edit_*` MCP tools when available.
- Or wrapper:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs <tool|batch> '<json>'`

Use `batch` for grouped atomic operations. Preferred single-call workflow:
- One batch for `code_read_symbol` + `code_file_stat` as needed.
- One batch for `atomic_create_file` + `atomic_add_import` + `atomic_edit_symbol`.
- Optional third single command only for validation-independent atomic inspection
  if the first batch output is insufficient.

Canonical batch example:
`node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs batch '[{"tool":"code_read_symbol","args":{"file":"backend/src/kloel/unified-agent.service.ts","selector":"formatPromptValue"}},{"tool":"code_file_stat","args":{"file":"backend/src/kloel/unified-agent.service.ts"}},{"tool":"code_file_stat","args":{"file":"backend/src/kloel/unified-agent-runtime.helpers.ts"}}]'`

Canonical mutation tools:
- `atomic_create_file` with `{ "file": "...", "content": "..." }`
- `atomic_add_import` with `{ "file": "...", "name": "formatPromptValue", "module": "./unified-agent-runtime.helpers" }`
- `atomic_edit_symbol` with `{ "file": "...", "selector": "formatPromptValue", "op": "remove" }`

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

Finish with files changed, atomic tools used, validation results,
`atomicModeClean` self-check, and whether the two-file scope limit was kept.
