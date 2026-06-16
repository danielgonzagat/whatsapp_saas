#!/usr/bin/env node
/**
 * ab-worker-manifest-evidence.proof.mjs — executable proof for internally
 * consistent A/B worker manifest evidence receipts.
 */
import { MODES } from './ab-round-harness.mjs';

const {
  buildWorkerManifestEvidence,
  runCli,
  verifyWorkerManifestEvidence,
  workerManifestSha256,
} = await import('./ab-worker-manifest-evidence-harness.mjs');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

const manifestBase = {
  workspaceId: 'atomic-workspace',
  workspaceRoot: '/tmp/atomic-ab/atomic',
  mode: MODES.ATOMIC,
  baselineCommit: 'abc123',
  armId: 'atomic-arm',
  status: 'DONE',
  startedAtMs: 1000,
  finishedAtMs: 1400,
  changedFiles: ['src/example.ts'],
  diffStats: { files: 1, insertions: 6, deletions: 1 },
  validation: [
    { command: 'node proof-a.mjs', ok: true },
    { command: 'node proof-b.mjs', ok: true },
  ],
  tooling: { atomicEditOperations: 4, forbiddenWrites: 0, shellWriteOperations: 0 },
};

const manifest = {
  ...manifestBase,
  evidence: buildWorkerManifestEvidence(manifestBase).evidence,
};
const verified = verifyWorkerManifestEvidence(manifest);
check('valid-evidence-verifies', verified.ok === true && verified.manifestSha256 === workerManifestSha256(manifest), JSON.stringify(verified));
check('validation-receipts-covered', verified.verified?.validationReceiptCount === manifest.validation.length, JSON.stringify(verified));

const tamperedDiff = {
  ...manifest,
  diffStats: { files: 1, insertions: 999, deletions: 1 },
};
const diffRejected = verifyWorkerManifestEvidence(tamperedDiff);
check('tampered-manifest-rejected-by-digest', diffRejected.ok === false && String(diffRejected.error).includes('manifestSha256'), JSON.stringify(diffRejected));

const missingReceipt = {
  ...manifestBase,
  evidence: {
    ...manifest.evidence,
    validationReceipts: manifest.evidence.validationReceipts.slice(0, 1),
  },
};
const missingRejected = verifyWorkerManifestEvidence(missingReceipt);
check('missing-validation-receipt-rejected', missingRejected.ok === false && String(missingRejected.error).includes('validationReceipts'), JSON.stringify(missingRejected));

const commandMismatch = {
  ...manifestBase,
  evidence: {
    ...manifest.evidence,
    validationReceipts: [
      { ...manifest.evidence.validationReceipts[0], command: 'node other.mjs' },
      manifest.evidence.validationReceipts[1],
    ],
  },
};
const mismatchRejected = verifyWorkerManifestEvidence(commandMismatch);
check('validation-command-mismatch-rejected', mismatchRejected.ok === false && String(mismatchRejected.error).includes('validationReceipts[0]'), JSON.stringify(mismatchRejected));

const cli = runCli(['--verify-worker-manifest-evidence'], JSON.stringify({ manifest }));
check('runCli-verify-ok', cli.ok === true && cli.manifestSha256 === workerManifestSha256(manifest), JSON.stringify(cli));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'ab-worker-manifest-evidence',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Verifies internal receipt consistency for a supplied worker manifest. It does not inspect the filesystem, launch workers, or prove external truth.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
