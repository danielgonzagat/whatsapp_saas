import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ToolResult {
  content: { text: string }[];
  isError?: boolean;
}

function check(name: string, condition: boolean, detail = ''): void {
  if (!condition) {
    process.stderr.write('FAIL ' + name + (detail ? ': ' + detail : '') + '\n');
    process.exit(1);
  }
  process.stdout.write('PASS ' + name + '\n');
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
  const client = new Client({ name: 'y-certificate-script-path-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = (await client.callTool({
      name: 'atomic_y_certificate',
      arguments: { scope: 'whole-host', includeAudits: true },
    })) as ToolResult;
    check('Y certificate call succeeds in source mode', result.isError !== true, JSON.stringify(result.content));
    const body = JSON.parse(result.content.at(-1)?.text ?? '{}') as {
      domains?: { domain?: string; status?: string; evidence?: string }[];
    };
    const domains = body.domains ?? [];
    for (const domainName of ['bypassLedger', 'atomicityAudit', 'codexAtomicOnlyProtocol']) {
      const domain = domains.find((entry) => entry.domain === domainName);
      check(domainName + ' domain is present', domain !== undefined, JSON.stringify(body));
      const evidence = String(domain?.evidence ?? '');
      check(domainName + ' no longer points at missing scripts/mcp module', !evidence.includes("Cannot find module '/Users/danielpenin/whatsapp_saas/scripts/mcp/"), evidence);
    }
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
  process.exit(2);
});
