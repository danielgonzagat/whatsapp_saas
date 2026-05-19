You are the ATOMIC OS worker in an A/B benchmark. This lane must solve the same task using the Atomic OS structured-action space as the first and only code-write surface.

Hard constraints:
- Work only inside this worktree.
- Do not read CLAUDE.md, AGENTS.md, CODEX.md, skill docs, or run exploratory setup unless a command fails and you need exact recovery context.
- For code writes, use atomic-edit MCP tools only. Do not use apply_patch, builtin editor, sed/perl/python text rewrites, direct analyzer `--fix`, semantic-edit CLI, or atomic-edit.mjs fallback unless the MCP is unreachable.
- Do not run `codex mcp get`, `codex mcp --help`, `require.resolve` probes, tool-listing scripts, or exploratory MCP discovery unless the direct MCP transaction below fails.
- Do not run root `npm ci`, root `npm install`, or any root dependency install. If dependencies are missing, run `npm --prefix worker ci`.
- Do not run full `git diff` or file-scoped full diffs as proof. Use stat/shortstat, validation commands, protected name-only diff, and trace count.
- Do not print tool lists or trace file contents.
- Do not use `nl`, `sed`, or `rg` over changed code for proof after validation unless a validation command fails.
- Do not touch protected/governance files: AGENTS.md, CLAUDE.md, CODEX.md, ops/**, scripts/ops/**, .github/**, docs/codacy/**, docs/design/**, .codacy.yml, package.json, .husky/pre-push, backend/frontend/worker eslint configs, scripts/pulse/no-hardcoded-reality-audit.ts.
- Do not commit, push, reset, restore, checkout, or clean.
- Work only on:
  - `worker/test/channel-dispatcher.spec.ts`
  - `worker/test/openai-models.spec.ts`
  - `worker/test/opportunity-heuristic.spec.ts`

Preservation requirement:
- Do not delete `mailEnvBackup`, `envBackup`, or `emptyDemographics`.
- Preserve each anchor and modify only the smallest surrounding usage needed.

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

Mission:
1. Record start time with `date`; capture `pwd`, branch, and `git status --short`.
2. Run targeted baseline lint exactly as:
   - `(cd worker && npm exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts)`
   - If dependencies are missing, run `npm --prefix worker ci` and rerun the same worker-cwd lint.
3. Fix only the current lint debt in those three files using the direct Atomic OS transaction above.
4. Validate with:
   - `(cd worker && npm exec -- eslint test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts)`
   - `npm --prefix worker run typecheck`
   - `git diff --check -- worker/test/channel-dispatcher.spec.ts worker/test/openai-models.spec.ts worker/test/opportunity-heuristic.spec.ts`
   - `npm --prefix worker test -- test/channel-dispatcher.spec.ts test/openai-models.spec.ts test/opportunity-heuristic.spec.ts`
   - `npm --prefix worker run build`
5. Capture target diff stat/shortstat, protected-surface name-only diff, trace count, final `git status --short`, and end time.
6. Final report must include changed files, why, validation results, risks, trace evidence, and whether behavior is proven by tests.
