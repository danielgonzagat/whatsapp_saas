import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const results = [];

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function record(name, ok, detail = {}) {
  results.push({ name, ok, detail });
}

function texts(result) {
  return (result.content ?? []).map((part) => part.text ?? '').join('\n');
}

function lastJson(result) {
  const parts = [...(result.content ?? [])].reverse();
  for (const part of parts) {
    try {
      return JSON.parse(part.text ?? '{}');
    } catch {
      // keep scanning content blocks
    }
  }
  throw new Error(`no JSON content block in response: ${texts(result)}`);
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
  const client = new Client({ name: 'atomic-read-file-proof', version: '1.0.0' });
  const baseRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-atomic-read-proof-${process.pid}`);
  const baseAbs = path.join(repoRoot, baseRel);
  const positiveRel = path.join('scripts', 'mcp', 'atomic-edit', 'server.ts');
  const badRel = path.join(baseRel, 'read-bad.ts');
  const mdRel = path.join(baseRel, 'read-notes.md');
  const dockerRel = path.join(baseRel, 'Dockerfile');
  const goRel = path.join(baseRel, 'read-main.go');
  const badGoRel = path.join(baseRel, 'read-broken.go');
  const badJsonRel = path.join(baseRel, 'read-broken.json');
  const positiveSource = fs.readFileSync(path.join(repoRoot, positiveRel), 'utf8');
  const missingSpecifier = './missing-read-target';
  const badSource = [
    word([105, 109, 112, 111, 114, 116]),
    ' { MissingReadTarget } ',
    word([102, 114, 111, 109]),
    " '",
    missingSpecifier,
    "';\n",
    'export const READ_BAD = MissingReadTarget;\n',
  ].join('');
  const mdSource = '# Atomic read proof\nThis file is outside the TS/JS lens battery.\n';
  const dockerSource = 'FROM scratch\n# Atomic direct text battery\n';
  const goSource = 'package main\nfunc main() { println("atomic") }\n';
  const badGoSource = 'package main\nfunc main() { println("atomic" \n';
  const badJsonSource = '{"atomic": ';

  try {
    fs.mkdirSync(baseAbs, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, badRel), badSource);
    fs.writeFileSync(path.join(repoRoot, mdRel), mdSource);
    fs.writeFileSync(path.join(repoRoot, dockerRel), dockerSource);
    fs.writeFileSync(path.join(repoRoot, goRel), goSource);
    fs.writeFileSync(path.join(repoRoot, badGoRel), badGoSource);
    fs.writeFileSync(path.join(repoRoot, badJsonRel), badJsonSource);

    await client.connect(transport);
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    record('atomic_read_file is registered', names.has('atomic_read_file'), {
      readTools: [...names].filter((name) => name.includes('read') || name.includes('lens')),
    });

    const positive = await client.callTool({
      name: 'atomic_read_file',
      arguments: { file: positiveRel, startLine: 1, endLine: 5, includeContent: false },
    });
    const positiveBody = lastJson(positive);
    record(
      'source range read returns hash, byte range, and positive declared-battery zone',
      positiveBody.ok === true &&
        positiveBody.sha256 === sha(positiveSource) &&
        positiveBody.range?.startLine === 1 &&
        positiveBody.range?.endLine === 5 &&
        positiveBody.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        positiveBody.sourceLensApplied === true &&
        positiveBody.negativeByteEvidenceCount === 0 &&
        positiveBody.zones?.some((zone) => zone.classification === 'positive-within-declared-battery'),
      positiveBody,
    );

    const bad = await client.callTool({ name: 'atomic_read_file', arguments: { file: badRel } });
    const badBody = lastJson(bad);
    record(
      'read of dangling relative import surfaces negative byte evidence instead of raw-only bytes',
      badBody.ok === true &&
        badBody.verdict === 'HAS_NEGATIVE_BYTES' &&
        badBody.negativeByteEvidenceCount > 0 &&
        badBody.zones?.some((zone) => zone.classification === 'negative') &&
        JSON.stringify(badBody).includes('missing-read-target'),
      badBody,
    );

    const md = await client.callTool({
      name: 'atomic_read_file',
      arguments: { file: mdRel, includeContent: false },
    });
    const mdBody = lastJson(md);
    record(
      'direct-file read applies declared text battery instead of unjudged proof debt',
      mdBody.ok === true &&
        mdBody.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        mdBody.sourceLensApplied === false &&
        mdBody.directFileBatteryApplied === true &&
        mdBody.contentIncluded === false &&
        mdBody.content === undefined &&
        mdBody.zones?.[0]?.classification === 'positive-within-declared-battery' &&
        mdBody.proofDebt?.length === 0 &&
        /Markdown text is UTF-8 readable/.test(mdBody.zones?.[0]?.reason ?? ''),
      mdBody,
    );

    const dockerfile = await client.callTool({
      name: 'atomic_read_file',
      arguments: { file: dockerRel, includeContent: false },
    });
    const dockerBody = lastJson(dockerfile);
    record(
      'direct-file read applies text battery to Dockerfile bytes',
      dockerBody.ok === true &&
        dockerBody.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        dockerBody.sourceLensApplied === false &&
        dockerBody.directFileBatteryApplied === true &&
        dockerBody.contentIncluded === false &&
        dockerBody.content === undefined &&
        dockerBody.zones?.[0]?.classification === 'positive-within-declared-battery' &&
        dockerBody.proofDebt?.length === 0 &&
        /Dockerfile text is UTF-8 readable/.test(dockerBody.zones?.[0]?.reason ?? ''),
      dockerBody,
    );

    const go = await client.callTool({
      name: 'atomic_read_file',
      arguments: { file: goRel, includeContent: false },
    });
    const goBody = lastJson(go);
    record(
      'direct-file read applies structural battery to Go bytes',
      goBody.ok === true &&
        goBody.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        goBody.sourceLensApplied === false &&
        goBody.directFileBatteryApplied === true &&
        goBody.contentIncluded === false &&
        goBody.content === undefined &&
        goBody.zones?.[0]?.classification === 'positive-within-declared-battery' &&
        goBody.proofDebt?.length === 0 &&
        /Go text passed Atomic structural balance battery/.test(goBody.zones?.[0]?.reason ?? ''),
      goBody,
    );

    const badGo = await client.callTool({
      name: 'atomic_read_file',
      arguments: { file: badGoRel, includeContent: false },
    });
    const badGoBody = lastJson(badGo);
    record(
      'direct-file read marks structurally broken Go bytes as negative',
      badGoBody.ok === true &&
        badGoBody.verdict === 'HAS_NEGATIVE_BYTES' &&
        badGoBody.sourceLensApplied === false &&
        badGoBody.directFileBatteryApplied === true &&
        badGoBody.contentIncluded === false &&
        badGoBody.content === undefined &&
        badGoBody.zones?.[0]?.classification === 'negative' &&
        badGoBody.negativeByteEvidenceCount > 0 &&
        badGoBody.proofDebt?.length === 0 &&
        /unclosed/.test(badGoBody.zones?.[0]?.reason ?? ''),
      badGoBody,
    );

    const badJson = await client.callTool({
      name: 'atomic_read_file',
      arguments: { file: badJsonRel, includeContent: false },
    });
    const badJsonBody = lastJson(badJson);
    record(
      'direct-file read marks invalid JSON bytes as negative',
      badJsonBody.ok === true &&
        badJsonBody.verdict === 'HAS_NEGATIVE_BYTES' &&
        badJsonBody.sourceLensApplied === false &&
        badJsonBody.directFileBatteryApplied === true &&
        badJsonBody.contentIncluded === false &&
        badJsonBody.content === undefined &&
        badJsonBody.zones?.[0]?.classification === 'negative' &&
        badJsonBody.negativeByteEvidenceCount > 0 &&
        badJsonBody.proofDebt?.length === 0 &&
        /JSON failed Atomic direct-file battery/.test(badJsonBody.zones?.[0]?.reason ?? ''),
      badJsonBody,
    );

    record(
      'atomic_read_file is read-only on disk fixtures',
      fs.readFileSync(path.join(repoRoot, positiveRel), 'utf8') === positiveSource &&
        fs.readFileSync(path.join(repoRoot, badRel), 'utf8') === badSource &&
        fs.readFileSync(path.join(repoRoot, mdRel), 'utf8') === mdSource &&
        fs.readFileSync(path.join(repoRoot, dockerRel), 'utf8') === dockerSource &&
        fs.readFileSync(path.join(repoRoot, goRel), 'utf8') === goSource &&
        fs.readFileSync(path.join(repoRoot, badGoRel), 'utf8') === badGoSource &&
        fs.readFileSync(path.join(repoRoot, badJsonRel), 'utf8') === badJsonSource,
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

try {
  await main();
} catch (error) {
  record('proof did not throw', false, { error: error instanceof Error ? error.message : String(error) });
}

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
}
if (!payload.ok) process.exit(1);
