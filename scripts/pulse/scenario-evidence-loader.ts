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

const CONTRACT_EVIDENCE_FILES = [
  'PULSE_CUSTOMER_EVIDENCE.json',
  'PULSE_OPERATOR_EVIDENCE.json',
  'PULSE_ADMIN_EVIDENCE.json',
  'PULSE_SOAK_EVIDENCE.json',
] as const;

function normalizeActorEvidenceKey(value: unknown): ActorEvidenceKey | null {
  if (value === 'customer' || value === 'operator' || value === 'admin' || value === 'soak') {
    return value;
  }
  if (value === 'system') {
    return 'soak';
  }
  return null;
}

function inferActorEvidenceKeyFromFileName(fileName: string): ActorEvidenceKey | null {
  const match = fileName.match(/^PULSE_([A-Z]+)_EVIDENCE[.]json$/);
  return match ? normalizeActorEvidenceKey(match[1].toLowerCase()) : null;
}

function readEvidenceFileNamesFromManifest(rootDir: string): string[] {
  const candidates = [
    path.join(path.resolve(rootDir), '.pulse', 'current', 'PULSE_RESOLVED_MANIFEST.json'),
    path.join(path.resolve(rootDir), 'PULSE_RESOLVED_MANIFEST.json'),
    path.join(path.resolve(rootDir), 'pulse.manifest.json'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
        scenarioSpecs?: unknown;
      };
      if (!Array.isArray(parsed.scenarioSpecs)) {
        continue;
      }
      return parsed.scenarioSpecs
        .filter((entry): entry is Record<string, unknown> => {
          return Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry);
        })
        .flatMap((entry) =>
          Array.isArray(entry.requiredArtifacts)
            ? entry.requiredArtifacts.filter((artifact): artifact is string => {
                return (
                  typeof artifact === 'string' && /^PULSE_[A-Z_]+_EVIDENCE[.]json$/.test(artifact)
                );
              })
            : [],
        );
    } catch {
      continue;
    }
  }
  return [];
}

function readExistingEvidenceFileNames(rootDir: string): string[] {
  const resolvedRoot = path.resolve(rootDir);
  const dirs = [resolvedRoot, path.join(resolvedRoot, '.pulse', 'current')];
  return dirs.flatMap((dir) => {
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs
      .readdirSync(dir)
      .filter((fileName) => /^PULSE_[A-Z_]+_EVIDENCE[.]json$/.test(fileName));
  });
}

function discoverEvidenceFileNames(rootDir: string): string[] {
  return [
    ...new Set([
      ...readEvidenceFileNamesFromManifest(rootDir),
      ...readExistingEvidenceFileNames(rootDir),
      ...CONTRACT_EVIDENCE_FILES,
    ]),
  ];
}

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
  fallbackActorKind: ActorEvidenceKey,
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
  const actorKind = normalizeActorEvidenceKey(item.actorKind) ?? fallbackActorKind;

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
  fallbackActorKind: ActorEvidenceKey | null,
  fresh: boolean,
): PulseActorEvidence | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.results)) {
    return null;
  }
  const actorKind =
    normalizeActorEvidenceKey(data.actorKind) ??
    normalizeActorEvidenceKey(data.key) ??
    fallbackActorKind;
  if (!actorKind) {
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

  for (const fileName of discoverEvidenceFileNames(rootDir)) {
    const fallbackKey = inferActorEvidenceKeyFromFileName(fileName);
    const summaryKey = fallbackKey ?? fileName;
    const filePath = resolveEvidencePath(rootDir, fileName);
    if (!filePath) {
      summaryParts.push(`${summaryKey}: no file`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = readJson(filePath);
    } catch {
      summaryParts.push(`${summaryKey}: parse error`);
      continue;
    }

    const fresh = isFresh(filePath);
    const evidence = normalizeActorEvidence(parsed, fallbackKey, fresh);
    if (!evidence) {
      summaryParts.push(`${summaryKey}: invalid structure`);
      continue;
    }

    const key = evidence.actorKind;
    bundle[key] = evidence;
    bundle.results.push(...evidence.results);
    summaryParts.push(`${key}: ${fresh ? 'fresh' : 'stale'} (${evidence.results.length})`);
  }

  bundle.summary = summaryParts.join('; ');
  return bundle;
}
