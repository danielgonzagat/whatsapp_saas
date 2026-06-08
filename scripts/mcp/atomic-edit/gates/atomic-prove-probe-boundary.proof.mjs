#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');
const results = [];
function record(name, ok, detail = {}) { results.push({ name, ok: Boolean(ok), detail }); }
function parseToolResult(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  try { return JSON.parse(text); } catch { return { ok: false, parseError: text.slice(0, 500) }; }
}
function sourceProbeResidue() {
  return fs.readdirSync(sourceDir).filter((name) => name.startsWith('.atomic-prove-'));
}

record('compiled server exists before atomic_prove boundary proof', fs.existsSync(compiledServer), { compiledServer });
const beforeSourceResidue = sourceProbeResidue();
const transport = new StdioClientTransport({ command: process.execPath, args: [compiledServer], cwd: repoRoot, stderr: 'pipe' });
const client = new Client({ name: 'atomic-prove-probe-boundary-proof', version: '1.0.0' });
try {
  await client.connect(transport);
  const result = await client.callTool({ name: 'atomic_prove', arguments: {
    claim: 'atomic_prove probe can run without entering the Atomic source self-expansion path',
    directive: "// @model id=probeBoundary init='[0]' next='(s)=>s<1?[s+1]:[]' invariant='(s)=>s<=1' cap=4",
  }}, undefined, { timeout: 120000 });
  const body = parseToolResult(result);
  record('atomic_prove mints a gateRunId through the public MCP tool', result.isError !== true && body.ok === true && body.minted === true && typeof body.gateRunId === 'string', body);
} finally {
  try { await client.close(); } catch {}
}
const afterSourceResidue = sourceProbeResidue();
record('atomic_prove leaves no probe under scripts/mcp/atomic-edit source root', afterSourceResidue.length === beforeSourceResidue.length, { beforeSourceResidue, afterSourceResidue });
const payload = { ok: results.every((entry) => entry.ok), results };
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
