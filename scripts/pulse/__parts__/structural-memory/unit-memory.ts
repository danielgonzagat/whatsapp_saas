import { createHash, randomUUID } from 'node:crypto';
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
  REPEATED_FAILURE_STATUS,
  REPEATED_FAILURE_THRESHOLD,
} from './persistence';

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
  unit.avoidStrategyFingerprint = nextCount >= 2 ? fingerprint : null;
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
  unit.avoidFailedStrategyFingerprint = nextCount >= 2 ? fingerprint : null;
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

export function recommendedStrategyForRepeatedFailure(status: AttemptStatus): string {
  if (status === 'blocked') {
    return 'governed_sandbox';
  }
  if (status === 'timeout') {
    return 'observation_only';
  }
  return REPEATED_FAILURE_STATUS;
}

export function recordAttemptInternal(
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
