// PULSE — Wave 7 Module B: Structural Memory Engine
//
// Persistent per-unit memory that tracks attempt history, learns which
// strategies work on which kinds of units, and escalates repeated automated
// failures into validation strategies that remain autonomous.
//
// Two persistence layers:
//   1. `.pulse/current/PULSE_STRUCTURAL_MEMORY.json` — aggregate state
//   2. `.pulse/audit/structural-memory.audit.jsonl` — append-only attempt log

import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendTextFile,
  ensureDir,
  pathExists,
  readJsonFile,
  readTextFile,
  writeTextFile,
} from './safe-fs';
import type { PulseAutonomyState } from './types';
import type {
  AttemptStatus,
  LegacyUnitMemoryStatus,
  LearnedPattern,
  MemoryEntry,
  StructuralMemoryState,
  UnitMemory,
  UnitMemoryStatus,
} from './types.structural-memory';

const ARTIFACT_FILE = 'PULSE_STRUCTURAL_MEMORY.json';
const AUDIT_LOG_FILENAME = 'structural-memory.audit.jsonl';

const REPEATED_FAILURE_THRESHOLD = 3;
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

type ExtendedUnitMemory = Omit<UnitMemory, keyof StructuralMemoryExtensions> &
  Partial<StructuralMemoryExtensions>;

type LegacyUnitMemory = Omit<UnitMemory, 'status'> &
  Partial<Pick<UnitMemory, StrategyFingerprintFields>> &
  Partial<StructuralMemoryExtensions> & {
    status: LegacyUnitMemoryStatus;
  };

type LegacyStructuralMemoryState = Omit<StructuralMemoryState, 'units'> & {
  units: LegacyUnitMemory[];
};

// ── Paths ────────────────────────────────────────────────────────────────────

function getArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', ARTIFACT_FILE);
}

function getAuditLogPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'audit', AUDIT_LOG_FILENAME);
}

// ── Loaders ──────────────────────────────────────────────────────────────────

function loadExisting(rootDir: string): StructuralMemoryState | null {
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

function normalizeUnitMemory(unit: LegacyUnitMemory): ExtendedUnitMemory {
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

function recommendedStrategyForRepeatedFailure(status: AttemptStatus): string {
  if (status === 'blocked') {
    return 'governed_sandbox';
  }
  if (status === 'timeout') {
    return 'observation_only';
  }
  return REPEATED_FAILURE_STATUS;
}

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

function recordStrategyFingerprint(unit: ExtendedUnitMemory, strategy: string): string {
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
  unit.avoidStrategyFingerprint = nextCount >= 2 ? fingerprint : null;
  return fingerprint;
}

function recordFailedStrategyFingerprint(unit: ExtendedUnitMemory, fingerprint: string): number {
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
  unit.avoidFailedStrategyFingerprint = nextCount >= 2 ? fingerprint : null;
  return nextCount;
}

function clearFailedStrategyBlock(unit: ExtendedUnitMemory): void {
  unit.avoidFailedStrategyFingerprint = null;
  unit.repeatedFailedStrategyAttempts = 0;
}

function classifyEvidenceDisposition(evidence: string): StructuralAdjudicationStatus | null {
  const normalized = evidence.toLowerCase();
  const match = normalized.match(
    /\b(?:status|verdict|disposition|classification|outcome)\s*[:=]\s*(false_positive|accepted_risk|stale|confirmed)\b/,
  );
  return match ? (match[1] as StructuralAdjudicationStatus) : null;
}

function applyAdjudication(
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

function loadAutonomyState(rootDir: string): PulseAutonomyState | null {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_AUTONOMY_STATE.json');
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseAutonomyState>(filePath);
  } catch {
    return null;
  }
}

function loadAuditLog(rootDir: string): MemoryEntry[] {
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

// ── Entry logging ────────────────────────────────────────────────────────────

function appendAuditEntry(rootDir: string, entry: MemoryEntry): void {
  const logPath = getAuditLogPath(rootDir);
  ensureDir(path.dirname(logPath), { recursive: true });
  appendTextFile(logPath, `${JSON.stringify(entry)}\n`);
}

function persistMemory(rootDir: string, memory: StructuralMemoryState): void {
  const artifactPath = getArtifactPath(rootDir);
  ensureDir(path.dirname(artifactPath), { recursive: true });
  writeTextFile(artifactPath, JSON.stringify(memory, null, 2));
}

// ── Unit memory factory ──────────────────────────────────────────────────────

function createUnitMemory(unitId: string): ExtendedUnitMemory {
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

// ── Summary ──────────────────────────────────────────────────────────────────

function computeSummary(
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
import "./__companions__/structural-memory.companion";
