#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh');

function parseToolJson(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  return JSON.parse(text);
}

function domain(cert, name) {
  return Array.isArray(cert?.domains) ? cert.domains.find((entry) => entry.domain === name) : undefined;
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
    const bypass = domain(cert, 'bypassLedger');
    const bypassReportStatus = String(bypass?.detail?.status ?? 'missing');
    const bypassIsHonestBlock =
      bypass?.status === 'UNJUDGED' &&
      bypassReportStatus !== 'observed-clean' &&
      Array.isArray(cert?.blockers) &&
      cert.blockers.some((entry) => entry.domain === 'bypassLedger');
    return {
      ok: cert?.ok === true && cert?.yComplete === false && cert?.verdict === 'Y_BLOCKED' && bypassIsHonestBlock,
      certificate: cert,
      assertion: {
        bypassStatus: bypass?.status,
        bypassReportStatus,
        bypassIsHonestBlock,
      },
    };
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
  }
}

main()
  .then((payload) => {
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
    process.exit(payload.ok ? 0 : 1);
  })
  .catch((error) => {
    const payload = { ok: false, error: error instanceof Error ? error.message : String(error) };
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else console.error(payload.error);
    process.exit(1);
  });
