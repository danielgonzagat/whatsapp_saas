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

function canonicalJson(value) {
  const norm = (v) => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === 'object') {
      const out = {};
      for (const key of Object.keys(v).sort()) out[key] = norm(v[key]);
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

function failedFactsHash(facts) {
  return sha(canonicalJson(facts));
}

function reorderObjectKeysDescending(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(reorderObjectKeysDescending);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort().reverse()) out[key] = reorderObjectKeysDescending(value[key]);
    return out;
  }
  return value;
}

function receiptHash(receipt) {
  const { receiptSha256, ...body } = receipt;
  return sha(canonicalJson(body));
}

function withReceiptHash(receipt) {
  const { receiptSha256, ...body } = receipt;
  return { ...body, receiptSha256: receiptHash(body) };
}

function gateRunHash(tree) {
  const { gateRunId, ...body } = tree;
  return sha(canonicalJson(body));
}

function withReceiptAndGateHashes(receipt) {
  const next = structuredClone(receipt);
  if (next.gateDecisionTree) next.gateDecisionTree.gateRunId = gateRunHash(next.gateDecisionTree);
  return withReceiptHash(next);
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

function receiptGate(receipt, id) {
  const gates = receipt?.gateDecisionTree?.gates;
  return Array.isArray(gates) ? gates.find((gate) => gate?.id === id) : undefined;
}

function hasPositiveByteGateDecisionTree(receipt) {
  const tree = receipt?.gateDecisionTree;
  const gates = tree?.gates;
  return (
    tree?.kind === 'positive-byte-gate-decision-tree' &&
    tree?.decision === 'accepted' &&
    typeof tree?.gateRunId === 'string' &&
    /^[0-9a-f]{64}$/.test(tree.gateRunId) &&
    Array.isArray(gates) &&
    receiptGate(receipt, 'chunk.sequence')?.status === 'passed' &&
    receiptGate(receipt, 'chunk.integrity')?.status === 'passed' &&
    receiptGate(receipt, 'content.integrity')?.status === 'passed' &&
    receiptGate(receipt, 'syntax.pre_disk')?.status === 'passed' &&
    Boolean(receiptGate(receipt, 'declared.verify.pre_disk')) &&
    receiptGate(receipt, 'target.materialization')?.status === 'passed' &&
    receiptGate(receipt, 'trace.independence')?.status === 'passed' &&
    Boolean(receiptGate(receipt, 'target.concurrency'))
  );
}

function hasPositiveByteRejectionGateDecisionTree(receipt, failedGate) {
  const tree = receipt?.gateDecisionTree;
  const gates = tree?.gates;
  return (
    receipt?.kind === 'positive-byte-materialization-rejection-receipt' &&
    receipt?.failedGate === failedGate &&
    tree?.kind === 'positive-byte-gate-decision-tree' &&
    tree?.decision === 'rejected' &&
    typeof tree?.gateRunId === 'string' &&
    /^[0-9a-f]{64}$/.test(tree.gateRunId) &&
    Array.isArray(gates) &&
    receiptGate(receipt, 'session.lookup')?.status === 'passed' &&
    receiptGate(receipt, failedGate)?.status === 'failed' &&
    receiptGate(receipt, 'session.cleanup')?.status === 'passed'
  );
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

    const acceptedPreDiskVerifyBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: {
        file: path.join(baseRel, 'pre-disk-verify.ts'),
        intent: 'accept verify modes only because positive-byte validation runs before target materialization',
        verify: 'typecheck',
        preview: true,
      },
    });
    const acceptedPreDiskVerifyBeginBody = lastJson(acceptedPreDiskVerifyBegin);
    record(
      'begin accepts verify once positive-byte validation is pre-disk',
      acceptedPreDiskVerifyBeginBody.ok === true &&
        acceptedPreDiskVerifyBeginBody.verify === 'typecheck' &&
        typeof acceptedPreDiskVerifyBeginBody.sessionId === 'string',
      acceptedPreDiskVerifyBeginBody,
    );
    if (typeof acceptedPreDiskVerifyBeginBody.sessionId === 'string') {
      await client.callTool({
        name: 'atomic_positive_bytes_abort',
        arguments: { sessionId: acceptedPreDiskVerifyBeginBody.sessionId },
      });
    }

    const uncoveredTypecheckRel = path.join('tmp', `.smoke-positive-byte-uncovered-typecheck-${process.pid}.ts`);
    const uncoveredTypecheckAbs = path.join(repoRoot, uncoveredTypecheckRel);
    const uncoveredTypecheckBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: {
        file: uncoveredTypecheckRel,
        intent: 'reject declared typecheck when no tsconfig covers the target before materialization',
        verify: 'typecheck',
        preview: true,
      },
    });
    const uncoveredTypecheckBeginBody = lastJson(uncoveredTypecheckBegin);
    const uncoveredTypecheckSessionId = uncoveredTypecheckBeginBody.sessionId;
    if (typeof uncoveredTypecheckSessionId === 'string') {
      const uncoveredTypecheckText = 'export const UNCOVERED_TYPECHECK = 1;\n';
      await client.callTool({
        name: 'atomic_positive_bytes_append',
        arguments: {
          sessionId: uncoveredTypecheckSessionId,
          index: 0,
          text: uncoveredTypecheckText,
          sha256: sha(uncoveredTypecheckText),
        },
      });
      const uncoveredTypecheckCommit = await client.callTool({
        name: 'atomic_positive_bytes_commit',
        arguments: { sessionId: uncoveredTypecheckSessionId },
      });
      const uncoveredTypecheckCommitBody = lastJson(uncoveredTypecheckCommit);
      const uncoveredTypecheckReceipt = uncoveredTypecheckCommitBody.rejectionReceipt;
      const uncoveredTypecheckFailedFacts = receiptGate(uncoveredTypecheckReceipt, 'declared.verify.pre_disk')?.facts;
      record(
        'declared typecheck rejects uncovered targets instead of passing as not-applicable',
        uncoveredTypecheckCommitBody.ok !== true &&
          uncoveredTypecheckReceipt?.failedGate === 'declared.verify.pre_disk' &&
          uncoveredTypecheckFailedFacts?.kind === 'typecheck' &&
          uncoveredTypecheckFailedFacts?.command === 'typecheck' &&
          uncoveredTypecheckFailedFacts?.replayCwd === repoRoot &&
          Array.isArray(uncoveredTypecheckFailedFacts?.replayArgv) &&
          uncoveredTypecheckFailedFacts.replayArgv.length === 0 &&
          uncoveredTypecheckFailedFacts?.targetRelPath === uncoveredTypecheckRel &&
          uncoveredTypecheckFailedFacts?.passed === false &&
          uncoveredTypecheckFailedFacts?.preDisk === true &&
          uncoveredTypecheckFailedFacts?.strategy === 'uncovered' &&
          /cannot be proven pre-disk/i.test(uncoveredTypecheckFailedFacts?.summary ?? '') &&
          /no tsconfig|not covered|uncovered/i.test(texts(uncoveredTypecheckCommit)) &&
          !fs.existsSync(uncoveredTypecheckAbs),
        uncoveredTypecheckCommitBody,
      );
      if (uncoveredTypecheckReceipt && names.has('atomic_positive_bytes_verify_receipt')) {
        const verifiedUncoveredTypecheckReceipt = await client.callTool({
          name: 'atomic_positive_bytes_verify_receipt',
          arguments: { receipt: uncoveredTypecheckReceipt, requireCurrentTarget: false },
        });
        const verifiedUncoveredTypecheckReceiptBody = lastJson(verifiedUncoveredTypecheckReceipt);
        record(
          'receipt verifier accepts uncovered-typecheck rejection receipts',
          verifiedUncoveredTypecheckReceiptBody.ok === true &&
            verifiedUncoveredTypecheckReceiptBody.rejected === true &&
            verifiedUncoveredTypecheckReceiptBody.failedGate === 'declared.verify.pre_disk' &&
            verifiedUncoveredTypecheckReceiptBody.failedGateFacts?.kind === 'typecheck' &&
            verifiedUncoveredTypecheckReceiptBody.failedGateFacts?.strategy === 'uncovered' &&
            verifiedUncoveredTypecheckReceiptBody.failedGateFacts?.passed === false &&
            verifiedUncoveredTypecheckReceiptBody.failedGateFacts?.preDisk === true &&
            verifiedUncoveredTypecheckReceiptBody.failedGateFacts?.replayCwd === repoRoot &&
            Array.isArray(verifiedUncoveredTypecheckReceiptBody.failedGateFacts?.replayArgv) &&
            verifiedUncoveredTypecheckReceiptBody.failedGateFacts.replayArgv.length === 0 &&
            verifiedUncoveredTypecheckReceiptBody.failedGateFacts?.targetRelPath === uncoveredTypecheckRel &&
            verifiedUncoveredTypecheckReceiptBody.failedGateFactsSha256 ===
              failedFactsHash(verifiedUncoveredTypecheckReceiptBody.failedGateFacts),
          verifiedUncoveredTypecheckReceiptBody,
        );
        const verifiedReorderedUncoveredTypecheckReceipt = await client.callTool({
          name: 'atomic_positive_bytes_verify_receipt',
          arguments: {
            receipt: reorderObjectKeysDescending(uncoveredTypecheckReceipt),
            requireCurrentTarget: false,
          },
        });
        const verifiedReorderedUncoveredTypecheckReceiptBody = lastJson(verifiedReorderedUncoveredTypecheckReceipt);
        record(
          'rejection receipt verifier accepts canonical hashes independent of object key order',
          verifiedReorderedUncoveredTypecheckReceiptBody.ok === true &&
            verifiedReorderedUncoveredTypecheckReceiptBody.rejected === true &&
            verifiedReorderedUncoveredTypecheckReceiptBody.receiptSha256 === uncoveredTypecheckReceipt.receiptSha256,
          verifiedReorderedUncoveredTypecheckReceiptBody,
        );
        const forgedRejectedReplayFacts = {
          replayCwd: repoRoot,
          replayArgv: ['--version'],
          targetRelPath: uncoveredTypecheckRel,
        };
        const forgedRejectedUncoveredTypecheckReceipt = withReceiptAndGateHashes({
          ...uncoveredTypecheckReceipt,
          gateDecisionTree: {
            ...uncoveredTypecheckReceipt.gateDecisionTree,
            gates: uncoveredTypecheckReceipt.gateDecisionTree.gates.map((gate) =>
              gate.id === 'declared.verify.pre_disk'
                ? { ...gate, facts: { ...gate.facts, ...forgedRejectedReplayFacts } }
                : gate,
            ),
          },
        });
        const rejectedForgedRejectedReplayReceipt = await client.callTool({
          name: 'atomic_positive_bytes_verify_receipt',
          arguments: { receipt: forgedRejectedUncoveredTypecheckReceipt, requireCurrentTarget: false },
        });
        const rejectedForgedRejectedReplayReceiptBody = lastJson(rejectedForgedRejectedReplayReceipt);
        record(
          'rejection receipt verifier rejects self-consistent receipts with forged replay facts',
          rejectedForgedRejectedReplayReceiptBody.ok !== true &&
            /replay|declared\.verify\.pre_disk/i.test(texts(rejectedForgedRejectedReplayReceipt)),
          rejectedForgedRejectedReplayReceiptBody,
        );
      } else {
        record('receipt verifier accepts uncovered-typecheck rejection receipts', false, {
          reason: 'missing rejection receipt or verifier tool',
        });
        record('rejection receipt verifier accepts canonical hashes independent of object key order', false, {
          reason: 'missing rejection receipt or verifier tool',
        });
        record('rejection receipt verifier rejects self-consistent receipts with forged replay facts', false, {
          reason: 'missing rejection receipt or verifier tool',
        });
      }
    } else {
      record('declared typecheck rejects uncovered targets instead of passing as not-applicable', false, uncoveredTypecheckBeginBody);
      record('receipt verifier accepts uncovered-typecheck rejection receipts', false, uncoveredTypecheckBeginBody);
      record('rejection receipt verifier accepts canonical hashes independent of object key order', false, uncoveredTypecheckBeginBody);
      record('rejection receipt verifier rejects self-consistent receipts with forged replay facts', false, uncoveredTypecheckBeginBody);
    }

    const previewBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: {
        file: previewRel,
        intent: 'preview a large generated file without touching disk',
        expectedContentSha256: contentSha256,
        verify: 'typecheck',
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
      previewBody.ok === true &&
        previewBody.preview === true &&
        previewBody.changed === false &&
        previewBody.contentSha256 === contentSha256 &&
        previewBody.verify?.kind === 'typecheck' &&
        previewBody.verify?.passed === true &&
        previewBody.verify?.preDisk === true &&
        !fs.existsSync(previewAbs),
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
        previewReceipt.verify === 'typecheck' &&
        previewReceipt.preDiskVerify?.kind === 'typecheck' &&
        previewReceipt.preDiskVerify?.passed === true &&
        previewReceipt.preDiskVerify?.preDisk === true &&
        previewReceipt.preDiskVerify?.replayCwd === sourceDir &&
        Array.isArray(previewReceipt.preDiskVerify?.replayArgv) &&
        previewReceipt.preDiskVerify.replayArgv.join('\u0000') === ['--noEmit', '-p', 'tsconfig.json'].join('\u0000') &&
        previewReceipt.preDiskVerify?.targetRelPath === previewRel &&
        previewReceipt.materialization?.preDiskVerify?.kind === 'typecheck' &&
        receiptGate(previewReceipt, 'declared.verify.pre_disk')?.status === 'passed' &&
        receiptGate(previewReceipt, 'declared.verify.pre_disk')?.facts?.requestedVerify === 'typecheck' &&
        receiptGate(previewReceipt, 'declared.verify.pre_disk')?.facts?.replayCwd === sourceDir &&
        Array.isArray(receiptGate(previewReceipt, 'declared.verify.pre_disk')?.facts?.replayArgv) &&
        receiptGate(previewReceipt, 'declared.verify.pre_disk')?.facts?.replayArgv.join('\u0000') === ['--noEmit', '-p', 'tsconfig.json'].join('\u0000') &&
        receiptGate(previewReceipt, 'declared.verify.pre_disk')?.facts?.targetRelPath === previewRel &&
        previewReceipt.validation?.syntaxErrorsAfter === 0 &&
        previewReceipt.receiptSha256 === receiptHash(previewReceipt) &&
        Array.isArray(previewReceipt.chunks) &&
        previewReceipt.chunks.length === chunks.length &&
        previewReceipt.chunks.every((chunk, index) => chunk.index === index && chunk.sha256 === sha(chunks[index])) &&
        hasPositiveByteGateDecisionTree(previewReceipt) &&
        receiptGate(previewReceipt, 'target.concurrency')?.status === 'unjudged',
      { previewReceipt },
    );

    if (names.has('atomic_positive_bytes_verify_receipt')) {
      const verifiedPreviewReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: previewReceipt, requireCurrentTarget: false },
      });
      const verifiedPreviewReceiptBody = lastJson(verifiedPreviewReceipt);
      record(
        'receipt verifier accepts declared pre-disk verify receipts',
        verifiedPreviewReceiptBody.ok === true &&
          verifiedPreviewReceiptBody.receiptHashValid === true &&
          verifiedPreviewReceiptBody.contentSha256 === contentSha256,
        verifiedPreviewReceiptBody,
      );
      const verifiedReorderedPreviewReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: {
          receipt: reorderObjectKeysDescending(previewReceipt),
          requireCurrentTarget: false,
        },
      });
      const verifiedReorderedPreviewReceiptBody = lastJson(verifiedReorderedPreviewReceipt);
      record(
        'receipt verifier accepts accepted receipt canonical hashes independent of object key order',
        verifiedReorderedPreviewReceiptBody.ok === true &&
          verifiedReorderedPreviewReceiptBody.receiptHashValid === true &&
          verifiedReorderedPreviewReceiptBody.receiptSha256 === previewReceipt.receiptSha256,
        verifiedReorderedPreviewReceiptBody,
      );
      const forgedPreDiskVerifyReceipt = withReceiptAndGateHashes({
        ...previewReceipt,
        preDiskVerify: { ...previewReceipt.preDiskVerify, preDisk: false },
        materialization: {
          ...previewReceipt.materialization,
          preDiskVerify: { ...previewReceipt.materialization.preDiskVerify, preDisk: false },
        },
        gateDecisionTree: {
          ...previewReceipt.gateDecisionTree,
          gates: previewReceipt.gateDecisionTree.gates.map((gate) =>
            gate.id === 'declared.verify.pre_disk'
              ? { ...gate, facts: { ...gate.facts, preDisk: false } }
              : gate,
          ),
        },
      });
      const rejectedForgedPreDiskVerifyReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: forgedPreDiskVerifyReceipt, requireCurrentTarget: false },
      });
      const rejectedForgedPreDiskVerifyReceiptBody = lastJson(rejectedForgedPreDiskVerifyReceipt);
      record(
        'receipt verifier rejects self-consistent receipts with forged pre-disk verify facts',
        rejectedForgedPreDiskVerifyReceiptBody.ok !== true &&
          /preDiskVerify|declared\.verify\.pre_disk/i.test(texts(rejectedForgedPreDiskVerifyReceipt)),
        rejectedForgedPreDiskVerifyReceiptBody,
      );
      const forgedReplayFacts = {
        replayCwd: repoRoot,
        replayArgv: ['--version'],
        targetRelPath: previewRel,
      };
      const forgedReplayReceipt = withReceiptAndGateHashes({
        ...previewReceipt,
        preDiskVerify: { ...previewReceipt.preDiskVerify, ...forgedReplayFacts },
        materialization: {
          ...previewReceipt.materialization,
          preDiskVerify: { ...previewReceipt.materialization.preDiskVerify, ...forgedReplayFacts },
        },
        gateDecisionTree: {
          ...previewReceipt.gateDecisionTree,
          gates: previewReceipt.gateDecisionTree.gates.map((gate) =>
            gate.id === 'declared.verify.pre_disk'
              ? { ...gate, facts: { ...gate.facts, ...forgedReplayFacts } }
              : gate,
          ),
        },
      });
      const rejectedForgedReplayReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: forgedReplayReceipt, requireCurrentTarget: false },
      });
      const rejectedForgedReplayReceiptBody = lastJson(rejectedForgedReplayReceipt);
      record(
        'receipt verifier rejects self-consistent receipts with forged replay facts',
        rejectedForgedReplayReceiptBody.ok !== true &&
          /replay|declared\.verify\.pre_disk/i.test(texts(rejectedForgedReplayReceipt)),
        rejectedForgedReplayReceiptBody,
      );
      const relativeReplayCwdFacts = {
        replayCwd: path.relative(repoRoot, sourceDir),
        replayArgv: ['--noEmit', '-p', 'tsconfig.json'],
        targetRelPath: previewRel,
      };
      const relativeReplayCwdReceipt = withReceiptAndGateHashes({
        ...previewReceipt,
        preDiskVerify: { ...previewReceipt.preDiskVerify, ...relativeReplayCwdFacts },
        materialization: {
          ...previewReceipt.materialization,
          preDiskVerify: { ...previewReceipt.materialization.preDiskVerify, ...relativeReplayCwdFacts },
        },
        gateDecisionTree: {
          ...previewReceipt.gateDecisionTree,
          gates: previewReceipt.gateDecisionTree.gates.map((gate) =>
            gate.id === 'declared.verify.pre_disk'
              ? { ...gate, facts: { ...gate.facts, ...relativeReplayCwdFacts } }
              : gate,
          ),
        },
      });
      const rejectedRelativeReplayCwdReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: relativeReplayCwdReceipt, requireCurrentTarget: false },
      });
      const rejectedRelativeReplayCwdReceiptBody = lastJson(rejectedRelativeReplayCwdReceipt);
      record(
        'receipt verifier rejects relative replay cwd facts',
        rejectedRelativeReplayCwdReceiptBody.ok !== true &&
          /replayCwd|absolute|declared\.verify\.pre_disk/i.test(texts(rejectedRelativeReplayCwdReceipt)),
        rejectedRelativeReplayCwdReceiptBody,
      );
    } else {
      record('receipt verifier accepts declared pre-disk verify receipts', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier accepts accepted receipt canonical hashes independent of object key order', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with forged pre-disk verify facts', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with forged replay facts', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects relative replay cwd facts', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
    }

    const commitBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: {
        file: commitRel,
        intent: 'commit a large generated file as one positive-byte transaction',
        expectedSha256: sha(''),
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
        commitReceipt.expectedSha256 === sha('') &&
        commitReceipt.beforeSha256 === sha('') &&
        commitReceipt.finalTargetState === 'written' &&
        commitReceipt.validation?.syntaxErrorsAfter === 0 &&
        commitReceipt.receiptSha256 === receiptHash(commitReceipt) &&
        commitReceipt.merkleRoot === commitBody.materialization?.merkleRoot &&
        Array.isArray(commitReceipt.chunks) &&
        commitReceipt.chunks.length === chunks.length &&
        commitReceipt.chunks.every((chunk, index) => chunk.index === index && chunk.sha256 === sha(chunks[index])) &&
        hasPositiveByteGateDecisionTree(commitReceipt) &&
        receiptGate(commitReceipt, 'target.concurrency')?.status === 'passed' &&
        receiptGate(commitReceipt, 'target.concurrency')?.facts?.expectedSha256 === sha('') &&
        receiptGate(commitReceipt, 'target.concurrency')?.facts?.beforeSha256 === sha(''),
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
      const { gateDecisionTree: _missingGateDecisionTree, ...receiptWithoutGateDecisionTree } = commitReceipt;
      const missingGateTreeReceipt = withReceiptHash(receiptWithoutGateDecisionTree);
      const rejectedMissingGateTreeReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: missingGateTreeReceipt, requireCurrentTarget: false },
      });
      const rejectedMissingGateTreeReceiptBody = lastJson(rejectedMissingGateTreeReceipt);
      record(
        'receipt verifier rejects self-consistent receipts without a gate decision tree',
        rejectedMissingGateTreeReceiptBody.ok !== true && /gateDecisionTree/i.test(texts(rejectedMissingGateTreeReceipt)),
        rejectedMissingGateTreeReceiptBody,
      );
      const forgedExpectedShaReceipt = withReceiptAndGateHashes({
        ...commitReceipt,
        expectedSha256: sha('forged-before-world'),
        gateDecisionTree: {
          ...commitReceipt.gateDecisionTree,
          gates: commitReceipt.gateDecisionTree.gates.map((gate) =>
            gate.id === 'target.concurrency'
              ? {
                  ...gate,
                  facts: {
                    ...gate.facts,
                    expectedSha256Declared: true,
                    expectedSha256: sha('forged-before-world'),
                  },
                }
              : gate,
          ),
        },
      });
      const rejectedForgedExpectedShaReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: forgedExpectedShaReceipt, requireCurrentTarget: false },
      });
      const rejectedForgedExpectedShaReceiptBody = lastJson(rejectedForgedExpectedShaReceipt);
      record(
        'receipt verifier rejects self-consistent receipts with forged expected world hash',
        rejectedForgedExpectedShaReceiptBody.ok !== true && /expectedSha256.*beforeSha256/i.test(texts(rejectedForgedExpectedShaReceipt)),
        rejectedForgedExpectedShaReceiptBody,
      );
      const forgedTargetGateReceipt = withReceiptAndGateHashes({
        ...commitReceipt,
        gateDecisionTree: {
          ...commitReceipt.gateDecisionTree,
          gates: commitReceipt.gateDecisionTree.gates.map((gate) =>
            gate.id === 'target.resolve'
              ? { ...gate, facts: { ...gate.facts, created: false, targetExisted: true } }
              : gate,
          ),
        },
      });
      const rejectedForgedTargetGateReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: forgedTargetGateReceipt, requireCurrentTarget: false },
      });
      const rejectedForgedTargetGateReceiptBody = lastJson(rejectedForgedTargetGateReceipt);
      record(
        'receipt verifier rejects self-consistent receipts with forged gate target facts',
        rejectedForgedTargetGateReceiptBody.ok !== true && /gateDecisionTree.*target\.resolve/i.test(texts(rejectedForgedTargetGateReceipt)),
        rejectedForgedTargetGateReceiptBody,
      );
    } else {
      record('receipt verifier independently validates receipt hash, Merkle root, and current target bytes', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects tampered receipt bodies', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with broken domain invariants', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with inconsistent final target state', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with inconsistent creation facts', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts without a gate decision tree', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with forged expected world hash', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('receipt verifier rejects self-consistent receipts with forged gate target facts', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
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
        tamperBody.rejectionReceipt?.kind === 'positive-byte-materialization-rejection-receipt' &&
        tamperBody.rejectionReceipt?.failedGate === 'chunk.integrity' &&
        tamperBody.rejectionReceipt?.receiptSha256 === receiptHash(tamperBody.rejectionReceipt) &&
        tamperBody.rejectionReceipt?.gateDecisionTree?.decision === 'rejected' &&
        tamperBody.rejectionReceipt?.gateDecisionTree?.gateRunId === gateRunHash(tamperBody.rejectionReceipt.gateDecisionTree) &&
        hasPositiveByteRejectionGateDecisionTree(tamperBody.rejectionReceipt, 'chunk.integrity') &&
        !fs.existsSync(tamperAbs) &&
        !fs.existsSync(tamperSessionDir),
      {
        tamperBody,
        tamperText,
        targetExists: fs.existsSync(tamperAbs),
        sessionDirExists: fs.existsSync(tamperSessionDir),
      },
    );
    const tamperRejectionReceipt = tamperBody.rejectionReceipt ?? {};
    if (names.has('atomic_positive_bytes_verify_receipt')) {
      const verifiedTamperRejection = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: tamperRejectionReceipt, requireCurrentTarget: false },
      });
      const verifiedTamperRejectionBody = lastJson(verifiedTamperRejection);
      record(
        'rejection receipt verifier independently validates chunk-integrity refusal and cleanup facts',
        verifiedTamperRejectionBody.ok === true &&
          verifiedTamperRejectionBody.rejected === true &&
          verifiedTamperRejectionBody.failedGate === 'chunk.integrity' &&
          verifiedTamperRejectionBody.targetWrite === 'not-attempted' &&
          verifiedTamperRejectionBody.cleanup === 'session-dropped',
        verifiedTamperRejectionBody,
      );
      const forgedRejectionGateReceipt = hasPositiveByteRejectionGateDecisionTree(tamperRejectionReceipt, 'chunk.integrity')
        ? withReceiptAndGateHashes({
            ...tamperRejectionReceipt,
            gateDecisionTree: {
              ...tamperRejectionReceipt.gateDecisionTree,
              gates: tamperRejectionReceipt.gateDecisionTree.gates.map((gate) =>
                gate.id === 'session.lookup'
                  ? { ...gate, facts: { ...gate.facts, chunkCount: gate.facts.chunkCount + 1 } }
                  : gate,
              ),
            },
          })
        : {};
      const rejectedForgedRejectionReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: forgedRejectionGateReceipt, requireCurrentTarget: false },
      });
      const rejectedForgedRejectionReceiptBody = lastJson(rejectedForgedRejectionReceipt);
      record(
        'rejection receipt verifier rejects self-consistent receipts with forged session facts',
        rejectedForgedRejectionReceiptBody.ok !== true && /rejection receipt.*session\.lookup/i.test(texts(rejectedForgedRejectionReceipt)),
        rejectedForgedRejectionReceiptBody,
      );
    } else {
      record('rejection receipt verifier independently validates chunk-integrity refusal and cleanup facts', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
      record('rejection receipt verifier rejects self-consistent receipts with forged session facts', false, { reason: 'atomic_positive_bytes_verify_receipt is not registered' });
    }

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
        invalidBody.rejectionReceipt?.kind === 'positive-byte-materialization-rejection-receipt' &&
        invalidBody.rejectionReceipt?.failedGate === 'syntax.pre_disk' &&
        invalidBody.rejectionReceipt?.receiptSha256 === receiptHash(invalidBody.rejectionReceipt) &&
        invalidBody.rejectionReceipt?.gateDecisionTree?.decision === 'rejected' &&
        invalidBody.rejectionReceipt?.gateDecisionTree?.gateRunId === gateRunHash(invalidBody.rejectionReceipt.gateDecisionTree) &&
        hasPositiveByteRejectionGateDecisionTree(invalidBody.rejectionReceipt, 'syntax.pre_disk') &&
        !fs.existsSync(invalidAbs) &&
        !fs.existsSync(invalidSessionDir),
      {
        invalidBody,
        invalidText,
        targetExists: fs.existsSync(invalidAbs),
        sessionDirExists: fs.existsSync(invalidSessionDir),
      },
    );

    const lintPackageRel = path.join(baseRel, 'lint-package');
    const lintPackageAbs = path.join(repoRoot, lintPackageRel);
    const lintRel = path.join(lintPackageRel, 'lint-failure.ts');
    const lintAbs = path.join(repoRoot, lintRel);
    const fakeEslintPath = path.join(lintPackageAbs, 'node_modules', '.bin', 'eslint');
    fs.mkdirSync(path.dirname(fakeEslintPath), { recursive: true });
    fs.writeFileSync(path.join(lintPackageAbs, 'package.json'), '{"name":"atomic-positive-byte-lint-proof","private":true}\n');
    fs.writeFileSync(
      fakeEslintPath,
      [
        '#!/usr/bin/env node',
        "const fs = require('node:fs');",
        "let input = '';",
        "process.stdin.on('data', (chunk) => { input += chunk; });",
        "process.stdin.on('end', () => {",
        "  const filenameIndex = process.argv.indexOf('--stdin-filename');",
        "  const target = filenameIndex >= 0 ? process.argv[filenameIndex + 1] : '';",
        "  const targetExistedBeforeLint = target ? fs.existsSync(target) : null;",
        "  const message = targetExistedBeforeLint ? 'target already materialized before lint' : 'lint failure before materialization';",
        "  process.stdout.write(JSON.stringify([{ filePath: target, errorCount: 1, warningCount: 0, messages: [{ ruleId: 'fake/no-materialized-target', message, inputBytes: Buffer.byteLength(input) }] }]));",
        "  process.exit(targetExistedBeforeLint ? 2 : 1);",
        "});",
        '',
      ].join('\n'),
    );
    fs.chmodSync(fakeEslintPath, 0o755);
    const lintBegin = await client.callTool({
      name: 'atomic_positive_bytes_begin',
      arguments: {
        file: lintRel,
        intent: 'reject declared lint failure before target materialization with structured facts',
        verify: 'lint',
      },
    });
    const lintSessionId = lastJson(lintBegin).sessionId;
    const lintText = 'export const LINT_FAILURE = 1;\n';
    await client.callTool({
      name: 'atomic_positive_bytes_append',
      arguments: { sessionId: lintSessionId, index: 0, text: lintText, sha256: sha(lintText) },
    });
    const lintCommit = await client.callTool({
      name: 'atomic_positive_bytes_commit',
      arguments: { sessionId: lintSessionId },
    });
    const lintBody = lastJson(lintCommit);
    const lintReceipt = lintBody.rejectionReceipt;
    const lintFailedFacts = receiptGate(lintReceipt, 'declared.verify.pre_disk')?.facts;
    record(
      'declared lint failure rejects before target materialization with structured receipt facts',
      lintBody.ok !== true &&
        lintReceipt?.failedGate === 'declared.verify.pre_disk' &&
        lintFailedFacts?.kind === 'lint' &&
        lintFailedFacts?.command === `eslint --stdin --stdin-filename ${lintRel}` &&
        lintFailedFacts?.replayCwd === lintPackageAbs &&
        Array.isArray(lintFailedFacts?.replayArgv) &&
        lintFailedFacts.replayArgv.join('\u0000') === ['--stdin', '--stdin-filename', lintAbs, '--format', 'json'].join('\u0000') &&
        lintFailedFacts?.targetRelPath === lintRel &&
        lintFailedFacts?.passed === false &&
        lintFailedFacts?.preDisk === true &&
        lintFailedFacts?.strategy === 'eslint-stdin' &&
        /1 errors, 0 warnings/.test(lintFailedFacts?.summary ?? '') &&
        /file NOT modified/.test(texts(lintCommit)) &&
        !fs.existsSync(lintAbs),
      lintBody,
    );
    if (lintReceipt && names.has('atomic_positive_bytes_verify_receipt')) {
      const verifiedLintReceipt = await client.callTool({
        name: 'atomic_positive_bytes_verify_receipt',
        arguments: { receipt: lintReceipt, requireCurrentTarget: false },
      });
      const verifiedLintReceiptBody = lastJson(verifiedLintReceipt);
      record(
        'receipt verifier accepts structured declared-lint rejection receipts',
        verifiedLintReceiptBody.ok === true &&
          verifiedLintReceiptBody.rejected === true &&
          verifiedLintReceiptBody.failedGate === 'declared.verify.pre_disk' &&
          verifiedLintReceiptBody.failedGateFacts?.kind === 'lint' &&
          verifiedLintReceiptBody.failedGateFacts?.strategy === 'eslint-stdin' &&
          verifiedLintReceiptBody.failedGateFacts?.passed === false &&
          verifiedLintReceiptBody.failedGateFacts?.preDisk === true &&
          verifiedLintReceiptBody.failedGateFacts?.replayCwd === lintPackageAbs &&
          Array.isArray(verifiedLintReceiptBody.failedGateFacts?.replayArgv) &&
          verifiedLintReceiptBody.failedGateFacts.replayArgv.join('\u0000') === ['--stdin', '--stdin-filename', lintAbs, '--format', 'json'].join('\u0000') &&
          verifiedLintReceiptBody.failedGateFacts?.targetRelPath === lintRel &&
          verifiedLintReceiptBody.failedGateFactsSha256 === failedFactsHash(verifiedLintReceiptBody.failedGateFacts),
        verifiedLintReceiptBody,
      );
    } else {
      record('receipt verifier accepts structured declared-lint rejection receipts', false, {
        reason: 'missing lint rejection receipt or verifier tool',
      });
    }

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
