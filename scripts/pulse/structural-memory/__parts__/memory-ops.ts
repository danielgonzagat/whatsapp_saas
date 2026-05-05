// PULSE — Structural Memory Engine — Operations (Part 2)
//
// Attempt recording, failure detection, pattern retrieval, and adjudication.

import { randomUUID } from 'node:crypto';
import {
  _oneMoreThanUnit,
  REPEATED_FAILURE_THRESHOLD,
  REPEATED_FAILURE_STATUS,
  applyAdjudication,
  appendAuditEntry,
  classifyEvidenceDisposition,
  clearFailedStrategyBlock,
  computeSummary,
  createUnitMemory,
  ExtendedUnitMemory,
  fingerprintStrategy,
  loadExisting,
  newMemoryState,
  normalizeUnitMemory,
  persistMemory,
  recordFailedStrategyFingerprint,
  recordStrategyFingerprint,
  recommendedStrategyForRepeatedFailure,
  StructuralAdjudicationStatus,
} from './memory-core';
import type {
  AttemptStatus,
  LearnedPattern,
  MemoryEntry,
  StructuralMemoryState,
  UnitMemory,
} from '../../types.structural-memory';

// ══════════════════════════════════════════════════════════════════════════════
// Internal record
// ══════════════════════════════════════════════════════════════════════════════

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
      failedStrategyAttempts >= _oneMoreThanUnit
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

// Must be imported after recordAttemptInternal to avoid circular dependency
import { learnPatterns } from './memory-patterns';

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

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

export function detectRepeatedFailures(rootDir: string): UnitMemory[] {
  const memory = loadExisting(rootDir);
  if (!memory) return [];
  return memory.units.filter((u) => u.status === REPEATED_FAILURE_STATUS);
}

export function getLearnedPatterns(rootDir: string): LearnedPattern[] {
  const memory = loadExisting(rootDir);
  if (!memory) return [];
  return memory.learnedPatterns;
}

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

// ── Internal helpers ─────────────────────────────────────────────────────────
// newMemoryState is imported from memory-core.
