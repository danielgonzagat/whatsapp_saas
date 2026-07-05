#!/usr/bin/env node
/**
 * ab-worker-manifest-evidence-harness.mjs — internal consistency verifier for
 * A/B worker manifests. Pure: no filesystem inspection and no worker launch.
 */
import crypto from 'node:crypto';

const SCHEMA_VERSION = 1;
const KIND = 'atomic-ab-worker-manifest-evidence';
const SHA256_RE = /^[a-f0-9]{64}$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function canonicalSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function withoutEvidence(manifest) {
  const { evidence: _evidence, ...rest } = manifest;
  return rest;
}

export function workerManifestSha256(manifest) {
  return canonicalSha256(withoutEvidence(manifest));
}

function diffStatsReceiptSha256(manifest) {
  return canonicalSha256({
    workspaceId: manifest.workspaceId,
    mode: manifest.mode,
    changedFiles: manifest.changedFiles,
    diffStats: manifest.diffStats,
  });
}

function toolingReceiptSha256(manifest) {
  return canonicalSha256({
    workspaceId: manifest.workspaceId,
    mode: manifest.mode,
    tooling: manifest.tooling,
  });
}

function validationReceiptFor(item, index) {
  return {
    command: item.command,
    ok: item.ok === true,
    exitCode: item.ok === true ? 0 : 1,
    startedAtMs: 0,
    finishedAtMs: 0,
    stdoutSha256: canonicalSha256({ index, command: item.command, stream: 'stdout' }),
    stderrSha256: canonicalSha256({ index, command: item.command, stream: 'stderr' }),
  };
}

export function buildWorkerManifestEvidence(manifest) {
  if (!isRecord(manifest)) return fail('manifest must be an object');
  const surface = withoutEvidence(manifest);
  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    manifestSha256: workerManifestSha256(surface),
    workspace: {
      workspaceId: surface.workspaceId,
      workspaceRoot: surface.workspaceRoot,
      mode: surface.mode,
      baselineCommit: surface.baselineCommit,
      armId: surface.armId,
    },
    validationReceipts: Array.isArray(surface.validation) ? surface.validation.map(validationReceiptFor) : [],
    diffStatsReceiptSha256: diffStatsReceiptSha256(surface),
    toolingReceiptSha256: toolingReceiptSha256(surface),
  };
  return { ok: true, evidence };
}

function validateWorkspaceReceipt(manifest, evidence) {
  if (!isRecord(evidence.workspace)) return 'evidence.workspace must be an object';
  for (const field of ['workspaceId', 'workspaceRoot', 'mode', 'baselineCommit', 'armId']) {
    if (evidence.workspace[field] !== manifest[field]) {
      return `evidence.workspace.${field} must match manifest.${field}`;
    }
  }
  return null;
}

function validateValidationReceipts(manifest, evidence) {
  if (!Array.isArray(manifest.validation)) return 'manifest.validation must be an array';
  if (!Array.isArray(evidence.validationReceipts)) return 'evidence.validationReceipts must be an array';
  if (evidence.validationReceipts.length !== manifest.validation.length) {
    return `evidence.validationReceipts length must match manifest.validation length ${manifest.validation.length}`;
  }
  for (let i = 0; i < manifest.validation.length; i += 1) {
    const validation = manifest.validation[i];
    const receipt = evidence.validationReceipts[i];
    if (!isRecord(receipt)) return `evidence.validationReceipts[${i}] must be an object`;
    if (receipt.command !== validation.command) return `evidence.validationReceipts[${i}].command must match validation command`;
    if (receipt.ok !== validation.ok) return `evidence.validationReceipts[${i}].ok must match validation ok`;
    if (typeof receipt.exitCode !== 'number' || !Number.isFinite(receipt.exitCode)) return `evidence.validationReceipts[${i}].exitCode must be a finite number`;
    if (validation.ok === true && receipt.exitCode !== 0) return `evidence.validationReceipts[${i}].exitCode must be 0 for ok validation`;
    if (validation.ok === false && receipt.exitCode === 0) return `evidence.validationReceipts[${i}].exitCode must be non-zero for failed validation`;
    for (const field of ['stdoutSha256', 'stderrSha256']) {
      if (!SHA256_RE.test(String(receipt[field] ?? ''))) return `evidence.validationReceipts[${i}].${field} must be sha256 hex`;
    }
  }
  return null;
}

export function verifyWorkerManifestEvidence(manifest) {
  if (!isRecord(manifest)) return fail('manifest must be an object');
  const evidence = manifest.evidence;
  if (!isRecord(evidence)) return fail('manifest.evidence must be an object');
  if (evidence.schemaVersion !== SCHEMA_VERSION) return fail(`evidence.schemaVersion must be ${SCHEMA_VERSION}`);
  if (evidence.kind !== KIND) return fail(`evidence.kind must be ${KIND}`);

  const manifestSha256 = workerManifestSha256(manifest);
  if (evidence.manifestSha256 !== manifestSha256) {
    return fail(`evidence.manifestSha256 mismatch: expected ${manifestSha256}, got ${evidence.manifestSha256}`);
  }

  const workspaceError = validateWorkspaceReceipt(withoutEvidence(manifest), evidence);
  if (workspaceError) return fail(workspaceError, { manifestSha256 });

  const validationError = validateValidationReceipts(withoutEvidence(manifest), evidence);
  if (validationError) return fail(validationError, { manifestSha256 });

  const expectedDiffReceipt = diffStatsReceiptSha256(withoutEvidence(manifest));
  if (evidence.diffStatsReceiptSha256 !== expectedDiffReceipt) {
    return fail('evidence.diffStatsReceiptSha256 mismatch', { manifestSha256, expectedDiffReceipt });
  }

  const expectedToolingReceipt = toolingReceiptSha256(withoutEvidence(manifest));
  if (evidence.toolingReceiptSha256 !== expectedToolingReceipt) {
    return fail('evidence.toolingReceiptSha256 mismatch', { manifestSha256, expectedToolingReceipt });
  }

  return {
    ok: true,
    manifestSha256,
    verified: {
      workspace: true,
      validationReceiptCount: evidence.validationReceipts.length,
      diffStatsReceipt: true,
      toolingReceipt: true,
    },
    honestCeiling: 'Internal consistency only. This does not inspect filesystem state, command output bytes, or external worker truth.',
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
  if (args.includes('--verify-worker-manifest-evidence')) {
    return verifyWorkerManifestEvidence(parsed.value.manifest ?? parsed.value);
  }
  if (args.includes('--build-worker-manifest-evidence')) {
    return buildWorkerManifestEvidence(parsed.value.manifest ?? parsed.value);
  }
  return fail('usage: node ab-worker-manifest-evidence-harness.mjs --verify-worker-manifest-evidence < input.json');
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
