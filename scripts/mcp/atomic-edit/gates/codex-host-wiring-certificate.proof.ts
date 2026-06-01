import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ToolResult {
  content: { text: string }[];
  isError?: boolean;
}

async function main(): Promise<void> {
  const sourceDir = process.cwd();
  const repoRoot = path.resolve(sourceDir, '..', '..', '..');
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', path.join(sourceDir, 'server.ts')],
    cwd: repoRoot,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'codex-host-wiring-certificate-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = (await client.callTool({
      name: 'atomic_y_certificate',
      arguments: { scope: 'whole-host', includeAudits: true },
    })) as ToolResult;
    if (result.isError === true) throw new Error(JSON.stringify(result.content));
    const body = JSON.parse(result.content.at(-1)?.text ?? '{}') as {
      domains?: { domain?: string; status?: string; evidence?: string }[];
    };
    const host = (body.domains ?? []).find((entry) => entry.domain === 'codexHostWiring');
    if (!host) throw new Error('codexHostWiring domain missing');
    if (host.status !== 'GREEN') {
      throw new Error('codexHostWiring not GREEN: ' + JSON.stringify(host));
    }
    if (!String(host.evidence ?? '').includes('codex-atomic-only-hook.mjs')) {
      throw new Error('codexHostWiring evidence does not mention strict hook: ' + JSON.stringify(host));
    }
    process.stdout.write('PASS codexHostWiring is GREEN from observed Codex hook config\n');
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
  }
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exit(1);
});
