import * as path from 'node:path';
import {
  appendTextFile,
  ensureDir,
  pathExists,
  readJsonFile,
  readTextFile,
  writeTextFile,
} from '../../safe-fs';
import type { PulseAutonomyState } from '../../types';
import type {
  LegacyUnitMemoryStatus,
  LearnedPattern,
  MemoryEntry,
  StructuralMemoryState,
  UnitMemory,
  UnitMemoryStatus,
} from '../../types.structural-memory';
import type {
  ExtendedUnitMemory,
  LegacyStructuralMemoryState,
  LegacyUnitMemory,
  StructuralAdjudicationStatus,
} from './types';

export const ARTIFACT_FILE = 'PULSE_STRUCTURAL_MEMORY.json';
export const AUDIT_LOG_FILENAME = 'structural-memory.audit.jsonl';

export const REPEATED_FAILURE_THRESHOLD = 3;
export const REPEATED_FAILURE_STATUS: UnitMemoryStatus = 'escalated_validation';

export function getArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', ARTIFACT_FILE);
}

export function getAuditLogPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'audit', AUDIT_LOG_FILENAME);
}

export function loadExisting(rootDir: string): StructuralMemoryState | null {
  const filePath = getArtifactPath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return normalizeLoadedMemory(readJsonFile<LegacyStructuralMemoryState>(filePath));
  } catch {
    return null;
  }
}

export function normalizeUnitStatus(status: LegacyUnitMemoryStatus): UnitMemoryStatus {
  return status === 'needs_human_review' ? REPEATED_FAILURE_STATUS : status;
}

export function normalizeAdjudicationStatus(
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

export function normalizeLoadedMemory(memory: LegacyStructuralMemoryState): StructuralMemoryState {
  const units = memory.units.map((unit) => normalizeUnitMemory(unit));
  const learnedPatterns = memory.learnedPatterns ?? [];
  return {
    ...memory,
    units,
    learnedPatterns,
    summary: computeSummary(units, learnedPatterns),
  };
}

export function loadAutonomyState(rootDir: string): PulseAutonomyState | null {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_AUTONOMY_STATE.json');
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseAutonomyState>(filePath);
  } catch {
    return null;
  }
}

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
