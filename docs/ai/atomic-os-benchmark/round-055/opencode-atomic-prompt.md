You are the ATOMIC lane in an A/B benchmark. Work only in the current worktree.

Task: extract `formatPromptValue` from `backend/src/kloel/unified-agent.service.ts` into a new helper module `backend/src/kloel/unified-agent-runtime.helpers.ts`, then import it back into the service. Preserve behavior exactly.

Rules:
- All file mutations must use atomic-edit tools only.
- Prefer direct `atomic-edit_*` tools if available and they resolve inside this worktree.
- If calling through bash, use:
  `node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs <tool> '<json>'`
- Do not use the default OpenCode editor, builtin patching, shell redirection, cat heredocs, python writers, perl/sed -i, or any non-atomic mutation path.
- You may read files with rg/sed/nl/read.
- Do not edit protected/governance files.
- Do not change tests unless required by TypeScript.
- Do not run broad refactors.
- Keep the diff minimal.

Use these atomic operations:
1. Create `backend/src/kloel/unified-agent-runtime.helpers.ts` with `atomic_create_file` or the closest available atomic create/write tool.
2. Add `import { formatPromptValue } from './unified-agent-runtime.helpers';` to `backend/src/kloel/unified-agent.service.ts` with an atomic text insertion/replacement tool.
3. Remove only the local `function formatPromptValue(...)` block from `unified-agent.service.ts` with `atomic_replace_text` or equivalent exact atomic replacement.

Expected new file content exactly:

```ts
export function formatPromptValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatPromptValue).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${formatPromptValue(record[key])}`)
      .join(',')}}`;
  }
  if (typeof value === 'string') {
    return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  return Object.prototype.toString.call(value);
}
```

Expected service change:
- Add `import { formatPromptValue } from './unified-agent-runtime.helpers';`
- Remove the local `function formatPromptValue(...)` block from `unified-agent.service.ts`.
- Leave all call sites unchanged.

Validation commands to run:
- `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`
- `npm --prefix backend run typecheck`
- `git diff --check -- backend/src/kloel`
- `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
- `rg -n "(as any|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|biome-ignore|codacy:|NOSONAR|noqa)" backend/src/kloel/unified-agent*.ts`

Finish with a short report:
- files changed
- atomic tools used
- validation results
- anything not done
