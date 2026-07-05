#!/usr/bin/env node
/**
 * ab-worker-observation.proof.mjs — executable proof for supplied external
 * worker observation receipts bound to A/B worker manifests.
 */
import { MODES } from './ab-round-harness.mjs';
import { canonicalSha256, workerManifestSha256 } from './ab-worker-manifest-evidence-harness.mjs';

const {
  buildWorkerObservationReceipt,
  runCli,
  verifyWorkerObservationReceipt,
} = await import('./ab-worker-observation-harness.mjs');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

const manifest = {
  workspaceId: 'atomic-workspace',
  workspaceRoot: '/tmp/atomic-ab/atomic',
  mode: MODES.ATOMIC,
  baselineCommit: 'abc123',
  armId: 'atomic-arm',
  status: 'DONE',
  startedAtMs: 1000,
  finishedAtMs: 1400,
  changedFiles: ['src/example.ts', 'src/worker.ts'],
  diffStats: { files: 2, insertions: 9, deletions: 2 },
  validation: [
    { command: 'node proof-a.mjs', ok: true },
    { command: 'node proof-b.mjs', ok: true },
  ],
  tooling: { atomicEditOperations: 4, forbiddenWrites: 0, shellWriteOperations: 0 },
};

const built = buildWorkerObservationReceipt(manifest, {
  validationReceipts: [
    {
      command: 'node proof-a.mjs',
      ok: true,
      exitCode: 0,
      stdoutSha256: canonicalSha256({ stream: 'stdout', command: 'node proof-a.mjs', bytes: 'proof-a-ok' }),
      stderrSha256: canonicalSha256({ stream: 'stderr', command: 'node proof-a.mjs', bytes: '' }),
    },
    {
      command: 'node proof-b.mjs',
      ok: true,
      exitCode: 0,
      stdoutSha256: canonicalSha256({ stream: 'stdout', command: 'node proof-b.mjs', bytes: 'proof-b-ok' }),
      stderrSha256: canonicalSha256({ stream: 'stderr', command: 'node proof-b.mjs', bytes: '' }),
    },
  ],
});
const observation = built.observation;
const verified = verifyWorkerObservationReceipt({ manifest, observation });
check('valid-observation-verifies', verified.ok === true && verified.manifestSha256 === workerManifestSha256(manifest), JSON.stringify(verified));
check('validation-receipts-covered', verified.verified?.validationReceiptCount === manifest.validation.length, JSON.stringify(verified));

const changedFilesTampered = {
  ...observation,
  changedFiles: ['src/example.ts'],
};
const changedFilesRejected = verifyWorkerObservationReceipt({ manifest, observation: changedFilesTampered });
check('changed-files-mismatch-rejected', changedFilesRejected.ok === false && String(changedFilesRejected.error).includes('changedFiles'), JSON.stringify(changedFilesRejected));

const diffTampered = {
  ...observation,
  diffStats: { files: 2, insertions: 999, deletions: 2 },
};
const diffRejected = verifyWorkerObservationReceipt({ manifest, observation: diffTampered });
check('diffstats-mismatch-rejected', diffRejected.ok === false && String(diffRejected.error).includes('diffStats'), JSON.stringify(diffRejected));

const validationTampered = {
  ...observation,
  validationReceipts: [
    { ...observation.validationReceipts[0], ok: false, exitCode: 1 },
    observation.validationReceipts[1],
  ],
};
const validationRejected = verifyWorkerObservationReceipt({ manifest, observation: validationTampered });
check('validation-mismatch-rejected', validationRejected.ok === false && String(validationRejected.error).includes('validationReceipts[0]'), JSON.stringify(validationRejected));

const toolingTampered = {
  ...observation,
  tooling: { ...observation.tooling, forbiddenWrites: 1 },
};
const toolingRejected = verifyWorkerObservationReceipt({ manifest, observation: toolingTampered });
check('tooling-mismatch-rejected', toolingRejected.ok === false && String(toolingRejected.error).includes('tooling'), JSON.stringify(toolingRejected));

const shaTampered = {
  ...observation,
  manifestSha256: canonicalSha256({ forged: true }),
};
const shaRejected = verifyWorkerObservationReceipt({ manifest, observation: shaTampered });
check('manifest-sha-mismatch-rejected', shaRejected.ok === false && String(shaRejected.error).includes('manifestSha256'), JSON.stringify(shaRejected));

const cli = runCli(['--verify-worker-observation'], JSON.stringify({ manifest, observation }));
check('runCli-verify-ok', cli.ok === true && cli.manifestSha256 === workerManifestSha256(manifest), JSON.stringify(cli));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'ab-worker-observation',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Verifies a supplied worker observation receipt against a supplied manifest. It does not collect filesystem truth, launch workers, or inspect external providers.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
