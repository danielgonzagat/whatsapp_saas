#!/usr/bin/env node
/**
 * ab-round-ingest-harness.mjs — turns supplied isolated-worker manifests into a
 * scoreable A/B round. Pure by design: no workspace execution and no disk write.
 */
import path from 'node:path';
import { MODES, scoreRound } from './ab-round-harness.mjs';
import { verifyWorkerManifestEvidence } from './ab-worker-manifest-evidence-harness.mjs';
import { verifyWorkerObservationReceipt } from './ab-worker-observation-harness.mjs';

const REQUIRED_MODES = Object.freeze([MODES.FACTORY, MODES.ATOMIC]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseJsonInput(stdinText) {
  try {
    return { ok: true, value: JSON.parse(stdinText || '{}') };
  } catch (error) {
    return { ok: false, error: `invalid JSON input: ${error.message}` };
  }
}

function normalizeRoot(root) {
  if (!nonEmptyString(root)) return null;
  return path.resolve(root.trim());
}

function rootsOverlap(left, right) {
  const relLeft = path.relative(left, right);
  const relRight = path.relative(right, left);
  return relLeft === '' || relRight === '' || (!relLeft.startsWith('..') && !path.isAbsolute(relLeft)) || (!relRight.startsWith('..') && !path.isAbsolute(relRight));
}

function validateManifestShape(manifest, index, expectedBaselineCommit) {
  const prefix = `manifests[${index}]`;
  if (!isRecord(manifest)) return `${prefix} must be an object`;
  for (const field of ['workspaceId', 'workspaceRoot', 'mode', 'baselineCommit', 'armId']) {
    if (!nonEmptyString(manifest[field])) return `${prefix}.${field} must be a non-empty string`;
  }
  if (!REQUIRED_MODES.includes(manifest.mode)) return `${prefix}.mode must be ${REQUIRED_MODES.join(' or ')}`;
  if (manifest.baselineCommit !== expectedBaselineCommit) {
    return `${prefix}.baselineCommit must match round baselineCommit ${expectedBaselineCommit}`;
  }
  if (!normalizeRoot(manifest.workspaceRoot)) return `${prefix}.workspaceRoot must resolve to a workspace path`;
  return null;
}

function validateIsolatedRoots(manifests) {
  for (let i = 0; i < manifests.length; i += 1) {
    for (let j = i + 1; j < manifests.length; j += 1) {
      const left = normalizeRoot(manifests[i].workspaceRoot);
      const right = normalizeRoot(manifests[j].workspaceRoot);
      if (left && right && rootsOverlap(left, right)) {
        return `workspaceRoot overlap between ${manifests[i].workspaceId} and ${manifests[j].workspaceId}`;
      }
    }
  }
  return null;
}

function manifestToArm(manifest) {
  return {
    armId: manifest.armId,
    mode: manifest.mode,
    status: manifest.status,
    startedAtMs: manifest.startedAtMs,
    finishedAtMs: manifest.finishedAtMs,
    workspaceRoot: manifest.workspaceRoot,
    changedFiles: manifest.changedFiles,
    diffStats: manifest.diffStats,
    validation: manifest.validation,
    tooling: manifest.tooling,
  };
}

function workspaceEvidenceFor(manifest, evidenceVerdict = null, observationVerdict = null) {
  return {
    workspaceId: manifest.workspaceId,
    workspaceRoot: normalizeRoot(manifest.workspaceRoot),
    mode: manifest.mode,
    baselineCommit: manifest.baselineCommit,
    armId: manifest.armId,
    manifestSha256: evidenceVerdict?.manifestSha256 ?? null,
    observationManifestSha256: observationVerdict?.manifestSha256 ?? null,
  };
}

function verifyRequiredEvidence(manifests, requireEvidence) {
  if (requireEvidence !== true) return { ok: true, evidenceVerdicts: [] };
  const evidenceVerdicts = [];
  for (let i = 0; i < manifests.length; i += 1) {
    const manifest = manifests[i];
    const verdict = verifyWorkerManifestEvidence(manifest);
    if (verdict.ok !== true) {
      return fail(`manifests[${i}].evidence rejected: ${verdict.error}`, {
        evidenceVerdicts: [...evidenceVerdicts, verdict],
      });
    }
    evidenceVerdicts.push({
      ok: true,
      mode: manifest.mode,
      workspaceId: manifest.workspaceId,
      manifestSha256: verdict.manifestSha256,
      verified: verdict.verified,
    });
  }
  return { ok: true, evidenceVerdicts };
}

function observationForManifest(observations, manifest) {
  return observations.find((observation) => observation?.mode === manifest.mode && observation?.workspaceId === manifest.workspaceId);
}

function verifyRequiredObservation(manifests, observations, requireObservation) {
  if (requireObservation !== true) return { ok: true, observationVerdicts: [] };
  if (!Array.isArray(observations)) return fail('observations must be an array when requireObservation is true');
  const observationVerdicts = [];
  for (let i = 0; i < manifests.length; i += 1) {
    const manifest = manifests[i];
    const observation = observationForManifest(observations, manifest);
    if (!observation) {
      return fail(`observations missing receipt for ${manifest.mode}/${manifest.workspaceId}`, {
        observationVerdicts,
      });
    }
    const verdict = verifyWorkerObservationReceipt({ manifest, observation });
    if (verdict.ok !== true) {
      return fail(`observations[${manifest.mode}].receipt rejected: ${verdict.error}`, {
        observationVerdicts: [...observationVerdicts, verdict],
      });
    }
    observationVerdicts.push({
      ok: true,
      mode: manifest.mode,
      workspaceId: manifest.workspaceId,
      manifestSha256: verdict.manifestSha256,
      verified: verdict.verified,
    });
  }
  return { ok: true, observationVerdicts };
}

export function ingestRoundManifests(input) {
  if (!isRecord(input)) return fail('input must be a JSON object');
  for (const field of ['roundId', 'task', 'baselineCommit']) {
    if (!nonEmptyString(input[field])) return fail(`${field} must be a non-empty string`);
  }
  if (!Array.isArray(input.manifests)) return fail('manifests must be an array');
  if (input.manifests.length !== 2) return fail('exactly two isolated worker manifests are required');

  for (let i = 0; i < input.manifests.length; i += 1) {
    const shapeError = validateManifestShape(input.manifests[i], i, input.baselineCommit);
    if (shapeError) return fail(shapeError);
  }

  const modes = input.manifests.map((manifest) => manifest.mode);
  for (const mode of REQUIRED_MODES) {
    if (!modes.includes(mode)) return fail(`missing required arm mode: ${mode}`);
  }
  if (new Set(modes).size !== 2) return fail(`exactly one manifest per required mode is required: ${REQUIRED_MODES.join(' and ')}`);

  const isolationError = validateIsolatedRoots(input.manifests);
  if (isolationError) return fail(isolationError);

  const evidence = verifyRequiredEvidence(input.manifests, input.requireEvidence);
  if (evidence.ok !== true) return evidence;
  const evidenceByMode = new Map(evidence.evidenceVerdicts.map((verdict) => [verdict.mode, verdict]));

  const observation = verifyRequiredObservation(input.manifests, input.observations, input.requireObservation);
  if (observation.ok !== true) return observation;
  const observationByMode = new Map(observation.observationVerdicts.map((verdict) => [verdict.mode, verdict]));

  const round = {
    roundId: input.roundId,
    task: input.task,
    baselineCommit: input.baselineCommit,
    arms: REQUIRED_MODES.map((mode) => manifestToArm(input.manifests.find((manifest) => manifest.mode === mode))),
  };
  const scoredRound = scoreRound(round);
  if (scoredRound.ok !== true) return fail(scoredRound.error ?? 'round scoring failed', { round, scoredRound });

  return {
    ok: true,
    round,
    scoredRound,
    evidenceVerdicts: evidence.evidenceVerdicts,
    observationVerdicts: observation.observationVerdicts,
    workspaceEvidence: REQUIRED_MODES.map((mode) => workspaceEvidenceFor(input.manifests.find((manifest) => manifest.mode === mode), evidenceByMode.get(mode), observationByMode.get(mode))),
    honestCeiling: input.requireObservation === true
      ? 'Ingests supplied isolated-worker manifests with verified supplied observations. It does not collect filesystem truth or launch workers.'
      : input.requireEvidence === true
        ? 'Ingests supplied isolated-worker manifests with internally verified receipts. It does not inspect workspaces or prove external truth.'
        : 'Ingests supplied isolated-worker manifests only. It does not launch workers, inspect workspaces, or prove the manifests are truthful.',
  };
}

export function runCli(argv, stdinText) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes('--ingest-round-manifests')) {
    const parsed = parseJsonInput(stdinText);
    if (!parsed.ok) return parsed;
    return ingestRoundManifests(parsed.value);
  }
  return fail('usage: node ab-round-ingest-harness.mjs --ingest-round-manifests < input.json');
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
