You are the ATOMIC OS worker. Execute the exact path. Do not analyze alternatives unless a command fails.

Scope:
- Edit only:
  - `worker/test/channel-dispatcher.spec.ts`
  - `worker/test/openai-models.spec.ts`
  - `worker/test/opportunity-heuristic.spec.ts`
- Preserve `mailEnvBackup`, `envBackup`, and `emptyDemographics`; use them, do not delete them.
- No commits, pushes, reset, restore, checkout, clean, protected/governance edits, full diffs, trace dumps, MCP discovery, root installs, or non-Atomic code writes.

Commands:
1. `date`
2. `pwd`
3. `git branch --show-current`
4. `git status --short`
5. `(cd worker && npm exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts)`
6. If dependencies are missing only: `npm --prefix worker ci`, then rerun command 5.
7. Apply the direct Atomic OS transaction below.
8. Validate:
   - `(cd worker && npm exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts)`
   - `npm --prefix worker run typecheck`
   - `git diff --check -- worker/test/channel-dispatcher.spec.ts worker/test/openai-models.spec.ts worker/test/opportunity-heuristic.spec.ts`
   - `npm --prefix worker test -- test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts`
   - `npm --prefix worker run build`
9. Evidence:
   - `git diff --stat -- worker/test/channel-dispatcher.spec.ts worker/test/openai-models.spec.ts worker/test/opportunity-heuristic.spec.ts`
   - `git diff --shortstat -- worker/test/channel-dispatcher.spec.ts worker/test/openai-models.spec.ts worker/test/opportunity-heuristic.spec.ts`
   - `git diff --name-only -- AGENTS.md CLAUDE.md CODEX.md ops scripts/ops .github docs/codacy docs/design .codacy.yml package.json .husky/pre-push backend/eslint.config.mjs frontend/eslint.config.mjs worker/eslint.config.mjs scripts/pulse/no-hardcoded-reality-audit.ts`
   - `find .atomic -type f | wc -l`
   - `git status --short`
   - `date`

Direct Atomic OS transaction:

```sh
node <<'NODE'
const { createRequire } = require('node:module');
const requireFromRepo = createRequire('/Users/danielpenin/whatsapp_saas/package.json');
const { Client } = requireFromRepo('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireFromRepo('@modelcontextprotocol/sdk/client/stdio.js');
const worktree = process.cwd();

(async () => {
  const client = new Client({ name: 'codex-atomic-worker', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'bash',
    args: ['/Users/danielpenin/whatsapp_saas/scripts/mcp/atomic-edit-mcp-launcher.sh'],
  });
  await client.connect(transport);
  const result = await client.callTool({
    name: 'atomic_apply_eslint_dry_run_fixes',
    arguments: {
      cwd: `${worktree}/worker`,
      args: [
        'test/channel-dispatcher.spec.ts',
        'test/openai-models.spec.ts',
        'test/opportunity-heuristic.spec.ts',
        '--fix-dry-run',
        '--format',
        'json',
      ],
      allowedPaths: [
        `${worktree}/worker/test/channel-dispatcher.spec.ts`,
        `${worktree}/worker/test/openai-models.spec.ts`,
        `${worktree}/worker/test/opportunity-heuristic.spec.ts`,
      ],
      preview: false,
    },
  });
  console.log(result.content?.map((part) => part.text || '').join('\n') || '');
  await client.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
```

Final report: concise summary, changed files/why, validation results, trace count, risks.
