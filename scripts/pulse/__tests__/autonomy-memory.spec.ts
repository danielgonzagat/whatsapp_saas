import { describe, expect, it } from 'vitest';

import { buildPulseAutonomyMemoryState } from '../autonomy-memory';
import type { PulseAutonomyIterationRecord, PulseAutonomyState } from '../types';

function makeIteration(
  iteration: number,
  overrides: Partial<PulseAutonomyIterationRecord>,
): PulseAutonomyIterationRecord {
  const timestamp = `2026-04-29T00:0${iteration}:00.000Z`;
  return {
    iteration,
    plannerMode: 'deterministic',
    strategyMode: 'normal',
    status: 'failed',
    startedAt: timestamp,
    finishedAt: timestamp,
    summary: 'strategy failed without convergence',
    improved: false,
    unit: {
      id: 'opaque-unit',
      kind: 'static',
      priority: 'P1',
      executionMode: 'ai_safe',
      title: 'Opaque unit',
      summary: 'Opaque unit summary',
      affectedCapabilities: [],
      affectedFlows: [],
      validationTargets: [],
    },
    directiveDigestBefore: null,
    directiveDigestAfter: null,
    directiveBefore: {
      certificationStatus: null,
      blockingTier: null,
      score: null,
      visionGap: null,
    },
    directiveAfter: null,
    codex: {
      executed: true,
      command: 'codex exec',
      exitCode: 1,
      finalMessage: 'failed',
    },
    validation: {
      executed: false,
      commands: [],
    },
    ...overrides,
  };
}

function makeAutonomyState(history: PulseAutonomyIterationRecord[]): PulseAutonomyState {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    status: 'idle',
    orchestrationMode: 'single',
    riskProfile: 'balanced',
    plannerMode: 'deterministic',
    continuous: false,
    maxIterations: history.length,
    completedIterations: history.length,
    parallelAgents: 1,
    maxWorkerRetries: 0,
    plannerModel: null,
    codexModel: null,
    guidanceGeneratedAt: null,
    currentCheckpoint: null,
    targetCheckpoint: null,
    visionGap: null,
    stopReason: null,
    nextActionableUnit: null,
    governedSandboxUnits: 0,
    escalatedValidationUnits: 0,
    observationOnlyUnits: 0,
    runner: {
      agentsSdkAvailable: false,
      agentsSdkVersion: null,
      openAiApiKeyConfigured: false,
      codexCliAvailable: true,
    },
    history,
  };
}

describe('autonomy memory repeated strategy concepts', () => {
  it('records repeated failed strategy fingerprints as escalation concepts', () => {
    const state = makeAutonomyState([
      makeIteration(1, {}),
      makeIteration(2, {
        summary: 'same failed strategy after equivalent punctuation change',
      }),
    ]);

    const memory = buildPulseAutonomyMemoryState({
      autonomyState: state,
      orchestrationState: null,
    });

    const repeatedStrategy = memory.concepts.find((concept) =>
      concept.id.startsWith('repeated-failed-strategy-opaque-unit-'),
    );

    expect(repeatedStrategy?.type).toBe('repeated_stall');
    expect(repeatedStrategy?.suggestedStrategy).toBe('escalated_validation');
    expect(repeatedStrategy?.unitIds).toEqual(['opaque-unit']);
    expect(repeatedStrategy?.iterations).toEqual([1, 2]);
    expect(repeatedStrategy?.summary).toContain('avoid reusing normal_deterministic');
  });
});
