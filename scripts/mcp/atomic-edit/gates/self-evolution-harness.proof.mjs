#!/usr/bin/env node
/**
 * self-evolution-harness.proof.mjs — first falsifiable Atomic-DGM substrate proof.
 *
 * The harness is not allowed to promote a self-modified Atomic variant because it
 * tells a better story. Promotion requires a deterministic receipt: hard safety
 * gates green, no hidden benchmark regression, no bypass/invalid-write regression,
 * and at least one measured improvement over the parent. The receipt verifier must
 * recompute the decision from embedded facts, so a self-consistent hash forgery
 * cannot flip a rejected variant to accepted.
 */
import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  decidePromotion,
  buildPromotionReceipt,
  verifyPromotionReceipt,
  buildArchiveEntry,
  verifyArchiveEntry,
  verifyArchiveChain,
  verifyArchiveJsonl,
  appendArchiveJsonl,
} from '../self-evolution-harness.mjs';

const jsonMode = process.argv.includes('--json');
const harnessCliPath = fileURLToPath(new URL('../self-evolution-harness.mjs', import.meta.url));

function runCli(args, input) {
  const child = childProcess.spawnSync(process.execPath, [harnessCliPath, ...args], {
    encoding: 'utf8',
    input: input === undefined ? undefined : JSON.stringify(input),
    maxBuffer: 1024 * 1024,
  });
  let body = null;
  try {
    body = JSON.parse(child.stdout || '{}');
  } catch {
    body = { parseError: child.stdout };
  }
  return { status: child.status, stdout: child.stdout, stderr: child.stderr, body };
}

const results = [];
function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}
function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function rehashReceipt(receipt) {
  const body = { ...receipt };
  delete body.receiptSha256;
  return { ...body, receiptSha256: sha(body) };
}
function rehashArchiveEntry(entry) {
  const body = { ...entry };
  delete body.archiveEntrySha256;
  return { ...body, archiveEntrySha256: sha(body) };
}

const policy = {
  policyId: 'atomic-self-evolution-v1',
  benchmarkSuiteSha256: sha({ suite: 'self-evolution-smoke', version: 1 }),
  evaluatorSha256: sha({ evaluator: 'kernel-fixed-promotion-rules', version: 1 }),
  requiredGates: ['build', 'type', 'security', 'no-bypass', 'positive-byte-proof'],
  safetyCeilings: {
    bypassesIntroduced: 0,
    invalidCommits: 0,
    receiptForgeryAccepted: 0,
  },
};

const parent = {
  variantId: 'atomic-parent',
  parentId: null,
  evaluatorSha256: policy.evaluatorSha256,
  benchmarkSuiteSha256: policy.benchmarkSuiteSha256,
  metrics: {
    publicScore: 100,
    holdoutScore: 100,
    proofCoverage: 12,
    semanticOperators: 9,
    medianLatencyMs: 1000,
    bypassesIntroduced: 0,
    invalidCommits: 0,
    receiptForgeryAccepted: 0,
  },
  gates: policy.requiredGates.map((id) => ({ id, status: 'passed' })),
};

const stronger = {
  ...parent,
  variantId: 'atomic-child-stronger',
  parentId: parent.variantId,
  metrics: {
    ...parent.metrics,
    publicScore: 106,
    holdoutScore: 104,
    proofCoverage: 14,
    semanticOperators: 10,
    medianLatencyMs: 920,
  },
};

const publicGaming = {
  ...stronger,
  variantId: 'atomic-child-public-gaming',
  metrics: {
    ...stronger.metrics,
    publicScore: 120,
    holdoutScore: 94,
  },
};

const unsafe = {
  ...stronger,
  variantId: 'atomic-child-unsafe',
  metrics: {
    ...stronger.metrics,
    bypassesIntroduced: 1,
  },
};
unsafe.gates = unsafe.gates.map((gate) => gate.id === 'no-bypass' ? { ...gate, status: 'failed' } : gate);

const accepted = decidePromotion({ parent, candidate: stronger, policy });
record(
  'promotion accepts a strictly stronger variant with no hard safety regression',
  accepted.decision === 'promote' &&
    accepted.deltas.proofCoverage === 2 &&
    accepted.deltas.semanticOperators === 1 &&
    accepted.deltas.medianLatencyMs === -80 &&
    accepted.reasons.some((reason) => reason.includes('measured improvement')),
  accepted,
);

const gaming = decidePromotion({ parent, candidate: publicGaming, policy });
record(
  'promotion rejects public-score gaming when holdout regresses',
  gaming.decision === 'reject' && gaming.rejections.includes('holdout.regression'),
  gaming,
);

const unsafeDecision = decidePromotion({ parent, candidate: unsafe, policy });
record(
  'promotion rejects variants that introduce bypass or fail required gates',
  unsafeDecision.decision === 'reject' &&
    unsafeDecision.rejections.includes('safety.bypassesIntroduced') &&
    unsafeDecision.rejections.includes('gate.no-bypass'),
  unsafeDecision,
);

const receipt = buildPromotionReceipt({ parent, candidate: stronger, policy });
const verified = verifyPromotionReceipt(receipt);
record(
  'promotion receipt verifies by recomputing hash and decision from embedded facts',
  verified.ok === true && verified.receiptHashValid === true && verified.decision === 'promote',
  verified,
);

const rejectedReceipt = buildPromotionReceipt({ parent, candidate: unsafe, policy });
const forged = rehashReceipt({
  ...rejectedReceipt,
  decision: 'promote',
  rejections: [],
  reasons: ['forged self-consistent story'],
});
const forgedVerified = verifyPromotionReceipt(forged);
record(
  'promotion verifier rejects self-consistent forged receipts whose decision contradicts facts',
  forgedVerified.ok !== true && /decision|recompute|contradict/i.test(String(forgedVerified.error ?? '')),
  forgedVerified,
);

const archiveEntry = buildArchiveEntry({ archiveId: 'atomic-self-evolution-smoke', receipt });
const archiveVerified = verifyArchiveEntry(archiveEntry);
record(
  'archive entry verifies the first promotion receipt as sequence 1 with no previous link',
  archiveVerified.ok === true &&
    archiveVerified.sequence === 1 &&
    archiveVerified.previousEntrySha256 === null &&
    archiveVerified.receiptSha256 === receipt.receiptSha256,
  archiveVerified,
);

const rejectedArchiveEntry = buildArchiveEntry({
  archiveId: 'atomic-self-evolution-smoke',
  previousEntry: archiveEntry,
  receipt: rejectedReceipt,
});
const rejectedArchiveVerified = verifyArchiveEntry(rejectedArchiveEntry, archiveEntry);
record(
  'archive entry chains a rejected variant as a tamper-evident stepping stone',
  rejectedArchiveVerified.ok === true &&
    rejectedArchiveVerified.sequence === 2 &&
    rejectedArchiveVerified.previousEntrySha256 === archiveEntry.archiveEntrySha256 &&
    rejectedArchiveVerified.decision === 'reject',
  rejectedArchiveVerified,
);

const archiveChainVerified = verifyArchiveChain([archiveEntry, rejectedArchiveEntry]);
record(
  'archive chain verifier accepts contiguous promotion lineage and reports the head hash',
  archiveChainVerified.ok === true &&
    archiveChainVerified.entryCount === 2 &&
    archiveChainVerified.decisions.promote === 1 &&
    archiveChainVerified.decisions.reject === 1 &&
    archiveChainVerified.headArchiveEntrySha256 === rejectedArchiveEntry.archiveEntrySha256,
  archiveChainVerified,
);

const brokenArchiveChainVerified = verifyArchiveChain([rejectedArchiveEntry]);
record(
  'archive chain verifier rejects a sequence-2 entry without its previous link',
  brokenArchiveChainVerified.ok !== true && /previousEntrySha256|sequence|previous/i.test(String(brokenArchiveChainVerified.error ?? '')),
  brokenArchiveChainVerified,
);

const archiveJsonl = `${JSON.stringify(archiveEntry)}\n${JSON.stringify(rejectedArchiveEntry)}\n`;
const archiveJsonlVerified = verifyArchiveJsonl(archiveJsonl);
record(
  'archive JSONL verifier accepts the same contiguous lineage as a portable text artifact',
  archiveJsonlVerified.ok === true &&
    archiveJsonlVerified.format === 'jsonl' &&
    archiveJsonlVerified.entryCount === 2 &&
    archiveJsonlVerified.headArchiveEntrySha256 === rejectedArchiveEntry.archiveEntrySha256,
  archiveJsonlVerified,
);

const brokenArchiveJsonlVerified = verifyArchiveJsonl(`${JSON.stringify(rejectedArchiveEntry)}\n`);
record(
  'archive JSONL verifier rejects a text artifact missing its previous link',
  brokenArchiveJsonlVerified.ok !== true && /previousEntrySha256|sequence|previous/i.test(String(brokenArchiveJsonlVerified.error ?? '')),
  brokenArchiveJsonlVerified,
);

const appendedArchiveJsonl = appendArchiveJsonl({
  archiveText: `${JSON.stringify(archiveEntry)}\n`,
  receipt: rejectedReceipt,
});
record(
  'archive JSONL append planner emits the next entry and re-verifies the resulting text archive',
  appendedArchiveJsonl.ok === true &&
    appendedArchiveJsonl.entry?.sequence === 2 &&
    appendedArchiveJsonl.chain?.ok === true &&
    appendedArchiveJsonl.chain?.entryCount === 2 &&
    appendedArchiveJsonl.chain?.headArchiveEntrySha256 === appendedArchiveJsonl.entry.archiveEntrySha256,
  appendedArchiveJsonl,
);

const forgedArchiveLink = rehashArchiveEntry({
  ...rejectedArchiveEntry,
  previousEntrySha256: '0'.repeat(64),
});
const forgedArchiveLinkVerified = verifyArchiveEntry(forgedArchiveLink, archiveEntry);
record(
  'archive verifier rejects self-consistent forged previous links',
  forgedArchiveLinkVerified.ok !== true && /previousEntrySha256|previous/i.test(String(forgedArchiveLinkVerified.error ?? '')),
  forgedArchiveLinkVerified,
);

const forgedArchiveReceipt = rehashArchiveEntry({
  ...archiveEntry,
  receipt: forged,
  receiptSha256: forged.receiptSha256,
  decision: forged.decision,
});
const forgedArchiveReceiptVerified = verifyArchiveEntry(forgedArchiveReceipt);
record(
  'archive verifier rejects entries whose embedded promotion receipt is forged',
  forgedArchiveReceiptVerified.ok !== true && /embedded promotion receipt|decision|recompute/i.test(String(forgedArchiveReceiptVerified.error ?? '')),
  forgedArchiveReceiptVerified,
);

const cliSelfTest = runCli(['--self-test']);
record(
  'CLI self-test emits ok JSON and verifies receipt plus archive entry',
  cliSelfTest.status === 0 && cliSelfTest.body?.ok === true && cliSelfTest.body?.receiptVerified?.ok === true && cliSelfTest.body?.archiveVerified?.ok === true,
  cliSelfTest,
);

const cliReceipt = runCli(['--receipt'], { parent, candidate: stronger, policy });
record(
  'CLI receipt mode reads JSON from stdin and emits a verifiable promotion receipt',
  cliReceipt.status === 0 && cliReceipt.body?.ok === true && verifyPromotionReceipt(cliReceipt.body.receipt).ok === true,
  cliReceipt,
);

const cliForgedReceipt = runCli(['--verify-receipt'], { receipt: forged });
record(
  'CLI verify-receipt mode exits nonzero for self-consistent forged receipts',
  cliForgedReceipt.status !== 0 && cliForgedReceipt.body?.ok === false && /decision|recompute|contradict/i.test(String(cliForgedReceipt.body?.error ?? '')),
  cliForgedReceipt,
);

const cliArchiveChain = runCli(['--verify-archive-chain'], { entries: [archiveEntry, rejectedArchiveEntry] });
record(
  'CLI verify-archive-chain mode verifies contiguous archive lineage',
  cliArchiveChain.status === 0 &&
    cliArchiveChain.body?.ok === true &&
    cliArchiveChain.body?.entryCount === 2 &&
    cliArchiveChain.body?.headArchiveEntrySha256 === rejectedArchiveEntry.archiveEntrySha256,
  cliArchiveChain,
);

const cliArchiveJsonl = runCli(['--verify-archive-jsonl'], { archiveText: archiveJsonl });
record(
  'CLI verify-archive-jsonl mode verifies a portable archive text artifact',
  cliArchiveJsonl.status === 0 &&
    cliArchiveJsonl.body?.ok === true &&
    cliArchiveJsonl.body?.format === 'jsonl' &&
    cliArchiveJsonl.body?.entryCount === 2,
  cliArchiveJsonl,
);

const cliAppendArchiveJsonl = runCli(['--append-archive-jsonl'], {
  archiveText: `${JSON.stringify(archiveEntry)}\n`,
  receipt: rejectedReceipt,
});
record(
  'CLI append-archive-jsonl mode appends and verifies the resulting text archive',
  cliAppendArchiveJsonl.status === 0 &&
    cliAppendArchiveJsonl.body?.ok === true &&
    cliAppendArchiveJsonl.body?.entry?.sequence === 2 &&
    cliAppendArchiveJsonl.body?.chain?.entryCount === 2,
  cliAppendArchiveJsonl,
);

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
  console.log(`${results.filter((result) => result.ok).length} passed, ${results.filter((result) => !result.ok).length} failed`);
}
process.exit(payload.ok ? 0 : 1);
