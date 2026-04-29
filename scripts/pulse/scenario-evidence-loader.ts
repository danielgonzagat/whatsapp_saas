/**
 * Scenario evidence loader — reads PULSE scenario evidence from disk so
 * previously executed browser/actor/scenario runs can feed certification.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PulseActorEvidence, PulseScenarioResult } from './types';
import type { DiskScenarioEvidence } from './actors/disk-evidence';

type ActorEvidenceKey = 'customer' | 'operator' | 'admin' | 'soak';

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

const EVIDENCE_FILES: Array<{ key: ActorEvidenceKey; fileName: string }> = [
  { key: 'customer', fileName: 'PULSE_CUSTOMER_EVIDENCE.json' },
  { key: 'operator', fileName: 'PULSE_OPERATOR_EVIDENCE.json' },
  { key: 'admin', fileName: 'PULSE_ADMIN_EVIDENCE.json' },
  { key: 'soak', fileName: 'PULSE_SOAK_EVIDENCE.json' },
];

function resolveEvidencePath(rootDir: string, fileName: string): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const candidates = [
    path.join(resolvedRoot, fileName),
    path.join(resolvedRoot, '.pulse', 'current', fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isFresh(filePath: string): boolean {
  const stat = fs.statSync(filePath);
  return Date.now() - stat.mtime.getTime() <= FRESHNESS_WINDOW_MS;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function normalizeScenarioResult(
  raw: unknown,
  actorKind: ActorEvidenceKey,
  fresh: boolean,
): PulseScenarioResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const scenarioId = typeof item.scenarioId === 'string' ? item.scenarioId : null;
  const status = typeof item.status === 'string' ? item.status : null;
  if (!scenarioId || !status) {
    return null;
  }

  const acceptedStatuses: PulseScenarioResult['status'][] = [
    'passed',
    'failed',
    'missing_evidence',
    'checker_gap',
    'skipped',
  ];
  const normalizedStatus = acceptedStatuses.includes(status as PulseScenarioResult['status'])
    ? (status as PulseScenarioResult['status'])
    : 'checker_gap';

  return {
    scenarioId,
    actorKind: actorKind === 'soak' ? 'system' : actorKind,
    scenarioKind:
      typeof item.scenarioKind === 'string'
        ? (item.scenarioKind as PulseScenarioResult['scenarioKind'])
        : 'single-session',
    critical: item.critical === true,
    requested: item.requested === true,
    runner:
      typeof item.runner === 'string' ? (item.runner as PulseScenarioResult['runner']) : 'derived',
    status: normalizedStatus,
    executed: item.executed === true,
    truthMode: fresh ? 'observed-from-disk' : 'inferred',
    providerModeUsed:
      typeof item.providerModeUsed === 'string'
        ? (item.providerModeUsed as PulseScenarioResult['providerModeUsed'])
        : undefined,
    smokeExecuted: typeof item.smokeExecuted === 'boolean' ? item.smokeExecuted : undefined,
    replayExecuted: typeof item.replayExecuted === 'boolean' ? item.replayExecuted : undefined,
    worldStateConverged:
      typeof item.worldStateConverged === 'boolean' ? item.worldStateConverged : undefined,
    failureClass:
      typeof item.failureClass === 'string'
        ? (item.failureClass as PulseScenarioResult['failureClass'])
        : undefined,
    summary: typeof item.summary === 'string' ? item.summary : scenarioId,
    artifactPaths: normalizeStringArray(item.artifactPaths),
    specsExecuted: normalizeStringArray(item.specsExecuted),
    durationMs: typeof item.durationMs === 'number' ? item.durationMs : 0,
    worldStateTouches: normalizeStringArray(item.worldStateTouches),
    metrics:
      item.metrics && typeof item.metrics === 'object' && !Array.isArray(item.metrics)
        ? (item.metrics as Record<string, string | number | boolean>)
        : undefined,
    moduleKeys: normalizeStringArray(item.moduleKeys),
    routePatterns: normalizeStringArray(item.routePatterns),
    command: typeof item.command === 'string' ? item.command : undefined,
    exitCode: typeof item.exitCode === 'number' ? item.exitCode : undefined,
    startedAt: typeof item.startedAt === 'string' ? item.startedAt : undefined,
    finishedAt: typeof item.finishedAt === 'string' ? item.finishedAt : undefined,
    environmentUrl: typeof item.environmentUrl === 'string' ? item.environmentUrl : undefined,
  };
}

function normalizeActorEvidence(
  raw: unknown,
  actorKind: ActorEvidenceKey,
  fresh: boolean,
): PulseActorEvidence | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.results)) {
    return null;
  }

  const results = data.results
    .map((entry) => normalizeScenarioResult(entry, actorKind, fresh))
    .filter((entry): entry is PulseScenarioResult => entry !== null);

  return {
    actorKind,
    declared: normalizeStringArray(data.declared),
    executed: normalizeStringArray(data.executed),
    missing: normalizeStringArray(data.missing),
    passed: normalizeStringArray(data.passed),
    failed: normalizeStringArray(data.failed),
    artifactPaths: normalizeStringArray(data.artifactPaths),
    summary: typeof data.summary === 'string' ? data.summary : `${actorKind} disk evidence`,
    results,
  };
}

/** Load scenario evidence from canonical PULSE disk artifacts. */
export function loadScenarioEvidenceFromDisk(rootDir: string): DiskScenarioEvidence {
  const bundle: DiskScenarioEvidence = {
    customer: null,
    operator: null,
    admin: null,
    soak: null,
    summary: '',
    results: [],
  };
  const summaryParts: string[] = [];

  for (const { key, fileName } of EVIDENCE_FILES) {
    const filePath = resolveEvidencePath(rootDir, fileName);
    if (!filePath) {
      summaryParts.push(`${key}: no file`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = readJson(filePath);
    } catch {
      summaryParts.push(`${key}: parse error`);
      continue;
    }

    const fresh = isFresh(filePath);
    const evidence = normalizeActorEvidence(parsed, key, fresh);
    if (!evidence) {
      summaryParts.push(`${key}: invalid structure`);
      continue;
    }

    bundle[key] = evidence;
    bundle.results.push(...evidence.results);
    summaryParts.push(`${key}: ${fresh ? 'fresh' : 'stale'} (${evidence.results.length})`);
  }

  bundle.summary = summaryParts.join('; ');
  return bundle;
}
