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
    env: {
      ...process.env,
      ATOMIC_DISABLE_HOT_RELOAD: '1',
      CODEX_PROJECT_DIR: repoRoot,
      TMPDIR: sourceDir,
      TMP: sourceDir,
      TEMP: sourceDir,
    },
  });
  const client = new Client({ name: 'atomic-scan-bytes-proof', version: '1.0.0' });
  const baseRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-atomic-scan-proof-${process.pid}`);
  const baseAbs = path.join(repoRoot, baseRel);
  const positiveRel = path.join('scripts', 'mcp', 'atomic-edit', 'server.ts');
  const badRel = path.join(baseRel, 'scan-bad.ts');
  const mdRel = path.join(baseRel, 'scan-notes.opaque');
  const directMdRel = path.join(baseRel, 'scan-notes.md');
  const directDockerRel = path.join(baseRel, 'Dockerfile');
  const directGoRel = path.join(baseRel, 'scan-main.go');
  const generatedCacheDirRel = path.join(baseRel, 'node-compile-cache', 'v25.fake');
  const generatedCacheRel = path.join(generatedCacheDirRel, 'compile-cache-entry');
  const badDirectGoRel = path.join(baseRel, 'scan-broken.go');
  const badDirectJsonRel = path.join(baseRel, 'scan-broken.json');
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
  const directMdSource = '# Atomic scan proof\nThis Markdown file is covered by the direct-file text battery.\n';
  const directDockerSource = 'FROM scratch\n# Atomic direct text battery\n';
  const directGoSource = 'package main\nfunc main() { println("atomic") }\n';
  const generatedCacheSource = 'opaque generated Node compile cache bytes\n';
  const badDirectGoSource = 'package main\nfunc main() { println("atomic" \n';
  const badDirectJsonSource = '{"atomic": ';

  try {
    fs.mkdirSync(baseAbs, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, badRel), badSource);
    fs.writeFileSync(path.join(repoRoot, mdRel), mdSource);
    fs.writeFileSync(path.join(repoRoot, directMdRel), directMdSource);
    fs.writeFileSync(path.join(repoRoot, directDockerRel), directDockerSource);
    fs.writeFileSync(path.join(repoRoot, directGoRel), directGoSource);
    fs.mkdirSync(path.join(repoRoot, generatedCacheDirRel), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, generatedCacheRel), generatedCacheSource);
    fs.writeFileSync(path.join(repoRoot, badDirectGoRel), badDirectGoSource);
    fs.writeFileSync(path.join(repoRoot, badDirectJsonRel), badDirectJsonSource);

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

    const generatedCacheOnly = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: path.join(baseRel, 'node-compile-cache'), maxFiles: 5, maxEvidencePerFile: 5 },
    });
    const generatedCacheOnlyBody = lastJson(generatedCacheOnly);
    record(
      'scan ignores generated Node compile cache directories instead of treating them as proof debt',
      generatedCacheOnlyBody.ok === true &&
        generatedCacheOnlyBody.sourceFilesRead === 0 &&
        generatedCacheOnlyBody.unjudgedFilesRead === 0 &&
        generatedCacheOnlyBody.returnedFiles === 0 &&
        generatedCacheOnlyBody.totals?.proofDebtFiles === 0 &&
        generatedCacheOnlyBody.totals?.unjudgedFiles === 0,
      generatedCacheOnlyBody,
    );

    const directMd = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: directMdRel, maxFiles: 5, maxEvidencePerFile: 5 },
    });
    const directMdBody = lastJson(directMd);
    const directMdFile = directMdBody.files?.find((entry) => entry.file === directMdRel);
    record(
      'scan exposes explicit direct-file battery evidence for Markdown bytes',
      directMdBody.ok === true &&
        directMdBody.unjudgedFilesRead === 0 &&
        directMdBody.totals?.positiveFiles === 1 &&
        directMdBody.totals?.directFileBatteryFiles === 1 &&
        directMdBody.totals?.proofDebtFiles === 0 &&
        directMdFile?.sha256 === sha(directMdSource) &&
        directMdFile?.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        directMdFile?.sourceLensApplied === false &&
        directMdFile?.directFileBatteryApplied === true &&
        directMdFile?.proofDebt?.length === 0 &&
        /Markdown text is UTF-8 readable/.test(directMdFile?.zones?.[0]?.reason ?? ''),
      directMdBody,
    );

    const directDocker = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: directDockerRel, maxFiles: 5, maxEvidencePerFile: 5 },
    });
    const directDockerBody = lastJson(directDocker);
    const directDockerFile = directDockerBody.files?.find((entry) => entry.file === directDockerRel);
    record(
      'scan applies direct text battery to Dockerfile bytes',
      directDockerBody.ok === true &&
        directDockerBody.unjudgedFilesRead === 0 &&
        directDockerBody.totals?.positiveFiles === 1 &&
        directDockerBody.totals?.directFileBatteryFiles === 1 &&
        directDockerBody.totals?.proofDebtFiles === 0 &&
        directDockerFile?.sha256 === sha(directDockerSource) &&
        directDockerFile?.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        directDockerFile?.sourceLensApplied === false &&
        directDockerFile?.directFileBatteryApplied === true &&
        directDockerFile?.proofDebt?.length === 0 &&
        /Dockerfile text is UTF-8 readable/.test(directDockerFile?.zones?.[0]?.reason ?? ''),
      directDockerBody,
    );

    const directGo = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: directGoRel, maxFiles: 5, maxEvidencePerFile: 5 },
    });
    const directGoBody = lastJson(directGo);
    const directGoFile = directGoBody.files?.find((entry) => entry.file === directGoRel);
    record(
      'scan applies direct structural battery to Go bytes',
      directGoBody.ok === true &&
        directGoBody.unjudgedFilesRead === 0 &&
        directGoBody.totals?.positiveFiles === 1 &&
        directGoBody.totals?.directFileBatteryFiles === 1 &&
        directGoBody.totals?.proofDebtFiles === 0 &&
        directGoFile?.sha256 === sha(directGoSource) &&
        directGoFile?.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        directGoFile?.sourceLensApplied === false &&
        directGoFile?.directFileBatteryApplied === true &&
        directGoFile?.proofDebt?.length === 0 &&
        /structural balance battery/.test(directGoFile?.zones?.[0]?.reason ?? ''),
      directGoBody,
    );

    const badDirectGo = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: badDirectGoRel, maxFiles: 5, maxEvidencePerFile: 5 },
    });
    const badDirectGoBody = lastJson(badDirectGo);
    const badDirectGoFile = badDirectGoBody.files?.find((entry) => entry.file === badDirectGoRel);
    record(
      'scan marks structurally broken Go direct bytes as negative evidence',
      badDirectGoBody.ok === true &&
        badDirectGoBody.unjudgedFilesRead === 0 &&
        badDirectGoBody.totals?.negativeFiles === 1 &&
        badDirectGoBody.totals?.directFileBatteryFiles === 1 &&
        badDirectGoBody.totals?.proofDebtFiles === 0 &&
        badDirectGoFile?.sha256 === sha(badDirectGoSource) &&
        badDirectGoFile?.verdict === 'HAS_NEGATIVE_BYTES' &&
        badDirectGoFile?.sourceLensApplied === false &&
        badDirectGoFile?.directFileBatteryApplied === true &&
        badDirectGoFile?.negativeByteEvidenceCount > 0 &&
        badDirectGoFile?.proofDebt?.length === 0 &&
        /unclosed/.test(badDirectGoFile?.zones?.[0]?.reason ?? ''),
      badDirectGoBody,
    );

    const badDirectJson = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: badDirectJsonRel, maxFiles: 5, maxEvidencePerFile: 5 },
    });
    const badDirectJsonBody = lastJson(badDirectJson);
    const badDirectJsonFile = badDirectJsonBody.files?.find((entry) => entry.file === badDirectJsonRel);
    record(
      'scan marks invalid JSON direct bytes as negative evidence',
      badDirectJsonBody.ok === true &&
        badDirectJsonBody.unjudgedFilesRead === 0 &&
        badDirectJsonBody.totals?.negativeFiles === 1 &&
        badDirectJsonBody.totals?.directFileBatteryFiles === 1 &&
        badDirectJsonBody.totals?.proofDebtFiles === 0 &&
        badDirectJsonFile?.sha256 === sha(badDirectJsonSource) &&
        badDirectJsonFile?.verdict === 'HAS_NEGATIVE_BYTES' &&
        badDirectJsonFile?.sourceLensApplied === false &&
        badDirectJsonFile?.directFileBatteryApplied === true &&
        badDirectJsonFile?.negativeByteEvidenceCount > 0 &&
        badDirectJsonFile?.proofDebt?.length === 0 &&
        /JSON failed Atomic direct-file battery/.test(badDirectJsonFile?.zones?.[0]?.reason ?? ''),
      badDirectJsonBody,
    );

    const mixedDirectory = await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: baseRel, maxFiles: 10, maxEvidencePerFile: 5 },
    });
    const mixedDirectoryBody = lastJson(mixedDirectory);
    const mixedBadFile = mixedDirectoryBody.files?.find((entry) => entry.file === badRel);
    const mixedDirectDockerFile = mixedDirectoryBody.files?.find((entry) => entry.file === directDockerRel);
    const mixedBadDirectGoFile = mixedDirectoryBody.files?.find((entry) => entry.file === badDirectGoRel);
    const mixedBadDirectJsonFile = mixedDirectoryBody.files?.find((entry) => entry.file === badDirectJsonRel);
    const mixedUnjudgedFile = mixedDirectoryBody.files?.find((entry) => entry.file === mdRel);
    const mixedGeneratedCacheFiles = (mixedDirectoryBody.files ?? []).filter((entry) =>
      String(entry.file ?? '').includes('/node-compile-cache/'),
    );
    record(
      'scan keeps non-source files inside directory scopes as explicit proof debt',
      mixedDirectoryBody.ok === true &&
        mixedDirectoryBody.sourceFilesRead === 1 &&
        mixedDirectoryBody.unjudgedFilesRead === 1 &&
        mixedDirectoryBody.totals?.negativeFiles === 3 &&
        mixedDirectoryBody.totals?.unjudgedFiles === 1 &&
        mixedDirectoryBody.totals?.directFileBatteryFiles === 5 &&
        mixedDirectoryBody.totals?.proofDebtFiles >= 1 &&
        mixedGeneratedCacheFiles.length === 0 &&
        mixedBadFile?.verdict === 'HAS_NEGATIVE_BYTES' &&
        mixedDirectDockerFile?.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        mixedDirectDockerFile?.directFileBatteryApplied === true &&
        mixedBadDirectGoFile?.verdict === 'HAS_NEGATIVE_BYTES' &&
        mixedBadDirectGoFile?.directFileBatteryApplied === true &&
        mixedBadDirectJsonFile?.verdict === 'HAS_NEGATIVE_BYTES' &&
        mixedBadDirectJsonFile?.directFileBatteryApplied === true &&
        mixedUnjudgedFile?.sha256 === sha(mdSource) &&
        mixedUnjudgedFile?.verdict === 'UNJUDGED' &&
        mixedUnjudgedFile?.sourceLensApplied === false,
      mixedDirectoryBody,
    );

    record(
      'atomic_scan_bytes is read-only on disk fixtures',
      fs.readFileSync(path.join(repoRoot, positiveRel), 'utf8') === positiveSource &&
        fs.readFileSync(path.join(repoRoot, badRel), 'utf8') === badSource &&
        fs.readFileSync(path.join(repoRoot, mdRel), 'utf8') === mdSource &&
        fs.readFileSync(path.join(repoRoot, directMdRel), 'utf8') === directMdSource &&
        fs.readFileSync(path.join(repoRoot, directDockerRel), 'utf8') === directDockerSource &&
        fs.readFileSync(path.join(repoRoot, directGoRel), 'utf8') === directGoSource &&
        fs.readFileSync(path.join(repoRoot, generatedCacheRel), 'utf8') === generatedCacheSource &&
        fs.readFileSync(path.join(repoRoot, badDirectGoRel), 'utf8') === badDirectGoSource &&
        fs.readFileSync(path.join(repoRoot, badDirectJsonRel), 'utf8') === badDirectJsonSource,
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
