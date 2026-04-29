// PULSE — Wave 7 Module B: Structural Memory Engine
//
// Persistent per-unit memory that tracks attempt history, learns which
// strategies work on which kinds of units, and surfaces units that need
// human review after repeated automated failures.
//
// Two persistence layers:
//   1. `.pulse/current/PULSE_STRUCTURAL_MEMORY.json` — aggregate state
//   2. `.pulse/audit/structural-memory.audit.jsonl` — append-only attempt log

import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
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
  LearnedPattern,
  MemoryEntry,
  StructuralMemoryState,
  UnitMemory,
} from './types.structural-memory';

const ARTIFACT_FILE = 'PULSE_STRUCTURAL_MEMORY.json';
const AUDIT_LOG_FILENAME = 'structural-memory.audit.jsonl';

const REPEATED_FAILURE_THRESHOLD = 3;

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
    return readJsonFile<StructuralMemoryState>(filePath);
  } catch {
    return null;
  }
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

// ── Unit memory factory ──────────────────────────────────────────────────────

function createUnitMemory(unitId: string): UnitMemory {
  return {
    unitId,
    attempts: 0,
    lastAttempt: new Date(0).toISOString(),
    failedStrategies: [],
    successfulStrategies: [],
    lastFailure: null,
    repeatedFailures: 0,
    status: 'active',
    recommendedStrategy: null,
    falsePositive: false,
    fpProof: null,
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
    needsHumanReview: units.filter((u) => u.status === 'needs_human_review').length,
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

  const unit = { ...memory.units[unitIndex] };
  unit.attempts += 1;
  unit.lastAttempt = now;

  if (status === 'success') {
    unit.successfulStrategies = [...new Set([...unit.successfulStrategies, strategy])];
    unit.repeatedFailures = 0;
    unit.recommendedStrategy = strategy;
    if (unit.status !== 'resolved' && unit.status !== 'archived') {
      unit.status = 'active';
    }
  } else {
    unit.failedStrategies = [...new Set([...unit.failedStrategies, strategy])];
    unit.repeatedFailures += 1;
    unit.lastFailure = now;
    unit.recommendedStrategy = null;
    if (unit.repeatedFailures >= REPEATED_FAILURE_THRESHOLD) {
      unit.status = 'needs_human_review';
    }
  }

  const newUnits = [...memory.units];
  newUnits[unitIndex] = unit;

  const auditEntry: MemoryEntry = {
    id: randomUUID(),
    timestamp: now,
    unit: unitId,
    strategy,
    result: status,
    evidence: evidence ?? `status=${status} strategy=${strategy}`,
    falsePositive: unit.falsePositive,
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
 * flags units as `needs_human_review`.
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
  return recordAttemptInternal(memory, rootDir, unit, strategy, result, evidence);
}

/**
 * Detect all units that have hit the repeated failure threshold and need
 * human review. A unit reaches this state after 3+ consecutive failures.
 *
 * @param rootDir — Repository root directory
 */
export function detectRepeatedFailures(rootDir: string): UnitMemory[] {
  const memory = loadExisting(rootDir);
  if (!memory) return [];
  return memory.units.filter((u) => u.status === 'needs_human_review');
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
 * trigger `needs_human_review` alerts.
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
    strategy: 'manual_fp_mark',
    result: 'success',
    evidence: proof,
    falsePositive: true,
  };
  appendAuditEntry(rootDir, auditEntry);

  return {
    ...memory,
    units: newUnits,
    generatedAt: new Date().toISOString(),
    summary: computeSummary(newUnits, memory.learnedPatterns),
  };
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
    if (unit.recommendedStrategy || unit.status === 'needs_human_review') continue;

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
 * 3. Units with 3+ consecutive failures → needs_human_review
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

      if (status === 'success') {
        existing.attempts += 1;
        existing.lastAttempt = iteration.finishedAt;
        existing.successfulStrategies = [...new Set([...existing.successfulStrategies, strategy])];
        existing.repeatedFailures = 0;
        existing.recommendedStrategy = strategy;
        if (existing.status !== 'resolved' && existing.status !== 'archived') {
          existing.status = 'active';
        }
      } else {
        existing.attempts += 1;
        existing.lastAttempt = iteration.finishedAt;
        existing.failedStrategies = [...new Set([...existing.failedStrategies, strategy])];
        existing.repeatedFailures += 1;
        existing.lastFailure = iteration.finishedAt;
        if (existing.repeatedFailures >= REPEATED_FAILURE_THRESHOLD) {
          existing.status = 'needs_human_review';
        }
      }

      const auditEntry: MemoryEntry = {
        id: randomUUID(),
        timestamp: iteration.finishedAt,
        unit: unitId,
        strategy,
        result: status,
        evidence: iteration.summary,
        falsePositive: existing.falsePositive,
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
      needsHumanReview: 0,
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

  const artifactPath = getArtifactPath(rootDir);
  ensureDir(path.dirname(artifactPath), { recursive: true });
  writeTextFile(artifactPath, JSON.stringify(memory, null, 2));

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
      needsHumanReview: 0,
      resolvedUnits: 0,
      falsePositives: 0,
      learnedStrategies: 0,
    },
    units: [],
    learnedPatterns: [],
  };
}
