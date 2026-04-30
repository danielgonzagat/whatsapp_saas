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

