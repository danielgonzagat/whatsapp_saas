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

type ExtendedUnitMemory = UnitMemory & Partial<StructuralMemoryExtensions>;

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

function normalizeUnitMemory(unit: LegacyUnitMemory): UnitMemory {
  const strategyFingerprints = unit.strategyFingerprints ?? [];
  const strategyFingerprintCounts = unit.strategyFingerprintCounts ?? {};
  const failedStrategyFingerprints = unit.failedStrategyFingerprints ?? [];
  const failedStrategyFingerprintCounts = unit.failedStrategyFingerprintCounts ?? {};
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
    adjudicationStatus: unit.adjudicationStatus ?? (unit.falsePositive ? 'false_positive' : null),
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

function createUnitMemory(unitId: string): UnitMemory {
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

// ── Internal record ──────────────────────────────────────────────────────────

function recordAttemptInternal(
  memory: StructuralMemoryState,
  rootDir: string,
  unitId: string,
  strategy: string,
  status: AttemptStatus,
  evidence?: string,
): StructuralMemoryState {
  const now = new Date().toISOString();
  let unitIndex = memory.units.findIndex((u) => u.unitId === unitId);

  if (unitIndex === -1) {
    unitIndex = memory.units.length;
    const newUnit = createUnitMemory(unitId);
    memory.units.push(newUnit);
  }

  const unit = { ...memory.units[unitIndex] } as ExtendedUnitMemory;
  unit.attempts += 1;
  unit.lastAttempt = now;
  const strategyFingerprint = recordStrategyFingerprint(unit, strategy);
  const adjudicationStatus = evidence ? classifyEvidenceDisposition(evidence) : null;

  if (adjudicationStatus) {
    applyAdjudication(unit, adjudicationStatus, evidence ?? `status=${adjudicationStatus}`);
  } else if (status === 'success') {
    unit.successfulStrategies = [...new Set([...unit.successfulStrategies, strategy])];
    unit.repeatedFailures = 0;
    unit.recommendedStrategy = strategy;
    unit.avoidStrategyFingerprint = null;
    clearFailedStrategyBlock(unit);
    if (unit.status !== 'resolved' && unit.status !== 'archived') {
      unit.status = 'active';
    }
  } else {
    unit.failedStrategies = [...new Set([...unit.failedStrategies, strategy])];
    const failedStrategyAttempts = recordFailedStrategyFingerprint(unit, strategyFingerprint);
    unit.repeatedFailures += 1;
    unit.lastFailure = now;
    unit.recommendedStrategy =
      failedStrategyAttempts >= 2
        ? `avoid_strategy_fingerprint:${unit.lastFailedStrategyFingerprint}`
        : null;
    if (unit.repeatedFailures >= REPEATED_FAILURE_THRESHOLD) {
      unit.status = REPEATED_FAILURE_STATUS;
      unit.recommendedStrategy = recommendedStrategyForRepeatedFailure(status);
    }
  }

  const newUnits = [...memory.units];
  newUnits[unitIndex] = unit;

  const auditEntry: MemoryEntry & { adjudicationStatus?: StructuralAdjudicationStatus | null } = {
    id: randomUUID(),
    timestamp: now,
    unit: unitId,
    strategy,
    strategyFingerprint,
    result: status,
    evidence: evidence ?? `status=${status} strategy=${strategy}`,
    falsePositive: unit.falsePositive,
    adjudicationStatus: unit.adjudicationStatus ?? null,
  };
  appendAuditEntry(rootDir, auditEntry);

  const learnedPatterns = learnPatterns({ ...memory, units: newUnits });

  return {
    ...memory,
    units: newUnits,
    generatedAt: now,
    summary: computeSummary(newUnits, learnedPatterns),
    learnedPatterns,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Record a PULSE unit attempt with its strategy, outcome, and evidence.
 *
 * Appends an atomic audit entry to `.pulse/audit/structural-memory.audit.jsonl`
 * and updates the aggregate unit memory. Detects repeated failures (3+) and
 * flags units for autonomous escalated validation.
 *
 * @param unit    — Unit id of the attempted unit
 * @param strategy — Strategy description used in this attempt
 * @param result   — Attempt outcome (success, failed, blocked, timeout, regression)
 * @param evidence — Supporting evidence string (diff summary, error message, etc.)
 * @param rootDir  — Repository root directory for persistence
 */
export function recordAttempt(
  unit: string,
  strategy: string,
  result: AttemptStatus,
  evidence: string,
  rootDir: string,
): StructuralMemoryState {
  const memory = loadExisting(rootDir) ?? newMemoryState();
  const nextMemory = recordAttemptInternal(memory, rootDir, unit, strategy, result, evidence);
  persistMemory(rootDir, nextMemory);
  return nextMemory;
}

/**
 * Detect all units that have hit the repeated failure threshold and need
 * autonomous escalated validation. A unit reaches this state after 3+
 * consecutive failures.
 *
 * @param rootDir — Repository root directory
 */
export function detectRepeatedFailures(rootDir: string): UnitMemory[] {
  const memory = loadExisting(rootDir);
  if (!memory) return [];
  return memory.units.filter((u) => u.status === REPEATED_FAILURE_STATUS);
}

/**
 * Return the learned patterns from structural memory — which strategies
 * are most effective for which types of units.
 *
 * Patterns are computed by aggregating success/failure rates across all
 * units and sorting by success rate. Each pattern includes the set of
 * unit IDs it applies to.
 *
 * @param rootDir — Repository root directory
 */
export function getLearnedPatterns(rootDir: string): LearnedPattern[] {
  const memory = loadExisting(rootDir);
  if (!memory) return [];
  return memory.learnedPatterns;
}

/**
 * Mark a unit as a false positive with supporting proof.
 *
 * Once marked, the unit transitions to `resolved` status and will not
 * trigger autonomous escalated validation.
 *
 * @param unitId   — ID of the unit to mark
 * @param proof    — Explanation of why this is a false positive
 * @param rootDir  — Repository root directory
 */
export function markFalsePositive(
  unitId: string,
  proof: string,
  rootDir: string,
): StructuralMemoryState {
  const memory = loadExisting(rootDir) ?? newMemoryState();
  const unitIndex = memory.units.findIndex((u) => u.unitId === unitId);
  if (unitIndex === -1) return memory;

  const newUnits = [...memory.units];
  newUnits[unitIndex] = {
    ...newUnits[unitIndex],
    falsePositive: true,
    fpProof: proof,
    status: 'resolved',
  };

  const auditEntry: MemoryEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    unit: unitId,
    strategy: 'false_positive_adjudication',
    strategyFingerprint: fingerprintStrategy('false_positive_adjudication'),
    result: 'success',
    evidence: proof,
    falsePositive: true,
  };
  appendAuditEntry(rootDir, auditEntry);

  const nextMemory = {
    ...memory,
    units: newUnits,
    generatedAt: new Date().toISOString(),
    summary: computeSummary(newUnits, memory.learnedPatterns),
  };
  persistMemory(rootDir, nextMemory);
  return nextMemory;
}

export function markAcceptedRisk(
  unitId: string,
  proof: string,
  rootDir: string,
): StructuralMemoryState {
  const memory = loadExisting(rootDir) ?? newMemoryState();
  const unitIndex = memory.units.findIndex((u) => u.unitId === unitId);
  if (unitIndex === -1) return memory;

  const newUnits = [...memory.units];
  const nextUnit = { ...newUnits[unitIndex] } as ExtendedUnitMemory;
  applyAdjudication(nextUnit, 'accepted_risk', proof);
  newUnits[unitIndex] = nextUnit;

  const auditEntry: MemoryEntry & { adjudicationStatus: StructuralAdjudicationStatus } = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    unit: unitId,
    strategy: 'accepted_risk_adjudication',
    strategyFingerprint: fingerprintStrategy('accepted_risk_adjudication'),
    result: 'success',
    evidence: proof,
    falsePositive: false,
    adjudicationStatus: 'accepted_risk',
  };
  appendAuditEntry(rootDir, auditEntry);

  const nextMemory = {
    ...memory,
    units: newUnits,
    generatedAt: new Date().toISOString(),
    summary: computeSummary(newUnits, memory.learnedPatterns),
  };
  persistMemory(rootDir, nextMemory);
  return nextMemory;
}

export function markStaleEvidence(
  unitId: string,
  proof: string,
  rootDir: string,
): StructuralMemoryState {
  const memory = loadExisting(rootDir) ?? newMemoryState();
  const unitIndex = memory.units.findIndex((u) => u.unitId === unitId);
  if (unitIndex === -1) return memory;

  const newUnits = [...memory.units];
  const nextUnit = { ...newUnits[unitIndex] } as ExtendedUnitMemory;
  applyAdjudication(nextUnit, 'stale', proof);
  newUnits[unitIndex] = nextUnit;

  const auditEntry: MemoryEntry & { adjudicationStatus: StructuralAdjudicationStatus } = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    unit: unitId,
    strategy: 'stale_evidence_adjudication',
    strategyFingerprint: fingerprintStrategy('stale_evidence_adjudication'),
    result: 'blocked',
    evidence: proof,
    falsePositive: false,
    adjudicationStatus: 'stale',
  };
  appendAuditEntry(rootDir, auditEntry);

  const nextMemory = {
    ...memory,
    units: newUnits,
    generatedAt: new Date().toISOString(),
    summary: computeSummary(newUnits, memory.learnedPatterns),
  };
  persistMemory(rootDir, nextMemory);
  return nextMemory;
}

/**
 * Learn patterns from successful strategies across similar units.
 *
 * Groups units by their ID prefix (capability family) and promotes
 * strategies that worked on sibling units as recommended patterns.
 * For units without a recommended strategy, assigns the best sibling
 * pattern if its success rate is >= 50%.
 *
 * @param memory — The structural memory state to analyze
 */
export function learnPatterns(memory: StructuralMemoryState): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];
  const strategyStats = new Map<
    string,
    { successes: number; attempts: number; unitIds: Set<string> }
  >();

  for (const unit of memory.units) {
    for (const strategy of unit.successfulStrategies) {
      const entry = strategyStats.get(strategy) ?? {
        successes: 0,
        attempts: 0,
        unitIds: new Set<string>(),
      };
      entry.successes += 1;
      entry.attempts += 1;
      entry.unitIds.add(unit.unitId);
      strategyStats.set(strategy, entry);
    }

    for (const strategy of unit.failedStrategies) {
      if (!strategyStats.has(strategy)) {
        strategyStats.set(strategy, {
          successes: 0,
          attempts: 1,
          unitIds: new Set<string>(),
        });
      } else {
        const entry = strategyStats.get(strategy)!;
        entry.attempts += 1;
      }
    }
  }

  for (const [strategy, stats] of strategyStats) {
    if (stats.attempts === 0) continue;
    const successRate = stats.successes / stats.attempts;
    if (successRate > 0) {
      patterns.push({ pattern: strategy, successRate, applicableTo: [...stats.unitIds] });
    }
  }

  patterns.sort((a, b) => b.successRate - a.successRate);

  for (let i = 0; i < memory.units.length; i++) {
    const unit = memory.units[i];
    if (unit.recommendedStrategy || unit.status === REPEATED_FAILURE_STATUS) continue;

    const prefix = unit.unitId.split(/[_-]/)[0];
    const siblingPatterns = patterns
      .filter((p) => p.applicableTo.some((id) => id !== unit.unitId && id.startsWith(prefix)))
      .sort((a, b) => b.successRate - a.successRate);

    if (siblingPatterns.length > 0 && siblingPatterns[0].successRate >= 0.5) {
      memory.units[i] = {
        ...unit,
        recommendedStrategy: siblingPatterns[0].pattern,
      };
    }
  }

  return patterns;
}

/**
 * Build the full structural memory state, merging prior state with new
 * evidence from autonomy iteration records.
 *
 * Workflow:
 * 1. Load existing memory from PULSE_STRUCTURAL_MEMORY.json
 * 2. Load autonomy iteration records for new attempt evidence
 * 3. Units with 3+ consecutive failures → escalated_validation
 * 4. Learn pattern recommendations from sibling units
 * 5. Store at `.pulse/current/PULSE_STRUCTURAL_MEMORY.json`
 *
 * @param rootDir — Repository root directory
 */
export function buildStructuralMemoryState(rootDir: string): StructuralMemoryState {
  return buildStructuralMemory(rootDir);
}

/** @deprecated Use buildStructuralMemoryState. Kept for backwards compatibility. */
export function buildStructuralMemory(rootDir: string): StructuralMemoryState {
  const priorState = loadExisting(rootDir);
  const autonomyState = loadAutonomyState(rootDir);
  const now = new Date().toISOString();

  const unitMap = new Map<string, UnitMemory>();

  if (priorState?.units) {
    for (const prior of priorState.units) {
      unitMap.set(prior.unitId, { ...prior });
    }
  }

  if (autonomyState?.history) {
    for (const iteration of autonomyState.history) {
      if (!iteration.unit?.id) continue;

      const unitId = iteration.unit.id;
      const existing = unitMap.get(unitId) ?? createUnitMemory(unitId);

      const status: AttemptStatus =
        iteration.status === 'completed' || iteration.status === 'validated'
          ? 'success'
          : iteration.status === 'failed'
            ? 'failed'
            : iteration.status === 'blocked'
              ? 'blocked'
              : 'failed';

      const strategy = `${iteration.strategyMode ?? 'normal'}_${iteration.plannerMode}`;
      const strategyFingerprint = recordStrategyFingerprint(existing, strategy);
      const adjudicationStatus = classifyEvidenceDisposition(iteration.summary || '');

      if (adjudicationStatus) {
        existing.attempts += 1;
        existing.lastAttempt = iteration.finishedAt;
        applyAdjudication(existing, adjudicationStatus, iteration.summary);
      } else if (status === 'success') {
        existing.attempts += 1;
        existing.lastAttempt = iteration.finishedAt;
        existing.successfulStrategies = [...new Set([...existing.successfulStrategies, strategy])];
        existing.repeatedFailures = 0;
        existing.recommendedStrategy = strategy;
        existing.avoidStrategyFingerprint = null;
        clearFailedStrategyBlock(existing);
        if (existing.status !== 'resolved' && existing.status !== 'archived') {
          existing.status = 'active';
        }
      } else {
        existing.attempts += 1;
        existing.lastAttempt = iteration.finishedAt;
        existing.failedStrategies = [...new Set([...existing.failedStrategies, strategy])];
        const failedStrategyAttempts = recordFailedStrategyFingerprint(
          existing,
          strategyFingerprint,
        );
        existing.repeatedFailures += 1;
        existing.lastFailure = iteration.finishedAt;
        existing.recommendedStrategy =
          failedStrategyAttempts >= 2
            ? `avoid_strategy_fingerprint:${existing.lastFailedStrategyFingerprint}`
            : existing.recommendedStrategy;
        if (existing.repeatedFailures >= REPEATED_FAILURE_THRESHOLD) {
          existing.status = REPEATED_FAILURE_STATUS;
          existing.recommendedStrategy = recommendedStrategyForRepeatedFailure(status);
        }
      }

      const auditEntry: MemoryEntry & { adjudicationStatus?: StructuralAdjudicationStatus | null } =
        {
          id: randomUUID(),
          timestamp: iteration.finishedAt,
          unit: unitId,
          strategy,
          strategyFingerprint,
          result: status,
          evidence: iteration.summary,
          falsePositive: existing.falsePositive,
          adjudicationStatus: existing.adjudicationStatus ?? null,
        };
      appendAuditEntry(rootDir, auditEntry);

      unitMap.set(unitId, existing);
    }
  }

  const units = [...unitMap.values()];
  const memory: StructuralMemoryState = {
    generatedAt: now,
    summary: {
      totalUnits: 0,
      activeUnits: 0,
      escalatedValidationUnits: 0,
      resolvedUnits: 0,
      falsePositives: 0,
      learnedStrategies: 0,
    },
    units,
    learnedPatterns: [],
  };

  const learnedPatterns = learnPatterns(memory);
  memory.learnedPatterns = learnedPatterns;
  memory.summary = computeSummary(units, learnedPatterns);

  persistMemory(rootDir, memory);

  return memory;
}

/** Check if a unit has hit the repeated failure threshold. */
export function checkForRepeatedFailures(unit: UnitMemory): boolean {
  return unit.repeatedFailures >= REPEATED_FAILURE_THRESHOLD;
}

/** Load audit log entries for inspection / reporting. */
export function loadAttemptHistory(rootDir: string): MemoryEntry[] {
  return loadAuditLog(rootDir);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function newMemoryState(): StructuralMemoryState {
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
