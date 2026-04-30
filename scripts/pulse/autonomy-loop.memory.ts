/**
 * PULSE autonomy memory state builder.
 * Derives reusable concepts from autonomy and orchestration history.
 */
import type {
  PulseAutonomyMemoryConcept,
  PulseAutonomyMemoryState,
  PulseAutonomyState,
  PulseAgentOrchestrationState,
} from './types';
import { fingerprintStrategy } from './structural-memory';

function buildAutonomyConceptConfidence(recurrence: number): 'low' | 'medium' | 'high' {
  if (recurrence >= 4) {
    return 'high';
  }
  if (recurrence >= 2) {
    return 'medium';
  }
  return 'low';
}

function autonomyRecordFailed(record: PulseAutonomyState['history'][number]): boolean {
  if (record.improved === false) {
    return true;
  }
  if (record.status === 'failed' || record.status === 'blocked') {
    return true;
  }
  if (record.codex.executed && record.codex.exitCode !== null && record.codex.exitCode !== 0) {
    return true;
  }
  return (
    record.validation.executed &&
    record.validation.commands.some((command) => command.exitCode !== 0)
  );
}

function autonomyRecordStrategy(record: PulseAutonomyState['history'][number]): string {
  return `${record.strategyMode ?? 'normal'}_${record.plannerMode}`;
}

/** Build pulse autonomy memory state. */
export function buildPulseAutonomyMemoryState(input: {
  autonomyState: PulseAutonomyState | null;
  orchestrationState?: PulseAgentOrchestrationState | null;
}): PulseAutonomyMemoryState {
  const concepts: PulseAutonomyMemoryConcept[] = [];
  const autonomyHistory = input.autonomyState?.history || [];
  const orchestrationHistory = input.orchestrationState?.history || [];

  const repeatedStalls = new Map<
    string,
    { title: string; iterations: number[]; firstSeenAt: string | null; lastSeenAt: string | null }
  >();
  for (const record of autonomyHistory) {
    const unitId = record.unit?.id;
    if (!unitId || record.improved !== false) {
      continue;
    }
    const current = repeatedStalls.get(unitId) || {
      title: record.unit?.title || unitId,
      iterations: [],
      firstSeenAt: record.startedAt || null,
      lastSeenAt: record.finishedAt || null,
    };
    current.iterations.push(record.iteration);
    current.firstSeenAt = current.firstSeenAt || record.startedAt || null;
    current.lastSeenAt = record.finishedAt || current.lastSeenAt;
    repeatedStalls.set(unitId, current);
  }

  for (const [unitId, entry] of repeatedStalls.entries()) {
    if (entry.iterations.length < 2) {
      continue;
    }
    concepts.push({
      id: `repeated-stall-${unitId}`,
      type: 'repeated_stall',
      title: `Repeated stall on ${entry.title}`,
      summary: `Unit ${entry.title} stalled without measurable convergence in ${entry.iterations.length} iteration(s).`,
      confidence: buildAutonomyConceptConfidence(entry.iterations.length),
      recurrence: entry.iterations.length,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
      unitIds: [unitId],
      iterations: entry.iterations,
      suggestedStrategy: 'narrow_scope',
    });
  }

  const failedStrategyClusters = new Map<
    string,
    {
      unitId: string;
      title: string;
      fingerprint: string;
      strategy: string;
      iterations: number[];
      firstSeenAt: string | null;
      lastSeenAt: string | null;
    }
  >();
  for (const record of autonomyHistory) {
    const unitId = record.unit?.id;
    if (!unitId || !autonomyRecordFailed(record)) {
      continue;
    }
    const strategy = autonomyRecordStrategy(record);
    const fingerprint = fingerprintStrategy(strategy);
    const key = `${unitId}:${fingerprint}`;
    const current = failedStrategyClusters.get(key) || {
      unitId,
      title: record.unit?.title || unitId,
      fingerprint,
      strategy,
      iterations: [],
      firstSeenAt: record.startedAt || null,
      lastSeenAt: record.finishedAt || null,
    };
    current.iterations.push(record.iteration);
    current.firstSeenAt = current.firstSeenAt || record.startedAt || null;
    current.lastSeenAt = record.finishedAt || current.lastSeenAt;
    failedStrategyClusters.set(key, current);
  }

  for (const cluster of failedStrategyClusters.values()) {
    if (cluster.iterations.length < 2) {
      continue;
    }
    concepts.push({
      id: `repeated-failed-strategy-${cluster.unitId}-${cluster.fingerprint}`,
      type: 'repeated_stall',
      title: `Repeated failed strategy on ${cluster.title}`,
      summary: `Unit ${cluster.title} retried failed strategy fingerprint ${cluster.fingerprint} in ${cluster.iterations.length} iteration(s); avoid reusing ${cluster.strategy} without new evidence.`,
      confidence: buildAutonomyConceptConfidence(cluster.iterations.length),
      recurrence: cluster.iterations.length,
      firstSeenAt: cluster.firstSeenAt,
      lastSeenAt: cluster.lastSeenAt,
      unitIds: [cluster.unitId],
      iterations: cluster.iterations,
      suggestedStrategy: 'escalated_validation',
    });
  }

  const validationFailureIterations = autonomyHistory.filter(
    (record) =>
      record.validation.executed &&
      record.validation.commands.some((command) => command.exitCode !== 0),
  );
  if (validationFailureIterations.length > 0) {
    concepts.push({
      id: 'validation-failure-cluster',
      type: 'validation_failure',
      title: 'Validation failure cluster',
      summary: `Validation commands failed in ${validationFailureIterations.length} autonomy iteration(s).`,
      confidence: buildAutonomyConceptConfidence(validationFailureIterations.length),
      recurrence: validationFailureIterations.length,
      firstSeenAt: validationFailureIterations[0]?.startedAt || null,
      lastSeenAt:
        validationFailureIterations[validationFailureIterations.length - 1]?.finishedAt || null,
      unitIds: validationFailureIterations
        .map((record) => record.unit?.id)
        .filter((value): value is string => Boolean(value)),
      iterations: validationFailureIterations.map((record) => record.iteration),
      suggestedStrategy: 'increase_validation',
    });
  }

  const executionFailureIterations = autonomyHistory.filter(
    (record) =>
      record.codex.executed && record.codex.exitCode !== null && record.codex.exitCode !== 0,
  );
  if (executionFailureIterations.length > 0) {
    concepts.push({
      id: 'execution-failure-cluster',
      type: 'execution_failure',
      title: 'Execution failure cluster',
      summary: `Codex execution failed in ${executionFailureIterations.length} autonomy iteration(s).`,
      confidence: buildAutonomyConceptConfidence(executionFailureIterations.length),
      recurrence: executionFailureIterations.length,
      firstSeenAt: executionFailureIterations[0]?.startedAt || null,
      lastSeenAt:
        executionFailureIterations[executionFailureIterations.length - 1]?.finishedAt || null,
      unitIds: executionFailureIterations
        .map((record) => record.unit?.id)
        .filter((value): value is string => Boolean(value)),
      iterations: executionFailureIterations.map((record) => record.iteration),
      suggestedStrategy: 'retry_in_isolation',
    });
  }

  const oversizedUnits = autonomyHistory.filter((record) => {
    const capabilityCount = record.unit?.affectedCapabilities?.length || 0;
    const flowCount = record.unit?.affectedFlows?.length || 0;
    return capabilityCount >= 8 || flowCount >= 3 || record.unit?.kind === 'scenario';
  });
  if (oversizedUnits.length > 0) {
    concepts.push({
      id: 'oversized-unit-cluster',
      type: 'oversized_unit',
      title: 'Oversized convergence units',
      summary: `${oversizedUnits.length} autonomy iteration(s) targeted wide-scope units that are likely poor fits for autonomous execution.`,
      confidence: buildAutonomyConceptConfidence(oversizedUnits.length),
      recurrence: oversizedUnits.length,
      firstSeenAt: oversizedUnits[0]?.startedAt || null,
      lastSeenAt: oversizedUnits[oversizedUnits.length - 1]?.finishedAt || null,
      unitIds: oversizedUnits
        .map((record) => record.unit?.id)
        .filter((value): value is string => Boolean(value)),
      iterations: oversizedUnits.map((record) => record.iteration),
      suggestedStrategy: 'narrow_scope',
    });
  }

  const failedWorkerBatches = orchestrationHistory.filter((batch) =>
    batch.workers.some((worker) => worker.applyStatus === 'failed' || worker.status === 'failed'),
  );
  if (failedWorkerBatches.length > 0) {
    concepts.push({
      id: 'parallel-failure-cluster',
      type: 'execution_failure',
      title: 'Parallel worker integration failures',
      summary: `${failedWorkerBatches.length} orchestration batch(es) contained worker or patch-integration failures.`,
      confidence: buildAutonomyConceptConfidence(failedWorkerBatches.length),
      recurrence: failedWorkerBatches.length,
      firstSeenAt: failedWorkerBatches[0]?.startedAt || null,
      lastSeenAt: failedWorkerBatches[failedWorkerBatches.length - 1]?.finishedAt || null,
      unitIds: failedWorkerBatches.flatMap((batch) =>
        batch.workers
          .map((worker) => worker.unit?.id)
          .filter((value): value is string => Boolean(value)),
      ),
      iterations: failedWorkerBatches.map((batch) => batch.batch),
      suggestedStrategy: 'reduce_parallelism',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalConcepts: concepts.length,
      repeatedStalls: concepts.filter((concept) => concept.type === 'repeated_stall').length,
      validationFailures: concepts.filter((concept) => concept.type === 'validation_failure')
        .length,
      executionFailures: concepts.filter((concept) => concept.type === 'execution_failure').length,
      oversizedUnits: concepts.filter((concept) => concept.type === 'oversized_unit').length,
    },
    concepts,
  };
}
