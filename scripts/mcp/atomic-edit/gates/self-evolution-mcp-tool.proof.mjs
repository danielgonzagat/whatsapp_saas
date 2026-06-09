#!/usr/bin/env node
/**
 * self-evolution-mcp-tool.proof.mjs - proves the self-evolution kernel is a real Atomic MCP capability.
 *
 * The previous harness could be invoked as a script. That is useful but not enough for Y: the
 * capability must be available through the Atomic action layer, callable by the stable single-tool
 * path, and honest about rejected variants/forged receipts.
 */
import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPromotionReceipt, buildArchiveEntry, promotionReceiptHash } from '../self-evolution-harness.mjs';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '../../..');
const serverSource = fs.readFileSync(path.join(sourceDir, 'server.ts'), 'utf8');
const toolSource = fs.readFileSync(path.join(sourceDir, 'server-tools-self-evolution.ts'), 'utf8');

const results = [];
function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}
function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function singleTool(args) {
  const child = childProcess.spawnSync(process.execPath, [path.join(sourceDir, 'dist', 'server.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '1',
      ATOMIC_SINGLE_TOOL_NAME: 'atomic_self_evolution',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: JSON.stringify(args),
      ATOMIC_DISABLE_HOT_RELOAD: '1',
      CODEX_PROJECT_DIR: repoRoot,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let payload = null;
  try {
    payload = JSON.parse(child.stdout.trim() || '{}');
  } catch {
    payload = { parseError: child.stdout };
  }
  const content = Array.isArray(payload?.result?.content) ? payload.result.content : [];
  let machine = null;
  try {
    const text = content.length > 0 ? content[content.length - 1].text : '{}';
    machine = JSON.parse(text || '{}');
  } catch {
    machine = { parseError: content };
  }
  return { status: child.status, stderr: child.stderr, payload, machine };
}

const policy = {
  policyId: 'atomic-self-evolution-mcp-v1',
  benchmarkSuiteSha256: sha({ suite: 'self-evolution-mcp', version: 1 }),
  evaluatorSha256: sha({ evaluator: 'kernel-fixed-promotion-rules', version: 1 }),
  requiredGates: ['build', 'type', 'security', 'no-bypass', 'positive-byte-proof'],
  safetyCeilings: {
    bypassesIntroduced: 0,
    invalidCommits: 0,
    receiptForgeryAccepted: 0,
  },
};
const parent = {
  variantId: 'atomic-parent-mcp',
  parentId: null,
  evaluatorSha256: policy.evaluatorSha256,
  benchmarkSuiteSha256: policy.benchmarkSuiteSha256,
  metrics: {
    publicScore: 100,
    holdoutScore: 100,
    proofCoverage: 20,
    semanticOperators: 12,
    medianLatencyMs: 1000,
    bypassesIntroduced: 0,
    invalidCommits: 0,
    receiptForgeryAccepted: 0,
  },
  gates: policy.requiredGates.map((id) => ({ id, status: 'passed' })),
};
const stronger = {
  ...parent,
  variantId: 'atomic-child-mcp-stronger',
  parentId: parent.variantId,
  metrics: {
    ...parent.metrics,
    publicScore: 103,
    holdoutScore: 102,
    proofCoverage: 21,
    semanticOperators: 13,
    medianLatencyMs: 940,
  },
};
const unsafe = {
  ...stronger,
  variantId: 'atomic-child-mcp-unsafe',
  metrics: {
    ...stronger.metrics,
    bypassesIntroduced: 1,
  },
  gates: stronger.gates.map((gate) => gate.id === 'no-bypass' ? { ...gate, status: 'failed' } : gate),
};

record(
  'server imports and registers the self-evolution MCP tool module',
  /import \{ registerToolsSelfEvolution \} from ['"]\.\/server-tools-self-evolution\.js['"]/.test(serverSource) &&
    /registerToolsSelfEvolution\(server\);/.test(serverSource),
  {
    hasImport: serverSource.includes('registerToolsSelfEvolution'),
    hasRegisterCall: serverSource.includes('registerToolsSelfEvolution(server);'),
  },
);

record(
  'tool implementation runs the harness through node argv without shell dispatch',
  toolSource.includes('childProcess.spawnSync(process.execPath') &&
    toolSource.includes('self-evolution-harness.mjs') &&
    toolSource.includes('verify-archive-chain') &&
    toolSource.includes('verify-archive-jsonl') &&
    toolSource.includes('append-archive-jsonl') &&
    !toolSource.includes("'/bin/bash'") &&
    !toolSource.includes('"/bin/bash"'),
  {
    usesNodeArgv: toolSource.includes('childProcess.spawnSync(process.execPath'),
    referencesHarness: toolSource.includes('self-evolution-harness.mjs'),
    exposesArchiveChain: toolSource.includes('verify-archive-chain'),
    exposesArchiveJsonl: toolSource.includes('verify-archive-jsonl'),
    exposesAppendArchiveJsonl: toolSource.includes('append-archive-jsonl'),
    noBash: !toolSource.includes("'/bin/bash'") && !toolSource.includes('"/bin/bash"'),
  },
);

const selfTest = singleTool({ mode: 'self-test' });
record(
  'atomic_self_evolution single-call self-test returns accepted MCP JSON',
  selfTest.status === 0 &&
    selfTest.payload?.ok === true &&
    selfTest.machine?.ok === true &&
    selfTest.machine?.accepted === true &&
    selfTest.machine?.harness?.ok === true,
  selfTest,
);

const receiptTool = singleTool({ mode: 'receipt', parent, candidate: stronger, policy });
const receipt = receiptTool.machine?.harness?.receipt;
record(
  'atomic_self_evolution emits a verifiable promotion receipt through MCP',
  receiptTool.status === 0 &&
    receiptTool.payload?.ok === true &&
    receiptTool.machine?.ok === true &&
    receiptTool.machine?.accepted === true &&
    receipt?.decision === 'promote' &&
    typeof receipt?.receiptSha256 === 'string',
  receiptTool,
);

const rejectedReceipt = buildPromotionReceipt({ parent, candidate: unsafe, policy });
const forgedBody = {
  ...rejectedReceipt,
  decision: 'promote',
  rejections: [],
  reasons: ['forged self-consistent MCP story'],
};
const forged = { ...forgedBody, receiptSha256: promotionReceiptHash(forgedBody) };
const forgedVerify = singleTool({ mode: 'verify-receipt', receipt: forged });
record(
  'atomic_self_evolution returns forged receipt rejection as deterministic verifier output',
  forgedVerify.status === 0 &&
    forgedVerify.payload?.ok === true &&
    forgedVerify.machine?.ok === true &&
    forgedVerify.machine?.accepted === false &&
    forgedVerify.machine?.harness?.ok === false &&
    /decision|recompute|contradict/i.test(String(forgedVerify.machine?.harness?.error ?? '')),
  forgedVerify,
);

const firstChainEntry = buildArchiveEntry({
  archiveId: 'atomic-self-evolution-mcp-proof-chain',
  receipt: buildPromotionReceipt({ parent, candidate: stronger, policy }),
});
const secondChainEntry = buildArchiveEntry({
  archiveId: 'atomic-self-evolution-mcp-proof-chain',
  previousEntry: firstChainEntry,
  receipt: rejectedReceipt,
});
const chainTool = singleTool({ mode: 'verify-archive-chain', entries: [firstChainEntry, secondChainEntry] });
record(
  'atomic_self_evolution verifies whole archive chains through MCP',
  chainTool.status === 0 &&
    chainTool.payload?.ok === true &&
    chainTool.machine?.ok === true &&
    chainTool.machine?.accepted === true &&
    chainTool.machine?.harness?.entryCount === 2 &&
    chainTool.machine?.harness?.headArchiveEntrySha256 === secondChainEntry.archiveEntrySha256,
  chainTool,
);

const archiveText = `${JSON.stringify(firstChainEntry)}\n${JSON.stringify(secondChainEntry)}\n`;
const archiveJsonlTool = singleTool({ mode: 'verify-archive-jsonl', archiveText });
record(
  'atomic_self_evolution verifies portable archive JSONL text through MCP',
  archiveJsonlTool.status === 0 &&
    archiveJsonlTool.payload?.ok === true &&
    archiveJsonlTool.machine?.ok === true &&
    archiveJsonlTool.machine?.accepted === true &&
    archiveJsonlTool.machine?.harness?.format === 'jsonl' &&
    archiveJsonlTool.machine?.harness?.entryCount === 2,
  archiveJsonlTool,
);

const appendArchiveJsonlTool = singleTool({
  mode: 'append-archive-jsonl',
  archiveText: `${JSON.stringify(firstChainEntry)}\n`,
  receipt: rejectedReceipt,
});
record(
  'atomic_self_evolution appends and re-verifies archive JSONL text through MCP',
  appendArchiveJsonlTool.status === 0 &&
    appendArchiveJsonlTool.payload?.ok === true &&
    appendArchiveJsonlTool.machine?.ok === true &&
    appendArchiveJsonlTool.machine?.accepted === true &&
    appendArchiveJsonlTool.machine?.harness?.entry?.sequence === 2 &&
    appendArchiveJsonlTool.machine?.harness?.chain?.entryCount === 2,
  appendArchiveJsonlTool,
);

const archiveTool = singleTool({ mode: 'archive-entry', archiveId: 'atomic-self-evolution-mcp-proof', receipt });
record(
  'atomic_self_evolution appends promotion receipts into a tamper-evident archive entry through MCP',
  archiveTool.status === 0 &&
    archiveTool.payload?.ok === true &&
    archiveTool.machine?.ok === true &&
    archiveTool.machine?.accepted === true &&
    archiveTool.machine?.harness?.entry?.sequence === 1 &&
    archiveTool.machine?.harness?.entry?.receiptSha256 === receipt?.receiptSha256,
  archiveTool,
);

function finish(payload) { const text = jsonMode ? JSON.stringify(payload, null, 2) + '\n' : payload.results.map((entry) => `${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`).join('\n') + '\n'; process.stdout.write(text, () => process.exit(payload.ok ? 0 : 1)); }

const payload = { ok: results.every((entry) => entry.ok), results };
finish(payload);
