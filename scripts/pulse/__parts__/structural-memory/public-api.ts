import { randomUUID } from 'node:crypto';
import type {
  AttemptStatus,
  LearnedPattern,
  MemoryEntry,
  StructuralMemoryState,
  UnitMemory,
} from '../../types.structural-memory';
import type { ExtendedUnitMemory, StructuralAdjudicationStatus } from './types';
import {
  appendAuditEntry,
  computeSummary,
  loadAuditLog,
  loadAutonomyState,
  loadExisting,
  normalizeUnitMemory,
  persistMemory,
  REPEATED_FAILURE_STATUS,
  REPEATED_FAILURE_THRESHOLD,
} from './persistence';
import type { LegacyUnitMemory } from './types';
import {
  applyAdjudication,
  classifyEvidenceDisposition,
  clearFailedStrategyBlock,
  createUnitMemory,
  fingerprintStrategy,
  learnPatterns,
  recommendedStrategyForRepeatedFailure,
  recordAttemptInternal,
  recordFailedStrategyFingerprint,
  recordStrategyFingerprint,
} from './unit-memory';

export { fingerprintStrategy, learnPatterns } from './unit-memory';

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

export function buildStructuralMemoryState(rootDir: string): StructuralMemoryState {
  return buildStructuralMemory(rootDir);
}

export function buildStructuralMemory(rootDir: string): StructuralMemoryState {
  const priorState = loadExisting(rootDir);
  const autonomyState = loadAutonomyState(rootDir);
  const now = new Date().toISOString();

  const unitMap = new Map<string, ExtendedUnitMemory>();

  if (priorState?.units) {
    for (const prior of priorState.units) {
      unitMap.set(prior.unitId, normalizeUnitMemory(prior as LegacyUnitMemory));
    }
  }

  if (autonomyState?.history) {
    for (const iteration of autonomyState.history) {
      if (!iteration.unit?.id) continue;

      const unitId = iteration.unit.id;
      const existing: ExtendedUnitMemory =
        (unitMap.get(unitId) as ExtendedUnitMemory | undefined) ?? createUnitMemory(unitId);

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
          adjudicationStatus: (existing.adjudicationStatus ??
            null) as StructuralAdjudicationStatus | null,
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

export function checkForRepeatedFailures(unit: UnitMemory): boolean {
  return unit.repeatedFailures >= REPEATED_FAILURE_THRESHOLD;
}

export function loadAttemptHistory(rootDir: string): MemoryEntry[] {
  return loadAuditLog(rootDir);
}
