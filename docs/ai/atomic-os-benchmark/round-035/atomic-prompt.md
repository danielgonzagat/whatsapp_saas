You are the ATOMIC OS worker in an A/B benchmark. This lane must solve the same task using the Atomic OS structured-action space as the first and only code-write surface.

Hard constraints:
- Work only inside this worktree.
- The required operating context is already in this prompt. Do not spend setup reads on CLAUDE.md, AGENTS.md, CODEX.md, or skill docs unless a command fails and you need exact recovery context.
- For code writes, use atomic-edit MCP tools only. Do not use apply_patch, builtin editor, sed/perl/python text rewrites, direct analyzer `--fix`, semantic-edit CLI, or atomic-edit.mjs fallback unless the MCP is unreachable.
- Do not run `codex mcp get`, `codex mcp --help`, `require.resolve` probes, tool-listing scripts, or exploratory MCP discovery unless the direct MCP transaction below fails.
- Do not run root `npm ci`, root `npm install`, or any root dependency install. If the baseline lint command fails because worker dependencies are missing, run `npm --prefix worker ci` and rerun the baseline lint. The MCP SDK must be resolved through the canonical repo require path in the snippet below.
- Use the direct one-shot stdio MCP transaction below after baseline lint identifies the debt. This invokes the configured shared Atomic OS MCP server without discovery overhead.
- You may use shell for reads, validation, and status only.
- Do not run full `git diff` or file-scoped `git diff -- <path>` as proof. The Atomic OS trust surface is `git diff --stat`, `git diff --shortstat`, name-only protected checks, validation commands, and `.atomic/traces`.
- Do not print tool lists or trace file contents.
- Do not use `nl`, `sed`, or `rg` over changed code for proof after validation unless a validation command fails.
- Do not touch protected/governance files: AGENTS.md, CLAUDE.md, CODEX.md, ops/**, scripts/ops/**, .github/**, docs/codacy/**, docs/design/**, .codacy.yml, package.json, .husky/pre-push, backend/frontend/worker eslint configs, scripts/pulse/no-hardcoded-reality-audit.ts.
- Do not commit, push, reset, restore, checkout, or clean.
- Treat existing uncommitted work as human-owned. Avoid unrelated files.
- Work only on `worker/**` unless a validation command writes generated test output.

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
      args: ['.', '--fix-dry-run', '--format', 'json'],
      allowedPaths: [`${worktree}/worker`],
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
1. Record start time with `date`.
2. Capture `pwd`, branch, and `git status --short`.
3. Run the baseline worker lint check and identify the real current ESLint debt. If dependencies are missing, run `npm --prefix worker ci`, then rerun this baseline lint.
4. Fix that debt using the direct Atomic OS transaction above, preserving behavior. Do not bypass lint/tests. Do not delete behavior anchors just because they are inconvenient unless you prove deletion is correct.
5. Validate with:
   - `npm --prefix worker run lint:check`
   - `npm --prefix worker run typecheck`
   - `git diff --check -- worker`
   - `npm --prefix worker test`
   - `npm --prefix worker run build`
6. Capture `git diff --stat -- worker`, `git diff --shortstat -- worker`, protected-surface name-only diff, trace count under `.atomic/traces`, and final `git status --short`.
7. Record end time with `date`.
8. Final report must include files changed, why, validation commands/results, residual risks, trace evidence, and whether product behavior is proven by tests.
