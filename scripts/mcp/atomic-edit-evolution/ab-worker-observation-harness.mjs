#!/usr/bin/env node
/**
 * ab-worker-observation-harness.mjs — pure verifier for externally supplied
 * worker observation receipts bound to A/B worker manifests.
 *
 * It does not inspect the filesystem or launch workers. It only refuses when a
 * supplied observation contradicts the supplied manifest.
 */
import { canonicalSha256, workerManifestSha256 } from './ab-worker-manifest-evidence-harness.mjs';

const SCHEMA_VERSION = 1;
const KIND = 'atomic-ab-worker-observation-receipt';
const SHA256_RE = /^[a-f0-9]{64}$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function stableEqual(a, b) {
  return canonicalSha256(a) === canonicalSha256(b);
}

function sortedStrings(values) {
  return [...values].map(String).sort();
}

function validationReceiptFor(manifest, item, index) {
  return {
    command: item.command,
    ok: item.ok === true,
    exitCode: item.ok === true ? 0 : 1,
    stdoutSha256: canonicalSha256({ workspaceId: manifest.workspaceId, index, command: item.command, stream: 'stdout' }),
    stderrSha256: canonicalSha256({ workspaceId: manifest.workspaceId, index, command: item.command, stream: 'stderr' }),
  };
}

export function buildWorkerObservationReceipt(manifest, observed = {}) {
  if (!isRecord(manifest)) return fail('manifest must be an object');
  if (!isRecord(observed)) return fail('observed must be an object when provided');
  const validation = Array.isArray(manifest.validation) ? manifest.validation : [];
  const observation = {
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    manifestSha256: workerManifestSha256(manifest),
    workspaceId: manifest.workspaceId,
    workspaceRoot: manifest.workspaceRoot,
    mode: manifest.mode,
    baselineCommit: manifest.baselineCommit,
    armId: manifest.armId,
    observedAtMs: Number.isFinite(observed.observedAtMs) ? observed.observedAtMs : 0,
    changedFiles: Array.isArray(observed.changedFiles) ? observed.changedFiles : manifest.changedFiles,
    diffStats: isRecord(observed.diffStats) ? observed.diffStats : manifest.diffStats,
    validationReceipts: Array.isArray(observed.validationReceipts)
      ? observed.validationReceipts
      : validation.map((item, index) => validationReceiptFor(manifest, item, index)),
    tooling: isRecord(observed.tooling) ? observed.tooling : manifest.tooling,
  };
  return { ok: true, observation };
}

function validateIdentity(manifest, observation) {
  for (const field of ['workspaceId', 'workspaceRoot', 'mode', 'baselineCommit', 'armId']) {
    if (observation[field] !== manifest[field]) return `observation.${field} must match manifest.${field}`;
  }
  if (!Number.isFinite(observation.observedAtMs)) return 'observation.observedAtMs must be a finite number';
  return null;
}

function validateChangedFiles(manifest, observation) {
  if (!Array.isArray(manifest.changedFiles)) return 'manifest.changedFiles must be an array';
  if (!Array.isArray(observation.changedFiles)) return 'observation.changedFiles must be an array';
  if (!stableEqual(sortedStrings(observation.changedFiles), sortedStrings(manifest.changedFiles))) {
    return 'observation.changedFiles must match manifest.changedFiles as a set';
  }
  return null;
}

function validateDiffStats(manifest, observation) {
  if (!isRecord(manifest.diffStats)) return 'manifest.diffStats must be an object';
  if (!isRecord(observation.diffStats)) return 'observation.diffStats must be an object';
  if (!stableEqual(observation.diffStats, manifest.diffStats)) return 'observation.diffStats must match manifest.diffStats';
  return null;
}

function validateValidationReceipts(manifest, observation) {
  if (!Array.isArray(manifest.validation)) return 'manifest.validation must be an array';
  if (!Array.isArray(observation.validationReceipts)) return 'observation.validationReceipts must be an array';
  if (observation.validationReceipts.length !== manifest.validation.length) {
    return `observation.validationReceipts length must match manifest.validation length ${manifest.validation.length}`;
  }
  for (let i = 0; i < manifest.validation.length; i += 1) {
    const validation = manifest.validation[i];
    const receipt = observation.validationReceipts[i];
    if (!isRecord(receipt)) return `observation.validationReceipts[${i}] must be an object`;
    if (receipt.command !== validation.command) return `observation.validationReceipts[${i}].command must match validation command`;
    if (receipt.ok !== validation.ok) return `observation.validationReceipts[${i}].ok must match validation ok`;
    if (typeof receipt.exitCode !== 'number' || !Number.isFinite(receipt.exitCode)) return `observation.validationReceipts[${i}].exitCode must be a finite number`;
    if (validation.ok === true && receipt.exitCode !== 0) return `observation.validationReceipts[${i}].exitCode must be 0 for ok validation`;
    if (validation.ok === false && receipt.exitCode === 0) return `observation.validationReceipts[${i}].exitCode must be non-zero for failed validation`;
    for (const field of ['stdoutSha256', 'stderrSha256']) {
      if (!SHA256_RE.test(String(receipt[field] ?? ''))) return `observation.validationReceipts[${i}].${field} must be sha256 hex`;
    }
  }
  return null;
}

function validateTooling(manifest, observation) {
  if (!isRecord(manifest.tooling)) return 'manifest.tooling must be an object';
  if (!isRecord(observation.tooling)) return 'observation.tooling must be an object';
  if (!stableEqual(observation.tooling, manifest.tooling)) return 'observation.tooling must match manifest.tooling';
  return null;
}

export function verifyWorkerObservationReceipt(input, maybeObservation = undefined) {
  const manifest = maybeObservation === undefined ? input?.manifest : input;
  const observation = maybeObservation === undefined ? input?.observation : maybeObservation;
  if (!isRecord(manifest)) return fail('manifest must be an object');
  if (!isRecord(observation)) return fail('observation must be an object');
  if (observation.schemaVersion !== SCHEMA_VERSION) return fail(`observation.schemaVersion must be ${SCHEMA_VERSION}`);
  if (observation.kind !== KIND) return fail(`observation.kind must be ${KIND}`);

  const manifestSha256 = workerManifestSha256(manifest);
  if (observation.manifestSha256 !== manifestSha256) {
    return fail(`observation.manifestSha256 mismatch: expected ${manifestSha256}, got ${observation.manifestSha256}`);
  }

  const validators = [
    validateIdentity,
    validateChangedFiles,
    validateDiffStats,
    validateValidationReceipts,
    validateTooling,
  ];
  for (const validator of validators) {
    const error = validator(manifest, observation);
    if (error) return fail(error, { manifestSha256 });
  }

  return {
    ok: true,
    manifestSha256,
    verified: {
      identity: true,
      changedFiles: true,
      diffStats: true,
      validationReceiptCount: observation.validationReceipts.length,
      tooling: true,
    },
    honestCeiling: 'Supplied-observation consistency only. This does not collect filesystem state, command output bytes, or external worker truth.',
  };
}

function parseJsonInput(stdinText) {
  try {
    return { ok: true, value: JSON.parse(stdinText || '{}') };
  } catch (error) {
    return { ok: false, error: `invalid JSON input: ${error.message}` };
  }
}

export function runCli(argv, stdinText) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = parseJsonInput(stdinText);
  if (!parsed.ok) return parsed;
  if (args.includes('--verify-worker-observation')) {
    return verifyWorkerObservationReceipt(parsed.value);
  }
  if (args.includes('--build-worker-observation')) {
    return buildWorkerObservationReceipt(parsed.value.manifest ?? parsed.value, parsed.value.observed ?? {});
  }
  return fail('usage: node ab-worker-observation-harness.mjs --verify-worker-observation < input.json');
}

function isCliMain() {
  return process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
}

if (isCliMain()) {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const result = runCli(process.argv.slice(2), Buffer.concat(chunks).toString('utf8'));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  });
}
