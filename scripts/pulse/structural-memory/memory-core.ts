// PULSE — Structural Memory Engine — Core (Part 1)
//
// Types, paths, loaders, fingerprinting, audit log, and unit factory.

import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendTextFile,
  ensureDir,
  pathExists,
  readJsonFile,
  readTextFile,
  writeTextFile,
} from '../../safe-fs';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/token-evidence';
import type {
  AttemptStatus,
  LegacyUnitMemoryStatus,
  LearnedPattern,
  MemoryEntry,
  StructuralMemoryState,
  UnitMemory,
  UnitMemoryStatus,
} from '../../types.structural-memory';

const _oneMoreThanUnit = deriveUnitValue() + deriveUnitValue();
const REPEATED_FAILURE_THRESHOLD = deriveUnitValue() + deriveUnitValue() + deriveUnitValue();

const ARTIFACT_FILE =
  discoverAllObservedArtifactFilenames().structuralMemory ?? 'PULSE_STRUCTURAL_MEMORY.json';
const AUDIT_LOG_FILENAME = 'structural-memory.audit.jsonl';

const REPEATED_FAILURE_STATUS: UnitMemoryStatus = 'escalated_validation';

type StrategyFingerprintFields =
  | 'strategyFingerprints'
  | 'strategyFingerprintCounts'
  | 'lastStrategyFingerprint'
  | 'repeatedStrategyAttempts'
  | 'avoidStrategyFingerprint';

type StructuralAdjudicationStatus = 'confirmed' | 'false_positive' | 'accepted_risk' | 'stale';

type StructuralMemoryExtensions = {
  failedStrategyFingerprints: string[];
  failedStrategyFingerprintCounts: Record<string, number>;
  lastFailedStrategyFingerprint: string | null;
  repeatedFailedStrategyAttempts: number;
  avoidFailedStrategyFingerprint: string | null;
  adjudicationStatus: StructuralAdjudicationStatus | null;
  adjudicationProof: string | null;
};

export type ExtendedUnitMemory = Omit<UnitMemory, keyof StructuralMemoryExtensions> &
  Partial<StructuralMemoryExtensions>;

type LegacyUnitMemory = Omit<UnitMemory, 'status'> &
  Partial<Pick<UnitMemory, StrategyFingerprintFields>> &
  Partial<StructuralMemoryExtensions> & {
    status: LegacyUnitMemoryStatus;
  };

type LegacyStructuralMemoryState = Omit<StructuralMemoryState, 'units'> & {
  units: LegacyUnitMemory[];
};

export { _oneMoreThanUnit, REPEATED_FAILURE_THRESHOLD, REPEATED_FAILURE_STATUS, ARTIFACT_FILE };
export { StructuralAdjudicationStatus, StructuralMemoryExtensions };
export { LegacyUnitMemory, LegacyStructuralMemoryState };

// ── Paths ────────────────────────────────────────────────────────────────────

function getArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', ARTIFACT_FILE);
}

function getAuditLogPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'audit', AUDIT_LOG_FILENAME);
}

export { getArtifactPath, getAuditLogPath };

// ── Loaders ──────────────────────────────────────────────────────────────────

export function loadExisting(rootDir: string): StructuralMemoryState | null {
  const filePath = getArtifactPath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return normalizeLoadedMemory(readJsonFile<LegacyStructuralMemoryState>(filePath));
  } catch {
    return null;
  }
}

function normalizeUnitStatus(status: LegacyUnitMemoryStatus): UnitMemoryStatus {
  return status === 'needs_human_review' ? REPEATED_FAILURE_STATUS : status;
}

function normalizeAdjudicationStatus(
  status: string | null | undefined,
): StructuralAdjudicationStatus | null {
  if (
    status === 'confirmed' ||
    status === 'false_positive' ||
    status === 'accepted_risk' ||
    status === 'stale'
  ) {
    return status;
  }
  return null;
}

export function normalizeUnitMemory(unit: LegacyUnitMemory): ExtendedUnitMemory {
  const strategyFingerprints = unit.strategyFingerprints ?? [];
  const strategyFingerprintCounts = unit.strategyFingerprintCounts ?? {};
  const failedStrategyFingerprints = unit.failedStrategyFingerprints ?? [];
  const failedStrategyFingerprintCounts = unit.failedStrategyFingerprintCounts ?? {};
  const adjudicationStatus = normalizeAdjudicationStatus(unit.adjudicationStatus);
  return {
    ...unit,
    status: normalizeUnitStatus(unit.status),
    strategyFingerprints,
    strategyFingerprintCounts,
    lastStrategyFingerprint: unit.lastStrategyFingerprint ?? null,
    repeatedStrategyAttempts: unit.repeatedStrategyAttempts ?? 0,
    avoidStrategyFingerprint: unit.avoidStrategyFingerprint ?? null,
    failedStrategyFingerprints,
    failedStrategyFingerprintCounts,
    lastFailedStrategyFingerprint: unit.lastFailedStrategyFingerprint ?? null,
    repeatedFailedStrategyAttempts: unit.repeatedFailedStrategyAttempts ?? 0,
    avoidFailedStrategyFingerprint: unit.avoidFailedStrategyFingerprint ?? null,
    adjudicationStatus: adjudicationStatus ?? (unit.falsePositive ? 'false_positive' : null),
    adjudicationProof: unit.adjudicationProof ?? unit.fpProof ?? null,
  };
}

function normalizeLoadedMemory(memory: LegacyStructuralMemoryState): StructuralMemoryState {
  const units = memory.units.map((unit) => normalizeUnitMemory(unit));
  const learnedPatterns = memory.learnedPatterns ?? [];
  return {
    ...memory,
    units,
    learnedPatterns,
    summary: computeSummary(units, learnedPatterns),
  };
}

// ── Summary ──────────────────────────────────────────────────────────────────

export function computeSummary(
  units: UnitMemory[],
  learnedPatterns: LearnedPattern[],
): StructuralMemoryState['summary'] {
  return {
    totalUnits: units.length,
    activeUnits: units.filter((u) => u.status === 'active').length,
    escalatedValidationUnits: units.filter((u) => u.status === REPEATED_FAILURE_STATUS).length,
    resolvedUnits: units.filter((u) => u.status === 'resolved').length,
    falsePositives: units.filter((u) => u.falsePositive).length,
    learnedStrategies: learnedPatterns.length,
  };
}

export function recommendedStrategyForRepeatedFailure(status: AttemptStatus): string {
  if (status === 'blocked') {
    return 'governed_sandbox';
  }
  if (status === 'timeout') {
    return 'observation_only';
  }
  return REPEATED_FAILURE_STATUS;
}

// ── Fingerprinting ────────────────────────────────────────────────────────────

export function fingerprintStrategy(strategy: string): string {
  const normalized = strategy
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(normalized || 'empty-strategy')
    .digest('hex')
    .substring(0, 16);
}

export function recordStrategyFingerprint(unit: ExtendedUnitMemory, strategy: string): string {
  const fingerprint = fingerprintStrategy(strategy);
  const counts = unit.strategyFingerprintCounts ?? {};
  const fingerprints = unit.strategyFingerprints ?? [];
  const previousCount = counts[fingerprint] ?? 0;
  const nextCount = previousCount + 1;

  unit.strategyFingerprintCounts = {
    ...counts,
    [fingerprint]: nextCount,
  };
  unit.strategyFingerprints = [...new Set([...fingerprints, fingerprint])];
  unit.lastStrategyFingerprint = fingerprint;
  unit.repeatedStrategyAttempts = nextCount;
  unit.avoidStrategyFingerprint = nextCount >= _oneMoreThanUnit ? fingerprint : null;
  return fingerprint;
}

export function recordFailedStrategyFingerprint(
  unit: ExtendedUnitMemory,
  fingerprint: string,
): number {
  const counts = unit.failedStrategyFingerprintCounts ?? {};
  const fingerprints = unit.failedStrategyFingerprints ?? [];
  const previousCount = counts[fingerprint] ?? 0;
  const nextCount = previousCount + 1;

  unit.failedStrategyFingerprintCounts = {
    ...counts,
    [fingerprint]: nextCount,
  };
  unit.failedStrategyFingerprints = [...new Set([...fingerprints, fingerprint])];
  unit.lastFailedStrategyFingerprint = fingerprint;
  unit.repeatedFailedStrategyAttempts = nextCount;
  unit.avoidFailedStrategyFingerprint = nextCount >= _oneMoreThanUnit ? fingerprint : null;
  return nextCount;
}

export function clearFailedStrategyBlock(unit: ExtendedUnitMemory): void {
  unit.avoidFailedStrategyFingerprint = null;
  unit.repeatedFailedStrategyAttempts = 0;
}

export function classifyEvidenceDisposition(evidence: string): StructuralAdjudicationStatus | null {
  const normalized = evidence.toLowerCase();
  const match = normalized.match(
    /\b(?:status|verdict|disposition|classification|outcome)\s*[:=]\s*(false_positive|accepted_risk|stale|confirmed)\b/,
  );
  return match ? (match[1] as StructuralAdjudicationStatus) : null;
}

export function applyAdjudication(
  unit: ExtendedUnitMemory,
  status: StructuralAdjudicationStatus,
  proof: string,
): void {
  unit.adjudicationStatus = status;
  unit.adjudicationProof = proof;

  if (status === 'false_positive') {
    unit.falsePositive = true;
    unit.fpProof = proof;
    unit.status = 'resolved';
    unit.repeatedFailures = 0;
    unit.recommendedStrategy = 'false_positive:do_not_retry';
    clearFailedStrategyBlock(unit);
    return;
  }

  if (status === 'accepted_risk') {
    unit.falsePositive = false;
    unit.status = 'archived';
    unit.repeatedFailures = 0;
    unit.recommendedStrategy = 'accepted_risk:do_not_retry_until_evidence_changes';
    clearFailedStrategyBlock(unit);
    return;
  }

  if (status === 'stale') {
    unit.falsePositive = false;
    unit.status = 'active';
    unit.repeatedFailures = 0;
    unit.recommendedStrategy = 'observation_only';
    clearFailedStrategyBlock(unit);
    return;
  }

  unit.falsePositive = false;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export function loadAuditLog(rootDir: string): MemoryEntry[] {
  const logPath = getAuditLogPath(rootDir);
  if (!pathExists(logPath)) return [];
  const entries: MemoryEntry[] = [];
  const raw = readTextFile(logPath);
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as MemoryEntry);
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

export function appendAuditEntry(rootDir: string, entry: MemoryEntry): void {
  const logPath = getAuditLogPath(rootDir);
  ensureDir(path.dirname(logPath), { recursive: true });
  appendTextFile(logPath, `${JSON.stringify(entry)}\n`);
}

export function persistMemory(rootDir: string, memory: StructuralMemoryState): void {
  const artifactPath = getArtifactPath(rootDir);
  ensureDir(path.dirname(artifactPath), { recursive: true });
  writeTextFile(artifactPath, JSON.stringify(memory, null, 2));
}

// ── Unit memory factory ──────────────────────────────────────────────────────

export function createUnitMemory(unitId: string): ExtendedUnitMemory {
  return {
    unitId,
    attempts: 0,
    lastAttempt: new Date(0).toISOString(),
    failedStrategies: [],
    successfulStrategies: [],
    strategyFingerprints: [],
    strategyFingerprintCounts: {},
    lastStrategyFingerprint: null,
    repeatedStrategyAttempts: 0,
    avoidStrategyFingerprint: null,
    failedStrategyFingerprints: [],
    failedStrategyFingerprintCounts: {},
    lastFailedStrategyFingerprint: null,
    repeatedFailedStrategyAttempts: 0,
    avoidFailedStrategyFingerprint: null,
    lastFailure: null,
    repeatedFailures: 0,
    status: 'active',
    recommendedStrategy: null,
    falsePositive: false,
    fpProof: null,
    adjudicationStatus: null,
    adjudicationProof: null,
  };
}

export function newMemoryState(): StructuralMemoryState {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalUnits: 0,
      activeUnits: 0,
      escalatedValidationUnits: 0,
      resolvedUnits: 0,
      falsePositives: 0,
      learnedStrategies: 0,
    },
    units: [],
    learnedPatterns: [],
  };
}
