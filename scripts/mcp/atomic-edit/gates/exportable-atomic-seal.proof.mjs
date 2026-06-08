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
const exportRel = '.atomic/seals/exportable-atomic-seal-proof-' + process.pid + '.json';
const exportAbs = path.join(repoRoot, exportRel);
const artifactRel = '.atomic/seals/exportable-atomic-seal-artifact-' + process.pid + '.txt';
const artifactAbs = path.join(repoRoot, artifactRel);
const symlinkTargetRel = '.atomic/seals/exportable-atomic-seal-symlink-target-' + process.pid + '.txt';
const symlinkTargetAbs = path.join(repoRoot, symlinkTargetRel);
const symlinkRel = '.atomic/seals/exportable-atomic-seal-symlink-' + process.pid + '.txt';
const symlinkAbs = path.join(repoRoot, symlinkRel);
const results = [];
function record(name, ok, detail = {}) { results.push({ name, ok: Boolean(ok), detail }); }
function parseToolResult(result) { const text = result.content?.at(-1)?.text ?? '{}'; try { return JSON.parse(text); } catch { return { ok: false, parseError: text.slice(0, 500) }; } }
async function call(client, name, args) { const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 }); return { raw: result, body: parseToolResult(result) }; }

fs.rmSync(exportAbs, { force: true });
fs.rmSync(artifactAbs, { force: true });
fs.rmSync(symlinkAbs, { force: true });
fs.rmSync(symlinkTargetAbs, { force: true });
record('compiled server exists before seal proof', fs.existsSync(compiledServer), { compiledServer });
const transport = new StdioClientTransport({ command: process.execPath, args: [compiledServer], cwd: repoRoot, stderr: 'pipe' });
const client = new Client({ name: 'exportable-atomic-seal-proof', version: '1.0.0' });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  record('atomic_seal is exported as an MCP tool', tools.tools.some((tool) => tool.name === 'atomic_seal'), { toolCount: tools.tools.length });
  const prove = await call(client, 'atomic_prove', { claim: 'exportable seal proof can back a runtime_probe with a live gate run', directive: "// @model id=seal init='[0]' next='(s)=>s<1?[s+1]:[]' invariant='(s)=>s<=1' cap=4" });
  record('atomic_prove mints a real gateRunId for the seal', prove.body.ok === true && prove.body.minted === true && typeof prove.body.gateRunId === 'string', prove.body);
  const receipt = { claim: 'exportable seal protects this receipt', kind: 'runtime_probe', status: 'passed' };
  fs.writeFileSync(artifactAbs, 'artifact-bytes-covered-by-seal\n');
  const created = await call(client, 'atomic_seal', { mode: 'create', subject: 'exportable atomic seal proof', receipt, gateRunId: prove.body.gateRunId, artifactPaths: [artifactRel], exportPath: exportRel });
  record('atomic_seal creates a seal envelope and exports an artifact', created.body.ok === true && typeof created.body.sealHash === 'string' && fs.existsSync(exportAbs), created.body);
  const exported = fs.existsSync(exportAbs) ? JSON.parse(fs.readFileSync(exportAbs, 'utf8')) : null;
  record('exported artifact carries the same sealHash', exported?.sealHash === created.body.sealHash, { exportedHash: exported?.sealHash, returnedHash: created.body.sealHash });
  const verified = await call(client, 'atomic_seal', { mode: 'verify', seal: created.body.seal });
  record('atomic_seal verifies the untampered seal', verified.body.ok === true && verified.body.sealValid === true && verified.body.hashValid === true && verified.body.artifactHashesValid === true, verified.body);
  const wrongEnvelopeSchema = structuredClone(created.body.seal);
  wrongEnvelopeSchema.schema = 'atomic.seal.envelope.v0';
  const wrongEnvelopeSchemaResult = await call(client, 'atomic_seal', { mode: 'verify', seal: wrongEnvelopeSchema });
  record('atomic_seal rejects unsupported envelope schema', wrongEnvelopeSchemaResult.body.ok === true && wrongEnvelopeSchemaResult.body.sealValid === false && wrongEnvelopeSchemaResult.body.schemaValid === false, wrongEnvelopeSchemaResult.body);
  fs.writeFileSync(artifactAbs, 'tampered-artifact-bytes\n');
  const artifactTampered = await call(client, 'atomic_seal', { mode: 'verify', seal: created.body.seal });
  record('atomic_seal detects tampered referenced artifact bytes', artifactTampered.body.ok === true && artifactTampered.body.sealValid === false && artifactTampered.body.artifactHashesValid === false, artifactTampered.body);
  fs.writeFileSync(artifactAbs, 'artifact-bytes-covered-by-seal\n');
  const tampered = structuredClone(created.body.seal);
  tampered.payload.receipt.claim = 'tampered receipt claim';
  const tamperedResult = await call(client, 'atomic_seal', { mode: 'verify', seal: tampered });
  record('atomic_seal detects tampered payload', tamperedResult.body.ok === true && tamperedResult.body.sealValid === false && tamperedResult.body.hashValid === false, tamperedResult.body);
  const fabricated = await call(client, 'atomic_seal', { mode: 'create', subject: 'fabricated gate id must fail', receipt, gateRunId: 'cafe'.repeat(16) });
  record('atomic_seal refuses fabricated gateRunId at creation time', fabricated.raw.isError === true || fabricated.body.ok === false, fabricated.body);
  fs.writeFileSync(symlinkTargetAbs, 'symlink-target-bytes\n');
  fs.symlinkSync(symlinkTargetAbs, symlinkAbs);
  const symlinkArtifact = await call(client, 'atomic_seal', { mode: 'create', subject: 'symlink artifact must fail', receipt, artifactPaths: [symlinkRel] });
  record('atomic_seal refuses symlink artifact custody at creation time', symlinkArtifact.raw.isError === true || symlinkArtifact.body.ok === false, symlinkArtifact.body);
  const outside = await call(client, 'atomic_seal', { mode: 'create', subject: 'outside export path must fail', receipt, exportPath: 'atomic-seal-outside.json' });
  record('atomic_seal refuses export outside .atomic/seals', outside.raw.isError === true || outside.body.ok === false, outside.body);
} finally {
  try { await client.close(); } catch {}
  fs.rmSync(exportAbs, { force: true });
  fs.rmSync(artifactAbs, { force: true });
  fs.rmSync(symlinkAbs, { force: true });
  fs.rmSync(symlinkTargetAbs, { force: true });
}
const payload = { ok: results.every((entry) => entry.ok), results };
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
