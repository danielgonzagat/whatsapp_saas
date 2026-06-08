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

function receiptHash(receipt) {
  const { receiptSha256, ...body } = receipt;
  return sha(JSON.stringify(body));
}

function withReceiptHash(receipt) {
  const { receiptSha256, ...body } = receipt;
  return { ...body, receiptSha256: receiptHash(body) };
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
  const tamperRel = path.join(baseRel, 'tampered-staging.ts');
  const invalidRel = path.join(baseRel, 'invalid-large.ts');
  const previewAbs = path.join(repoRoot, previewRel);
  const commitAbs = path.join(repoRoot, commitRel);
  const tamperAbs = path.join(repoRoot, tamperRel);
  const invalidAbs = path.join(repoRoot, invalidRel);

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
      [
        'atomic_positive_bytes_begin',
        'atomic_positive_bytes_append',
        'atomic_positive_bytes_commit',
        'atomic_positive_bytes_abort',
        'atomic_positive_bytes_verify_receipt',
      ].every((name) => names.has(name)),
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
    const previewReceipt = previewBody.proofReceipt ?? {};
    record(
      'preview emits an in-band proof-carrying receipt without relying on trace persistence',
      previewReceipt.kind === 'positive-byte-materialization-receipt' &&
        previewReceipt.sessionId === previewSessionId &&
        previewReceipt.intent === 'preview a large generated file without touching disk' &&
        previewReceipt.file === previewRel &&
        previewReceipt.contentSha256 === contentSha256 &&
        previewReceipt.finalTargetState === 'not-written-preview' &&
        previewReceipt.validation?.syntaxErrorsAfter === 0 &&
        previewReceipt.receiptSha256 === receiptHash(previewReceipt) &&
        Array.isArray(previewReceipt.chunks) &&
        previewReceipt.chunks.length === chunks.length &&
        previewReceipt.chunks.every((chunk, index) => chunk.index === index && chunk.sha256 === sha(chunks[index])),
      { previewReceipt },
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
    const receiptOperation = trace.operation ?? commitBody.operation;
    record(
      'commit materializes a large file as one audited positive-byte transaction',
      commitBody.ok === true &&
        commitBody.changed === true &&
        commitBody.created === true &&
        commitBody.contentSha256 === contentSha256 &&
        fs.readFileSync(commitAbs, 'utf8') === content &&
        receiptOperation === 'atomic_positive_bytes_commit',
      {
        commitBody,
        receiptOperation,
        traceOperation: trace.operation,
        commitOperation: commitBody.operation,
        contentLength: content.length,
      },
    );
    const commitReceipt = commitBody.proofReceipt ?? {};
    record(
      'commit emits a hash-verifiable in-band proof-carrying receipt for the materialized bytes',
      commitReceipt.kind === 'positive-byte-materialization-receipt' &&
        commitReceipt.sessionId === commitSessionId &&
        commitReceipt.intent === 'commit a large generated file as one positive-byte transaction' &&
        commitReceipt.file === commitRel &&
        commitReceipt.contentSha256 === contentSha256 &&
        commitReceipt.finalTargetState === 'written' &&
        commitReceipt.validation?.syntaxErrorsAfter === 0 &&
        commitReceipt.receiptSha256 === receiptHash(commitReceipt) &&
        commitReceipt.merkleRoot === commitBody.materialization?.merkleRoot &&
        Array.isArray(commitReceipt.chunks) &&
        commitReceipt.chunks.length === chunks.length &&
        commitReceipt.chunks.every((chunk, index) => chunk.index === index && chunk.sha256 === sha(chunks[index])),
      { commitReceipt },
    );
    if (names.has('atomic_positive_bytes_verify_receipt')) {
      const verifiedReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: commitReceipt, requireCurrentTarget: true },
      });
      const verifiedReceiptBody = lastJson(verifiedReceipt);
      record(
        'receipt verifier independently validates receipt hash, Merkle root, and current target bytes',
        verifiedReceiptBody.ok === true &&
          verifiedReceiptBody.receiptHashValid === true &&
          verifiedReceiptBody.merkleRootValid === true &&
          verifiedReceiptBody.currentTargetMatches === true &&
          verifiedReceiptBody.contentSha256 === contentSha256,
        verifiedReceiptBody,
      );
      const forgedReceipt = { ...commitReceipt, contentSha256: sha('forged') };
      const rejectedForgedReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: forgedReceipt, requireCurrentTarget: true },
      });
      const rejectedForgedReceiptBody = lastJson(rejectedForgedReceipt);
      record(
        'receipt verifier rejects tampered receipt bodies',
        rejectedForgedReceiptBody.ok !== true && /receipt sha256/i.test(texts(rejectedForgedReceipt)),
        rejectedForgedReceiptBody,
      );
      const internallyInvalidReceipt = withReceiptHash({
        ...commitReceipt,
        chunkCount: commitReceipt.chunkCount + 1,
        stagedBytes: commitReceipt.stagedBytes + 1,
        materialization: { ...commitReceipt.materialization, contentSha256: sha('domain-inconsistent') },
      });
      const rejectedInternallyInvalidReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: internallyInvalidReceipt, requireCurrentTarget: false },
      });
      const rejectedInternallyInvalidReceiptBody = lastJson(rejectedInternallyInvalidReceipt);
      record(
        'receipt verifier rejects self-consistent receipts with broken domain invariants',
        rejectedInternallyInvalidReceiptBody.ok !== true && /receipt.*(chunkCount|stagedBytes|materialization)/i.test(texts(rejectedInternallyInvalidReceipt)),
        rejectedInternallyInvalidReceiptBody,
      );
      const invalidFinalStateReceipt = withReceiptHash({
        ...commitReceipt,
        finalTargetState: 'not-written-preview',
      });
      const rejectedInvalidFinalStateReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: invalidFinalStateReceipt, requireCurrentTarget: false },
      });
      const rejectedInvalidFinalStateReceiptBody = lastJson(rejectedInvalidFinalStateReceipt);
      record(
        'receipt verifier rejects self-consistent receipts with inconsistent final target state',
        rejectedInvalidFinalStateReceiptBody.ok !== true &&
          /receipt.*(preview|finalTargetState|final target state)/i.test(texts(rejectedInvalidFinalStateReceipt)),
        rejectedInvalidFinalStateReceiptBody,
      );
      const invalidCreationFactsReceipt = withReceiptHash({
        ...commitReceipt,
        created: false,
      });
      const rejectedInvalidCreationFactsReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: invalidCreationFactsReceipt, requireCurrentTarget: false },
      });
      const rejectedInvalidCreationFactsReceiptBody = lastJson(rejectedInvalidCreationFactsReceipt);
      record(
        'receipt verifier rejects self-consistent receipts with inconsistent creation facts',
        rejectedInvalidCreationFactsReceiptBody.ok !== true &&
          /receipt.*(created|targetExisted|creation)/i.test(texts(rejectedInvalidCreationFactsReceipt)),
        rejectedInvalidCreationFactsReceiptBody,
      );
    } else {
      record('receipt verifier independently validates receipt hash, Merkle root, and current target bytes', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects tampered receipt bodies', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with broken domain invariants', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with inconsistent final target state', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with inconsistent creation facts', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
    }
    record(
      'commit response stays compact instead of echoing generated bytes',
      outputText.length < 16000 && !outputText.includes('POSITIVE_BYTE_0600'),
      { responseChars: outputText.length },
    );

    const tamperChunk = 'export const SAFE_STAGED_POSITIVE_BYTE = 1;\n';
    const tamperBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: { file: tamperRel, intent: 'refuse a staged chunk whose bytes changed after append' },
    });
    const tamperSessionId = lastJson(tamperBegin).sessionId;
    await client.callTool({
      name: 'atomic_positive_bytes_append',
      arguments: { sessionId: tamperSessionId, index: 0, text: tamperChunk, sha256: sha(tamperChunk) },
    });
    const tamperSessionDir = path.join(
      repoRoot,
      'scripts',
      'mcp',
      'atomic-edit',
      '.positive-byte-sessions',
      tamperSessionId,
    );
    const tamperChunkPath = path.join(tamperSessionDir, '00000000.chunk');
    fs.writeFileSync(tamperChunkPath, 'export const TAMPERED_STAGED_POSITIVE_BYTE = 2;\n');
    const tamperCommit = await client.callTool({
      name: 'atomic_positive_bytes_commit',
      arguments: { sessionId: tamperSessionId },
    });
    const tamperBody = lastJson(tamperCommit);
    const tamperText = texts(tamperCommit);
    record(
      'commit refuses tampered staged positive-byte chunk before target write and drops staging',
      tamperBody.ok !== true &&
        /chunk.*(mismatch|changed|tamper|sha256)/i.test(tamperText) &&
        /session .* dropped/i.test(tamperText) &&
        !fs.existsSync(tamperAbs) &&
        !fs.existsSync(tamperSessionDir),
      {
        tamperBody,
        tamperText,
        targetExists: fs.existsSync(tamperAbs),
        sessionDirExists: fs.existsSync(tamperSessionDir),
      },
    );

    const invalidChunks = [chunks[0], 'export function BROKEN_POSITIVE_BYTE( {\n'];
    const invalidContent = invalidChunks.join('');
    const invalidBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: {
        file: invalidRel,
        intent: 'refuse large generated bytes that fail the final syntax proof',
        expectedContentSha256: sha(invalidContent),
      },
    });
    const invalidSessionId = lastJson(invalidBegin).sessionId;
    for (const [index, text] of invalidChunks.entries()) {
      await client.callTool({
        name: 'atomic_positive_bytes_append',
        arguments: { sessionId: invalidSessionId, index, text, sha256: sha(text) },
      });
    }
    const invalidSessionDir = path.join(
      repoRoot,
      'scripts',
      'mcp',
      'atomic-edit',
      '.positive-byte-sessions',
      invalidSessionId,
    );
    const invalidCommit = await client.callTool({
      name: 'atomic_positive_bytes_commit',
      arguments: { sessionId: invalidSessionId },
    });
    const invalidBody = lastJson(invalidCommit);
    const invalidText = texts(invalidCommit);
    record(
      'commit refuses invalid large generated content before target write and drops staging',
      invalidBody.ok !== true &&
        /syntax error/i.test(invalidText) &&
        /session .* dropped/i.test(invalidText) &&
        !fs.existsSync(invalidAbs) &&
        !fs.existsSync(invalidSessionDir),
      {
        invalidBody,
        invalidText,
        targetExists: fs.existsSync(invalidAbs),
        sessionDirExists: fs.existsSync(invalidSessionDir),
      },
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
