You are the NORMAL lane in an A/B benchmark. Work only in the current worktree.

Task: extract `formatPromptValue` from `backend/src/kloel/unified-agent.service.ts` into a new helper module `backend/src/kloel/unified-agent-runtime.helpers.ts`, then import it back into the service. Preserve behavior exactly.

Rules:
- Do not use atomic-edit, semantic-edit, atomic-call, or any `atomic-edit__*` tool.
- Use the default OpenCode editing path only.
- Do not edit protected/governance files.
- Do not change tests unless required by TypeScript.
- Do not run broad refactors.
- Keep the diff minimal.

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
- validation results
- anything not done
