#!/usr/bin/env node
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
  results.push({ name, ok: Boolean(ok), detail });
}

function texts(result) {
  return (result?.content ?? []).map((part) => part.text ?? '').join('\n');
}

function lastJson(result) {
  try {
    return JSON.parse(result.content.at(-1)?.text ?? '{}');
  } catch {
    return {};
  }
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
  const client = new Client({ name: 'positive-byte-materializer-proof', version: '1.0.0' });
  const baseRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-positive-byte-proof-${process.pid}`);
  const previewRel = path.join(baseRel, 'preview-large.ts');
  const commitRel = path.join(baseRel, 'commit-large.ts');
  const previewAbs = path.join(repoRoot, previewRel);
  const commitAbs = path.join(repoRoot, commitRel);

  const chunks = [];
  const lineCount = 1200;
  const linesPerChunk = 300;
  for (let start = 0; start < lineCount; start += linesPerChunk) {
    const lines = [];
    for (let i = start; i < Math.min(start + linesPerChunk, lineCount); i++) {
      lines.push(`export const POSITIVE_BYTE_${String(i).padStart(4, '0')} = ${i};`);
    }
    chunks.push(lines.join('\n') + '\n');
  }
  const content = chunks.join('');
  const contentSha256 = sha(content);

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    record(
      'positive-byte materializer tools are registered',
      ['atomic_positive_bytes_begin', 'atomic_positive_bytes_append', 'atomic_positive_bytes_commit', 'atomic_positive_bytes_abort'].every((name) => names.has(name)),
      { names: [...names].filter((name) => name.includes('positive_bytes')) },
    );

    const previewBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: {
        file: previewRel,
        intent: 'preview a large generated file without touching disk',
        expectedContentSha256: contentSha256,
        preview: true,
      },
    });
    const previewBeginBody = lastJson(previewBegin);
    const previewSessionId = previewBeginBody.sessionId;
    record('preview session starts without creating directories', previewBeginBody.ok === true && typeof previewSessionId === 'string' && !fs.existsSync(path.dirname(previewAbs)), previewBeginBody);

    for (const [index, text] of chunks.entries()) {
      const appended = await client.callTool({
        name: 'atomic_positive_bytes_append',
        arguments: { sessionId: previewSessionId, index, text, sha256: sha(text) },
      });
      const body = lastJson(appended);
      record(`preview chunk ${index} accepted`, body.ok === true && body.index === index && body.chunkSha256 === sha(text), body);
    }

    const previewCommit = await client.callTool({
      name: 'atomic_positive_bytes_commit',
      arguments: { sessionId: previewSessionId },
    });
    const previewBody = lastJson(previewCommit);
    record(
      'preview commit validates whole content but leaves disk untouched',
      previewBody.ok === true && previewBody.preview === true && previewBody.changed === false && previewBody.contentSha256 === contentSha256 && !fs.existsSync(previewAbs),
      { previewBody, fileExists: fs.existsSync(previewAbs) },
    );

    const commitBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: {
        file: commitRel,
        intent: 'commit a large generated file as one positive-byte transaction',
        expectedContentSha256: contentSha256,
      },
    });
    const commitSessionId = lastJson(commitBegin).sessionId;
    for (const [index, text] of chunks.entries()) {
      const appended = await client.callTool({
        name: 'atomic_positive_bytes_append',
        arguments: { sessionId: commitSessionId, index, text, sha256: sha(text) },
      });
      const body = lastJson(appended);
      record(`commit chunk ${index} accepted`, body.ok === true && body.index === index && body.chunkSha256 === sha(text), body);
    }
    const commit = await client.callTool({ name: 'atomic_positive_bytes_commit', arguments: { sessionId: commitSessionId } });
    const commitBody = lastJson(commit);
    const outputText = texts(commit);
    const tracePath = typeof commitBody.tracePath === 'string' ? path.join(repoRoot, commitBody.tracePath) : '';
    const trace = tracePath && fs.existsSync(tracePath) ? JSON.parse(fs.readFileSync(tracePath, 'utf8')) : {};
    record(
      'commit materializes a large file as one audited positive-byte transaction',
      commitBody.ok === true && commitBody.changed === true && commitBody.created === true && commitBody.contentSha256 === contentSha256 && fs.readFileSync(commitAbs, 'utf8') === content && trace.operation === 'atomic_positive_bytes_commit',
      { commitBody, traceOperation: trace.operation, contentLength: content.length },
    );
    record(
      'commit response stays compact instead of echoing generated bytes',
      outputText.length < 16000 && !outputText.includes('POSITIVE_BYTE_0600'),
      { responseChars: outputText.length },
    );

    const abortBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: { file: path.join(baseRel, 'abort.ts'), intent: 'abort staged generated bytes', expectedContentSha256: sha('x\n') },
    });
    const abortSessionId = lastJson(abortBegin).sessionId;
    await client.callTool({
      name: 'atomic_positive_bytes_append',
      arguments: { sessionId: abortSessionId, index: 0, text: 'x\n', sha256: sha('x\n') },
    });
    const abort = await client.callTool({ name: 'atomic_positive_bytes_abort', arguments: { sessionId: abortSessionId } });
    const abortBody = lastJson(abort);
    record('abort drops staged chunks without disk effect', abortBody.ok === true && abortBody.changed === false && !fs.existsSync(path.join(repoRoot, baseRel, 'abort.ts')), abortBody);
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors in proof cleanup
    }
    fs.rmSync(path.join(repoRoot, baseRel), { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  record('proof completed without uncaught error', false, { error: error instanceof Error ? error.message : String(error) });
}

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const result of results) process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}\n`);
process.exit(payload.ok ? 0 : 1);
