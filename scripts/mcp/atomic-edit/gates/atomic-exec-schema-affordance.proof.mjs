#!/usr/bin/env node
/**
 * Proof that atomic_exec exposes the safe fast path clearly: normal validation
 * commands should omit proveEffect so mutable-or-unknown commands auto-prove
 * byte effects, while proveEffect:false remains a refusal/red-team path.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function sourceAssertions() {
  const source = read('scripts/mcp/atomic-edit/server-tools-exec.ts');
  return {
    schemaTellsModelsToOmitProveEffectForValidation:
      source.includes('MODEL USAGE: omit this field for normal npm test/typecheck/build') &&
      source.includes('atomic_exec auto-runs byte-effect proof when the command is mutable-or-unknown'),
    schemaKeepsFalseAsRefusalPath:
      source.includes('Never pass false during normal work; false is reserved') &&
      source.includes('explicit proveEffect:false is refused'),
  };
}

async function dynamicToolSchemaProof() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [compiledServer],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_EDIT_MCP_SELF_HOSTED: '1',
      ATOMIC_EDIT_ALLOW_SELF_HOSTED: '1',
      ATOMIC_EDIT_REPO_ROOT: repoRoot,
      ATOMIC_WORKSPACE_ROOT: repoRoot,
    },
  });
  const client = new Client({ name: 'atomic-exec-schema-affordance-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const tool = listed.tools.find((candidate) => candidate.name === 'atomic_exec');
    const description = tool?.description ?? '';
    const proveDescription = tool?.inputSchema?.properties?.proveEffect?.description ?? '';
    return {
      ok:
        Boolean(tool) &&
        description.includes('explicit proveEffect:false is refused') &&
        proveDescription.includes('MODEL USAGE: omit this field for normal npm test/typecheck/build') &&
        proveDescription.includes('Never pass false during normal work'),
      descriptionIncludesRefusal: description.includes('explicit proveEffect:false is refused'),
      proveDescription,
    };
  } finally {
    try { await client.close(); } catch {}
  }
}

async function main() {
  const results = [];
  const source = sourceAssertions();
  for (const [name, ok] of Object.entries(source)) record(results, name, ok, { ok });
  if (!fs.existsSync(compiledServer)) {
    record(results, 'dynamic MCP proof has built dist/server.js', false, { missing: compiledServer });
  } else {
    const dynamic = await dynamicToolSchemaProof();
    record(results, 'atomic_exec MCP schema exposes omit-proveEffect fast path and false refusal', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = await main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
