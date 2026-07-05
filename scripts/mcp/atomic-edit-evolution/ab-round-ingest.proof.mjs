#!/usr/bin/env node
/**
 * ab-round-ingest.proof.mjs — executable proof for converting isolated worker
 * manifests into a scoreable A/B round without running either arm.
 */
import { MODES } from './ab-round-harness.mjs';

const { buildWorkerManifestEvidence } = await import('./ab-worker-manifest-evidence-harness.mjs');
const { buildWorkerObservationReceipt } = await import('./ab-worker-observation-harness.mjs');
const { ingestRoundManifests, runCli } = await import('./ab-round-ingest-harness.mjs');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

const baseManifest = (mode, overrides = {}) => ({
  workspaceId: `${mode}-workspace`,
  workspaceRoot: `/tmp/atomic-ab/${mode}`,
  mode,
  baselineCommit: 'abc123',
  armId: `${mode}-arm`,
  status: 'DONE',
  startedAtMs: 1000,
  finishedAtMs: mode === MODES.FACTORY ? 1300 : 1400,
  changedFiles: ['src/example.ts'],
  diffStats: mode === MODES.FACTORY
    ? { files: 1, insertions: 8, deletions: 2 }
    : { files: 1, insertions: 6, deletions: 1 },
  validation: [
    { command: 'node proof-a.mjs', ok: true },
    { command: 'node proof-b.mjs', ok: true },
  ],
  tooling: mode === MODES.FACTORY
    ? { atomicEditOperations: 0, forbiddenWrites: 0, shellWriteOperations: 1 }
    : { atomicEditOperations: 4, forbiddenWrites: 0 },
  ...overrides,
});

const withEvidence = (manifest) => ({
  ...manifest,
  evidence: buildWorkerManifestEvidence(manifest).evidence,
});

const observationFor = (manifest) => buildWorkerObservationReceipt(manifest).observation;

const validInput = {
  roundId: 'round-ingest-valid',
  task: 'ingest isolated manifests',
  baselineCommit: 'abc123',
  manifests: [
    baseManifest(MODES.FACTORY),
    baseManifest(MODES.ATOMIC),
  ],
};

const valid = ingestRoundManifests(validInput);
check('valid-manifests-score-round', valid.ok === true && valid.round?.arms?.length === 2 && valid.scoredRound?.ok === true, JSON.stringify(valid));
check('workspace-root-reaches-scorer', valid.scoredRound?.decision?.workspaceIsolation?.ok === true && valid.scoredRound?.decision?.workspaceIsolation?.measured === true, JSON.stringify(valid.scoredRound?.decision));
check('workspace-evidence-preserved-outside-score', valid.workspaceEvidence?.every((item) => item.workspaceRoot && item.workspaceId), JSON.stringify(valid.workspaceEvidence));

const evidenceRequired = ingestRoundManifests({
  ...validInput,
  requireEvidence: true,
  manifests: [
    withEvidence(baseManifest(MODES.FACTORY)),
    withEvidence(baseManifest(MODES.ATOMIC)),
  ],
});
check('required-evidence-verifies', evidenceRequired.ok === true && evidenceRequired.evidenceVerdicts?.every((item) => item.ok === true) && evidenceRequired.workspaceEvidence?.every((item) => item.manifestSha256), JSON.stringify(evidenceRequired));

const missingRequiredEvidence = ingestRoundManifests({
  ...validInput,
  requireEvidence: true,
});
check('missing-required-evidence-rejected', missingRequiredEvidence.ok === false && String(missingRequiredEvidence.error).includes('evidence'), JSON.stringify(missingRequiredEvidence));

const observationRequired = ingestRoundManifests({
  ...validInput,
  requireObservation: true,
  observations: [
    observationFor(baseManifest(MODES.FACTORY)),
    observationFor(baseManifest(MODES.ATOMIC)),
  ],
});
check('required-observation-verifies', observationRequired.ok === true && observationRequired.observationVerdicts?.every((item) => item.ok === true) && observationRequired.workspaceEvidence?.every((item) => item.observationManifestSha256), JSON.stringify(observationRequired));

const missingRequiredObservation = ingestRoundManifests({
  ...validInput,
  requireObservation: true,
});
check('missing-required-observation-rejected', missingRequiredObservation.ok === false && String(missingRequiredObservation.error).includes('observation'), JSON.stringify(missingRequiredObservation));

const tamperedObservation = ingestRoundManifests({
  ...validInput,
  requireObservation: true,
  observations: [
    { ...observationFor(baseManifest(MODES.FACTORY)), changedFiles: ['src/other.ts'] },
    observationFor(baseManifest(MODES.ATOMIC)),
  ],
});
check('tampered-observation-rejected', tamperedObservation.ok === false && String(tamperedObservation.error).includes('changedFiles'), JSON.stringify(tamperedObservation));

const baselineMismatch = ingestRoundManifests({
  ...validInput,
  manifests: [
    baseManifest(MODES.FACTORY),
    baseManifest(MODES.ATOMIC, { baselineCommit: 'def456' }),
  ],
});
check('baseline-mismatch-rejected', baselineMismatch.ok === false && String(baselineMismatch.error).includes('baselineCommit'), JSON.stringify(baselineMismatch));

const sameRoot = ingestRoundManifests({
  ...validInput,
  manifests: [
    baseManifest(MODES.FACTORY, { workspaceRoot: '/tmp/atomic-ab/shared' }),
    baseManifest(MODES.ATOMIC, { workspaceRoot: '/tmp/atomic-ab/shared' }),
  ],
});
check('same-workspace-root-rejected', sameRoot.ok === false && String(sameRoot.error).includes('workspaceRoot'), JSON.stringify(sameRoot));

const nestedRoot = ingestRoundManifests({
  ...validInput,
  manifests: [
    baseManifest(MODES.FACTORY, { workspaceRoot: '/tmp/atomic-ab/shared' }),
    baseManifest(MODES.ATOMIC, { workspaceRoot: '/tmp/atomic-ab/shared/atomic' }),
  ],
});
check('nested-workspace-root-rejected', nestedRoot.ok === false && String(nestedRoot.error).includes('overlap'), JSON.stringify(nestedRoot));

const missingArm = ingestRoundManifests({
  ...validInput,
  manifests: [baseManifest(MODES.ATOMIC)],
});
check('missing-factory-arm-rejected', missingArm.ok === false && String(missingArm.error).includes('exactly two'), JSON.stringify(missingArm));

const cli = runCli(['--ingest-round-manifests'], JSON.stringify(validInput));
check('runCli-ingest-ok', cli.ok === true && cli.scoredRound?.roundId === 'round-ingest-valid', JSON.stringify(cli));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'ab-round-ingest',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Ingests supplied isolated-worker manifests into a scoreable round. It does not launch workers or prove real coding superiority.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
