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
const priorMemory = fs.existsSync(memoryAbs) ? fs.readFileSync(memoryAbs, 'utf8') : null;
const results = [];
function record(name, ok, detail = {}) { results.push({ name, ok: Boolean(ok), detail }); }
function parseToolResult(result) { const text = result.content?.at(-1)?.text ?? '{}'; try { return JSON.parse(text); } catch { return { ok: false, parseError: text.slice(0, 500) }; } }
async function call(client, name, args) { const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 }); return { raw: result, body: parseToolResult(result) }; }

const proofDirRel = `.atomic/generated-intent/proof-${process.pid}`;
const generatedRel = `${proofDirRel}/intent-converge-proof.test.ts`;
const commitRel = `${proofDirRel}/intent-converge-commit.test.ts`;
const bindingRel = `${proofDirRel}/intent-converge-binding.test.ts`;
const stuckRel = `${proofDirRel}/intent-converge-stuck.test.ts`;
fs.rmSync(path.join(repoRoot, proofDirRel), { recursive: true, force: true });

record('compiled server exists before intent converge proof', fs.existsSync(compiledServer), { compiledServer });
const transport = new StdioClientTransport({ command: process.execPath, args: [compiledServer], cwd: repoRoot, stderr: 'pipe' });
const client = new Client({ name: 'intent-convergent-generator-proof', version: '1.0.0' });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  record('atomic_intent_converge is exported as an MCP tool', tools.tools.some((tool) => tool.name === 'atomic_intent_converge'), { toolCount: tools.tools.length });

  const generated = await call(client, 'atomic_intent_converge', {
    goal: 'fazer o chat do admin persistir mensagens em Postgres',
    outputFile: generatedRel,
  });
  const generatedText = generated.body.files?.[0]?.newText ?? '';
  record('intent contract generates a green preview module without touching disk',
    generated.body.ok === true &&
      generated.body.targetIntegration === 'chat_persistence' &&
      generated.body.converged === true &&
      generated.body.committed === false &&
      generatedText.includes('atomicIntentContract') &&
      generatedText.includes('chat_persistence') &&
      !fs.existsSync(path.join(repoRoot, generatedRel)),
    generated.body);

  const bindingDraft = [
    'export function makeId(): string {',
    '  return randomUUID();',
    '}',
    '',
  ].join('\n');
  const repaired = await call(client, 'atomic_intent_converge', {
    contract: {
      goal: 'gerar identificador correto por contrato',
      targetIntegration: 'generic_product_flow',
      actor: 'agent',
      acceptanceCriteria: ['makeId compiles without an unbound identifier'],
      validationPlan: ['binding gate must be green'],
    },
    draftFiles: [{ file: bindingRel, newText: bindingDraft }],
  });
  const repairedText = repaired.body.files?.[0]?.newText ?? '';
  record('intent converge applies convergence splices to repair a draft overlay',
    repaired.body.ok === true &&
      repaired.body.converged === true &&
      repaired.body.committed === false &&
      repaired.body.acceptedSplices?.some((entry) => entry.includes('node:crypto') && entry.includes('randomUUID')) &&
      repairedText.includes("import { randomUUID } from 'node:crypto';") &&
      !fs.existsSync(path.join(repoRoot, bindingRel)),
    repaired.body);

  const committed = await call(client, 'atomic_intent_converge', {
    goal: 'registrar contrato generico validavel',
    targetIntegration: 'generic_product_flow',
    outputFile: commitRel,
    commit: true,
  });
  record('intent converge can commit only after green convergence and write-gate admission',
    committed.body.ok === true &&
      committed.body.converged === true &&
      committed.body.committed === true &&
      fs.existsSync(path.join(repoRoot, commitRel)) &&
      fs.readFileSync(path.join(repoRoot, commitRel), 'utf8').includes('atomicIntentContract'),
    committed.body);

  const stuckDraft = [
    'export function impossible() {',
    '  return totallyMadeUpSymbolXYZ();',
    '}',
    '',
  ].join('\n');
  const stuck = await call(client, 'atomic_intent_converge', {
    goal: 'nao inventar simbolo inexistente',
    targetIntegration: 'generic_product_flow',
    draftFiles: [{ file: stuckRel, newText: stuckDraft }],
  });
  record('intent converge escalates unrecoverable reds as needsIntent instead of fabricating code',
    stuck.body.ok === true &&
      stuck.body.converged === false &&
      stuck.body.needsIntent === true &&
      stuck.body.committed === false &&
      JSON.stringify(stuck.body.residualReds ?? []).includes('totallyMadeUpSymbolXYZ') &&
      !fs.existsSync(path.join(repoRoot, stuckRel)),
    stuck.body);
} finally {
  try { await client.close(); } catch {}
  fs.rmSync(path.join(repoRoot, proofDirRel), { recursive: true, force: true });
  if (priorMemory === null) fs.rmSync(memoryAbs, { force: true });
  else fs.writeFileSync(memoryAbs, priorMemory);
}
const payload = { ok: results.every((entry) => entry.ok), results };
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
