// PULSE — Structural Memory Engine — Patterns (Part 3)
//
// Pattern learning, memory building, and entry inspection.

import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathExists, readJsonFile } from '../safe-fs';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import type { PulseAutonomyState } from '../types.autonomy';
import type {
  AttemptStatus,
  LearnedPattern,
  MemoryEntry,
  StructuralMemoryState,
  UnitMemory,
} from '../types.structural-memory';
import {
  _oneMoreThanUnit,
  REPEATED_FAILURE_THRESHOLD,
  REPEATED_FAILURE_STATUS,
  appendAuditEntry,
  applyAdjudication,
  classifyEvidenceDisposition,
  clearFailedStrategyBlock,
  computeSummary,
  createUnitMemory,
  ExtendedUnitMemory,
  LegacyUnitMemory,
  loadAuditLog,
  loadExisting,
  normalizeUnitMemory,
  persistMemory,
  recordFailedStrategyFingerprint,
  recordStrategyFingerprint,
  recommendedStrategyForRepeatedFailure,
  StructuralAdjudicationStatus,
} from './memory-core';

// ── Internal loader ──────────────────────────────────────────────────────────

function loadAutonomyState(rootDir: string): PulseAutonomyState | null {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_AUTONOMY_STATE.json');
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseAutonomyState>(filePath);
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Pattern Learning
// ══════════════════════════════════════════════════════════════════════════════

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
    if (successRate > deriveZeroValue()) {
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

    if (
      siblingPatterns.length > deriveZeroValue() &&
      siblingPatterns[0].successRate >= deriveUnitValue() / _oneMoreThanUnit
    ) {
      memory.units[i] = {
        ...unit,
        recommendedStrategy: siblingPatterns[0].pattern,
      };
    }
  }

  return patterns;
}

// ══════════════════════════════════════════════════════════════════════════════
// Memory Building
// ══════════════════════════════════════════════════════════════════════════════

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
          failedStrategyAttempts >= _oneMoreThanUnit
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

// ══════════════════════════════════════════════════════════════════════════════
// Inspection
// ══════════════════════════════════════════════════════════════════════════════

export function checkForRepeatedFailures(unit: UnitMemory): boolean {
  return unit.repeatedFailures >= REPEATED_FAILURE_THRESHOLD;
}

export function loadAttemptHistory(rootDir: string): MemoryEntry[] {
  return loadAuditLog(rootDir);
}
