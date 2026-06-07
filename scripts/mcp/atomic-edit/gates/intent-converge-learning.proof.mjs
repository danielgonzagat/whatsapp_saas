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
const memoryRel = '.atomic/learning/intent-converge-gate-failures.jsonl';
const memoryAbs = path.join(repoRoot, memoryRel);
const proofDirRel = `.atomic/generated-intent/learning-${process.pid}`;
const proofDirAbs = path.join(repoRoot, proofDirRel);
const priorMemory = fs.existsSync(memoryAbs) ? fs.readFileSync(memoryAbs, 'utf8') : null;
const results = [];
function record(name, ok, detail = {}) { results.push({ name, ok: Boolean(ok), detail }); }
function parseToolResult(result) { const text = result.content?.at(-1)?.text ?? '{}'; try { return JSON.parse(text); } catch { return { ok: false, parseError: text.slice(0, 500) }; } }
async function call(client, name, args) { const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 }); return { raw: result, body: parseToolResult(result) }; }

fs.rmSync(proofDirAbs, { recursive: true, force: true });
fs.rmSync(memoryAbs, { force: true });
record('compiled server exists before intent learning proof', fs.existsSync(compiledServer), { compiledServer });
const transport = new StdioClientTransport({ command: process.execPath, args: [compiledServer], cwd: repoRoot, stderr: 'pipe' });
const client = new Client({ name: 'intent-converge-learning-proof', version: '1.0.0' });
try {
  await client.connect(transport);
  const goal = `prove repeated impossible symbol learning ${process.pid}`;
  const stuckDraft = ['export function impossible() {', '  return totallyMadeUpSymbolXYZ();', '}', ''].join('\n');
  const first = await call(client, 'atomic_intent_converge', {
    goal,
    targetIntegration: 'generic_product_flow',
    draftFiles: [{ file: `${proofDirRel}/first.test.ts`, newText: stuckDraft }],
  });
  record('first failed intent records a learning event',
    first.body.ok === true &&
      first.body.needsIntent === true &&
      first.body.learningEventRecorded === true &&
      first.body.failureMemory?.totalMatchingFailures === 0 &&
      fs.existsSync(memoryAbs),
    first.body);

  const second = await call(client, 'atomic_intent_converge', {
    goal,
    targetIntegration: 'generic_product_flow',
    draftFiles: [{ file: `${proofDirRel}/second.test.ts`, newText: stuckDraft }],
  });
  record('second matching intent receives prior failure prediction before trying again',
    second.body.ok === true &&
      second.body.needsIntent === true &&
      second.body.failureMemory?.totalMatchingFailures >= 1 &&
      second.body.failureMemory?.likelyFailureGates?.includes('binding') &&
      second.body.learningEventRecorded === true,
    second.body);
} finally {
  try { await client.close(); } catch {}
  fs.rmSync(proofDirAbs, { recursive: true, force: true });
  if (priorMemory === null) fs.rmSync(memoryAbs, { force: true });
  else fs.writeFileSync(memoryAbs, priorMemory);
}
const payload = { ok: results.every((entry) => entry.ok), results };
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
