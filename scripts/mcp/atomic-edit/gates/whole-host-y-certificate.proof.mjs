#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.join(sourceDir, 'codex-atomic-host-launcher.mjs');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');

function parseToolResult(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('invalid JSON tool result: ' + text.slice(0, 2000));
  }
}
function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}
async function main() {
  const results = [];
  record(results, 'compiled server exists before host Y proof', fs.existsSync(compiledServer), { compiledServer });
  if (!fs.existsSync(compiledServer)) return { ok: false, results };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [launcher, '--', process.execPath, compiledServer],
    cwd: repoRoot,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'whole-host-y-certificate-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool(
      { name: 'atomic_y_certificate', arguments: { scope: 'whole-host', includeAudits: true } },
      undefined,
      { timeout: 180000 },
    );
    const payload = parseToolResult(result);
    const domains = Array.isArray(payload.domains) ? payload.domains : [];
    const blockers = Array.isArray(payload.blockers) ? payload.blockers : [];
    const wholeHost = domains.find((entry) => entry.domain === 'wholeHostActionSpace');
    const bypass = domains.find((entry) => entry.domain === 'bypassLedger');
    const blockerDomains = blockers.map((entry) => entry.domain).sort();
    const onlyBypassLedgerBlocks = blockerDomains.length === 1 && blockerDomains[0] === 'bypassLedger';
    const completeState =
      payload.ok === true &&
      payload.yComplete === true &&
      payload.verdict === 'Y_COMPLETE' &&
      blockerDomains.length === 0 &&
      wholeHost?.status === 'GREEN';
    const honestBlockedState =
      payload.ok === true &&
      payload.yComplete === false &&
      payload.verdict === 'Y_BLOCKED' &&
      wholeHost?.status === 'GREEN' &&
      bypass?.status === 'UNJUDGED' &&
      onlyBypassLedgerBlocks;
    record(
      results,
      'host-launched MCP certifies whole-host boundary without hiding blockers',
      completeState || honestBlockedState,
      {
        yComplete: payload.yComplete,
        verdict: payload.verdict,
        blockerDomains,
        onlyBypassLedgerBlocks,
        wholeHost,
        bypass,
      },
    );
  } finally {
    try { await client.close(); } catch {}
  }
  return { ok: results.every((entry) => entry.ok), results };
}
main().then((payload) => {
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
  process.exit(payload.ok ? 0 : 1);
}).catch((error) => {
  const payload = { ok: false, error: error instanceof Error ? error.message : String(error) };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.error(payload.error);
  process.exit(1);
});
