import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DiskScenarioEvidence } from '../../actors/disk-evidence';
import {
  deriveEvidenceFilesFromManifest,
  inferEvidenceKeyFromFileName,
  readManifestForModeRegistry,
  isPulseEvidenceFileName,
} from '../../scenario-mode-registry';
import { normalizeActorEvidence, normalizeStaleNonRunEvidenceForRead } from './normalize-evidence';

type ActorEvidenceKey = 'customer' | 'operator' | 'admin' | 'soak';

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

const CONTRACT_EVIDENCE_FILES = [
  'PULSE_CUSTOMER_EVIDENCE.json',
  'PULSE_OPERATOR_EVIDENCE.json',
  'PULSE_ADMIN_EVIDENCE.json',
  'PULSE_SOAK_EVIDENCE.json',
] as const;

function inferActorEvidenceKeyFromFileName(fileName: string): ActorEvidenceKey | null {
  return inferEvidenceKeyFromFileName(fileName) as ActorEvidenceKey | null;
}

function readEvidenceFileNamesFromManifest(rootDir: string): string[] {
  return deriveEvidenceFilesFromManifest(readManifestForModeRegistry(rootDir));
}

function readExistingEvidenceFileNames(rootDir: string): string[] {
  const resolvedRoot = path.resolve(rootDir);
  const dirs = [resolvedRoot, path.join(resolvedRoot, '.pulse', 'current')];
  return dirs.flatMap((dir) => {
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs.readdirSync(dir).filter(isPulseEvidenceFileName);
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

function isRefreshableNonRunEvidence(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.results) || data.results.length === 0) {
    return false;
  }
  const hasExecuted = (Array.isArray(data.executed) ? data.executed : []).length > 0;
  const hasPassed = (Array.isArray(data.passed) ? data.passed : []).length > 0;
  const hasFailed = (Array.isArray(data.failed) ? data.failed : []).length > 0;
  if (hasExecuted || hasPassed || hasFailed) {
    return false;
  }
  return (data.results as unknown[]).every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const item = entry as Record<string, unknown>;
    return item.executed !== true && (item.status === 'skipped' || item.status === 'not_run');
  });
}

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

    let fresh = isFresh(filePath);
    if (!fresh && isRefreshableNonRunEvidence(parsed)) {
      parsed = normalizeStaleNonRunEvidenceForRead(parsed, fallbackKey);
    }
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
