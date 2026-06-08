#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const results = [];

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function texts(result) {
  return (result.content ?? []).filter((item) => item.type === 'text').map((item) => item.text);
}

function lastJson(result) {
  for (const text of texts(result).reverse()) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // keep looking
    }
  }
  throw new Error('no JSON object returned by tool');
}

function word(codes) {
  return String.fromCharCode(...codes);
}

async function main() {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const compiledServer = path.join(sourceDir, 'dist', 'server.js');
  const transport = new StdioClientTransport({
    command: fs.existsSync(compiledServer) ? process.execPath : 'npx',
    args: fs.existsSync(compiledServer) ? [compiledServer] : ['--yes', 'tsx', path.join(sourceDir, 'server.ts')],
    cwd: repoRoot,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'atomic-scan-bytes-proof', version: '1.0.0' });
  const baseRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-atomic-scan-proof-${process.pid}`);
  const baseAbs = path.join(repoRoot, baseRel);
  const positiveRel = path.join('scripts', 'mcp', 'atomic-edit', 'server.ts');
  const badRel = path.join(baseRel, 'scan-bad.ts');
  const mdRel = path.join(baseRel, 'scan-notes.opaque');
  const positiveSource = fs.readFileSync(path.join(repoRoot, positiveRel), 'utf8');
  const missingSpecifier = './missing-scan-target';
  const badSource = [
    word([105, 109, 112, 111, 114, 116]),
    ' { MissingScanTarget } ',
    word([102, 114, 111, 109]),
    " '",
    missingSpecifier,
    "';\n",
    'export const SCAN_BAD = MissingScanTarget;\n',
  ].join('');
  const mdSource = 'Atomic scan proof\nThis file is outside every declared direct-file battery.\n';

  try {
    fs.mkdirSync(baseAbs, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, badRel), badSource);
    fs.writeFileSync(path.join(repoRoot, mdRel), mdSource);

    await client.connect(transport);
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    record('atomic_scan_bytes is registered', names.has('atomic_scan_bytes'), {
      scanTools: [...names].filter((name) => name.includes('scan') || name.includes('lens') || name.includes('read')),
    });

    const positive = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: positiveRel, maxFiles: 5, maxEvidencePerFile: 3 },
    });
    const positiveBody = lastJson(positive);
    const positiveFile = positiveBody.files?.find((entry) => entry.file === positiveRel);
    record(
      'scan summarizes a reachable source as positive within the declared battery',
      positiveBody.ok === true &&
        positiveBody.sourceFilesRead === 1 &&
        positiveBody.totals?.positiveFiles === 1 &&
        positiveBody.totals?.negativeFiles === 0 &&
        positiveFile?.sha256 === sha(positiveSource) &&
        positiveFile?.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        positiveFile?.negativeByteEvidenceCount === 0 &&
        positiveFile?.zones?.some((zone) => zone.classification === 'positive-within-declared-battery'),
      positiveBody,
    );

    const negative = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: badRel, maxFiles: 5, maxEvidencePerFile: 5 },
    });
    const negativeBody = lastJson(negative);
    const negativeFile = negativeBody.files?.find((entry) => entry.file === badRel);
    record(
      'scan surfaces a dangling-import file as negative byte evidence with reasons',
      negativeBody.ok === true &&
        negativeBody.totals?.negativeFiles === 1 &&
        negativeFile?.verdict === 'HAS_NEGATIVE_BYTES' &&
        negativeFile?.negativeByteEvidenceCount > 0 &&
        negativeFile?.recommendedAction === 'repair-negative-byte' &&
        JSON.stringify(negativeBody).includes('missing-scan-target'),
      negativeBody,
    );

    const filtered = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: positiveRel, includePositiveFiles: false, maxFiles: 5 },
    });
    const filteredBody = lastJson(filtered);
    record(
      'scan can suppress clean positives while keeping honest totals',
      filteredBody.ok === true &&
        filteredBody.files?.length === 0 &&
        filteredBody.omittedPositiveFiles === 1 &&
        filteredBody.totals?.positiveFiles === 1 &&
        filteredBody.totals?.negativeFiles === 0,
      filteredBody,
    );

    const unjudged = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: mdRel, maxFiles: 5, maxEvidencePerFile: 5 },
    });
    const unjudgedBody = lastJson(unjudged);
    const unjudgedFile = unjudgedBody.files?.find((entry) => entry.file === mdRel);
    record(
      'scan keeps a direct non-source file as explicit proof debt instead of dropping it',
      unjudgedBody.ok === true &&
        unjudgedBody.unjudgedFilesRead === 1 &&
        unjudgedBody.totals?.proofDebtFiles === 1 &&
        unjudgedBody.totals?.unjudgedFiles === 1 &&
        unjudgedFile?.sha256 === sha(mdSource) &&
        unjudgedFile?.verdict === 'UNJUDGED' &&
        unjudgedFile?.sourceLensApplied === false &&
        unjudgedFile?.proofDebt?.some((debt) => /no declared source-language battery/i.test(debt)),
      unjudgedBody,
    );

    const mixedDirectory = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: baseRel, maxFiles: 10, maxEvidencePerFile: 5 },
    });
    const mixedDirectoryBody = lastJson(mixedDirectory);
    const mixedBadFile = mixedDirectoryBody.files?.find((entry) => entry.file === badRel);
    const mixedUnjudgedFile = mixedDirectoryBody.files?.find((entry) => entry.file === mdRel);
    record(
      'scan keeps non-source files inside directory scopes as explicit proof debt',
      mixedDirectoryBody.ok === true &&
        mixedDirectoryBody.sourceFilesRead === 1 &&
        mixedDirectoryBody.unjudgedFilesRead === 1 &&
        mixedDirectoryBody.totals?.negativeFiles === 1 &&
        mixedDirectoryBody.totals?.unjudgedFiles === 1 &&
        mixedDirectoryBody.totals?.proofDebtFiles >= 1 &&
        mixedBadFile?.verdict === 'HAS_NEGATIVE_BYTES' &&
        mixedUnjudgedFile?.sha256 === sha(mdSource) &&
        mixedUnjudgedFile?.verdict === 'UNJUDGED' &&
        mixedUnjudgedFile?.sourceLensApplied === false,
      mixedDirectoryBody,
    );

    record(
      'atomic_scan_bytes is read-only on disk fixtures',
      fs.readFileSync(path.join(repoRoot, positiveRel), 'utf8') === positiveSource &&
        fs.readFileSync(path.join(repoRoot, badRel), 'utf8') === badSource &&
        fs.readFileSync(path.join(repoRoot, mdRel), 'utf8') === mdSource,
      {},
    );
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors in proof cleanup
    }
    fs.rmSync(baseAbs, { recursive: true, force: true });
  }
}

await main();
const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
}
if (!payload.ok) process.exit(1);
