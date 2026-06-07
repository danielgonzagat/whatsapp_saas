#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');

function parseToolResult(result) {
  if (result.isError === true) throw new Error(JSON.stringify(result.content));
  const text = result.content?.at(-1)?.text ?? '{}';
  return JSON.parse(text);
}

function record(results, name, ok, detail) {
  results.push({ name, ok, detail });
}

function nestedSandboxApplyDenied(proof) {
  return /sandbox_apply: Operation not permitted/.test(JSON.stringify(proof ?? {}));
}

async function main() {
  const results = [];
  record(results, 'compiled server exists before receipt proof', fs.existsSync(compiledServer), { compiledServer });
  if (!fs.existsSync(compiledServer)) return { ok: false, results };

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [compiledServer],
    cwd: repoRoot,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'host-reentry-receipt-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool(
      { name: 'atomic_host_reentry_receipt', arguments: { command: ['codex', '--profile', 'atomic-y-proof'] } },
      undefined,
      { timeout: 120000 },
    );
    const payload = parseToolResult(result);
    const activeHostSandbox = payload.currentProcess?.activeHostSandbox === true;
    const expectedStatus = activeHostSandbox ? 'HOST_ADMITTED' : 'HOST_REENTRY_REQUIRED';
    record(results, 'receipt reports host admission truthfully', payload.ok === true && payload.hostAdmission?.status === expectedStatus, {
      activeHostSandbox,
      hostAdmission: payload.hostAdmission,
    });
    record(results, 'receipt includes exact launcher command', typeof payload.launcher?.command === 'string' && payload.launcher.command.includes('codex-atomic-host-launcher.mjs') && payload.launcher.command.includes('-- codex') && payload.launcher.command.includes('--profile'), {
      command: payload.launcher?.command,
    });
    const launcherProofGreen = payload.launcher?.proof?.ok === true;
    const launcherProofNestedDenied = nestedSandboxApplyDenied(payload.launcher?.proof);
    const launcherProofRedRequiresReentry =
      payload.hostAdmission?.status === 'HOST_REENTRY_REQUIRED' && payload.launcher?.proof?.ok === false;
    record(results, 'receipt embeds launcher proof, nested sandbox refusal, or red proof requiring re-entry', launcherProofGreen || launcherProofNestedDenied || launcherProofRedRequiresReentry, {
      launcherProofGreen,
      launcherProofNestedDenied,
      launcherProofRedRequiresReentry,
      launcherProof: payload.launcher?.proof,
    });
    record(results, 'receipt embeds strict Codex hook wiring status', payload.codexHookWiring?.hooksEnabled === true && payload.codexHookWiring?.strictProjectHook === true, {
      codexHookWiring: payload.codexHookWiring,
    });
    record(results, 'receipt points back to whole-host certificate verification', payload.nextVerification?.tool === 'atomic_y_certificate' && payload.nextVerification?.arguments?.scope === 'whole-host', {
      nextVerification: payload.nextVerification,
    });
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
  }
  return { ok: results.every((entry) => entry.ok), results };
}

main().then((result) => {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    for (const entry of result.results) {
      process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}).catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exit(1);
});
