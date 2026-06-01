#!/usr/bin/env node
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh');

function parseToolJson(result) {
  const text = result?.content?.find?.((item) => item?.type === 'text')?.text;
  if (typeof text !== 'string') throw new Error('tool result did not include JSON text content');
  return JSON.parse(text);
}

async function main() {
  const transport = new StdioClientTransport({
    command: launcher,
    args: [],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: '1',
      ATOMIC_HOST_WRITE_ROOT: repoRoot,
      CODEX_PROJECT_DIR: repoRoot,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    },
  });
  const client = new Client({ name: 'compiled-mcp-y-certificate-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const cert = parseToolJson(await client.callTool({ name: 'atomic_y_certificate', arguments: { scope: 'mcp-controlled', includeAudits: true } }));
    return {
      ok: cert?.yComplete === true && cert?.verdict === 'Y_COMPLETE' && Array.isArray(cert?.blockers) && cert.blockers.length === 0,
      certificate: cert,
    };
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
  }
}

main().then((result) => {
  if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
  else process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'} compiled MCP mcp-controlled Y certificate\n`);
  process.exit(result.ok ? 0 : 1);
}).catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exit(1);
});
