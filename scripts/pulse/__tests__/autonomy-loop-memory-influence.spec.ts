import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildPulseAutonomyStateSeed,
  getMemoryAwarePreferredAutomationSafeUnits,
  selectMemoryAwareParallelUnits,
} from '../autonomy-loop.state-io';
import { buildPulseAutonomyMemoryState } from '../autonomy-loop.memory';
import type { PulseAutonomousDirectiveUnit } from '../autonomy-loop.types';
import { fingerprintStrategy } from '../structural-memory';
import type { PulseAutonomyIterationRecord, PulseAutonomyState } from '../types';
import type { StructuralMemoryState } from '../types.structural-memory';

function makeRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-autonomy-loop-memory-'));
  fs.mkdirSync(path.join(rootDir, '.pulse', 'current'), { recursive: true });
  return rootDir;
}

function writeStructuralMemory(rootDir: string, memory: StructuralMemoryState): void {
  fs.writeFileSync(
    path.join(rootDir, '.pulse', 'current', 'PULSE_STRUCTURAL_MEMORY.json'),
    JSON.stringify(memory, null, 2),
  );
}

function makeUnit(overrides: Partial<PulseAutonomousDirectiveUnit>): PulseAutonomousDirectiveUnit {
  return {
    id: overrides.id ?? 'unit',
    kind: overrides.kind ?? 'static',
    priority: overrides.priority ?? 'P1',
    source: overrides.source ?? 'test',
    executionMode: overrides.executionMode ?? 'ai_safe',
    riskLevel: overrides.riskLevel ?? 'low',
    evidenceMode: overrides.evidenceMode ?? 'observed',
    confidence: overrides.confidence ?? 'high',
    productImpact: overrides.productImpact ?? 'machine',
    ownerLane: overrides.ownerLane ?? 'pulse-core',
    title: overrides.title ?? 'Unit',
    summary: overrides.summary ?? 'Unit summary',
    affectedCapabilities: overrides.affectedCapabilities ?? [],
    affectedFlows: overrides.affectedFlows ?? [],
    validationTargets: overrides.validationTargets ?? [],
    ...overrides,
  };
}

function makeStructuralMemory(
  unitId: string,
  recommendedStrategy: string | null,
): StructuralMemoryState {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalUnits: 1,
      activeUnits: 1,
      escalatedValidationUnits: 0,
      resolvedUnits: 0,
      falsePositives: 0,
      learnedStrategies: 0,
    },
    units: [
      {
        unitId,
        attempts: 2,
        lastAttempt: '2026-04-29T00:00:00.000Z',
        failedStrategies: ['normal_deterministic'],
        successfulStrategies: [],
        lastFailure: '2026-04-29T00:00:00.000Z',
        repeatedFailures: 2,
        status: 'active',
        recommendedStrategy,
        falsePositive: false,
        fpProof: null,
      },
    ],
    learnedPatterns: [],
  };
}

function makeIteration(
  iteration: number,
  unitId: string,
  strategyMode: PulseAutonomyIterationRecord['strategyMode'],
): PulseAutonomyIterationRecord {
  const timestamp = `2026-04-29T00:0${iteration}:00.000Z`;
  return {
    iteration,
    plannerMode: 'deterministic',
    strategyMode,
    status: 'failed',
    startedAt: timestamp,
    finishedAt: timestamp,
    summary: 'strategy failed without convergence',
    improved: false,
    unit: {
      id: unitId,
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

describe('autonomy loop memory influence', () => {
  it('treats stale structural memory as observation_only and removes it from execution', () => {
    const rootDir = makeRoot();
    const staleUnit = makeUnit({ id: 'stale-unit', priority: 'P0', title: 'Stale unit' });
    const freshUnit = makeUnit({ id: 'fresh-unit', priority: 'P1', title: 'Fresh unit' });
    writeStructuralMemory(rootDir, makeStructuralMemory('stale-unit', 'observation_only'));

    const state = buildPulseAutonomyStateSeed({
      rootDir,
      directive: {
        autonomyReadiness: { verdict: 'SIM' },
        nextAutonomousUnits: [staleUnit, freshUnit],
      },
      riskProfile: 'balanced',
      plannerMode: 'deterministic',
    });

    expect(state.nextActionableUnit?.id).toBe('fresh-unit');
  });

  it('skips a structural failed-strategy fingerprint for the same planner strategy only', () => {
    const rootDir = makeRoot();
    const retriedUnit = makeUnit({ id: 'retried-unit', priority: 'P0', title: 'Retried unit' });
    const fallbackUnit = makeUnit({ id: 'fallback-unit', priority: 'P1', title: 'Fallback unit' });
    const avoidNormal = `avoid_strategy_fingerprint:${fingerprintStrategy('normal_deterministic')}`;
    writeStructuralMemory(rootDir, makeStructuralMemory('retried-unit', avoidNormal));

    expect(
      getMemoryAwarePreferredAutomationSafeUnits(
        rootDir,
        { nextAutonomousUnits: [retriedUnit, fallbackUnit] },
        'balanced',
        null,
        'deterministic',
        'normal',
      ).map((unit) => unit.id),
    ).toEqual(['fallback-unit']);

    expect(
      getMemoryAwarePreferredAutomationSafeUnits(
        rootDir,
        { nextAutonomousUnits: [retriedUnit, fallbackUnit] },
        'balanced',
        null,
        'deterministic',
        'adaptive_narrow_scope',
      ).map((unit) => unit.id),
    ).toContain('retried-unit');
  });

  it('uses autonomy memory to avoid repeating the same failed strategy', () => {
    const rootDir = makeRoot();
    const failedUnit = makeUnit({ id: 'failed-unit', priority: 'P0', title: 'Failed unit' });
    const fallbackUnit = makeUnit({ id: 'fallback-unit', priority: 'P1', title: 'Fallback unit' });
    const previousState = makeAutonomyState([
      makeIteration(1, 'failed-unit', 'normal'),
      makeIteration(2, 'failed-unit', 'normal'),
    ]);
    const memory = buildPulseAutonomyMemoryState({
      autonomyState: previousState,
      orchestrationState: null,
    });

    expect(
      memory.concepts.some((concept) =>
        concept.id.startsWith('repeated-failed-strategy-failed-unit-'),
      ),
    ).toBe(true);
    expect(
      getMemoryAwarePreferredAutomationSafeUnits(
        rootDir,
        { nextAutonomousUnits: [failedUnit, fallbackUnit] },
        'balanced',
        previousState,
        'deterministic',
        'normal',
      ).map((unit) => unit.id),
    ).toEqual(['fallback-unit']);
  });

  it('applies memory-aware filtering before selecting parallel batches', () => {
    const rootDir = makeRoot();
    const blockedUnit = makeUnit({
      id: 'blocked-unit',
      priority: 'P0',
      title: 'Blocked unit',
      affectedCapabilities: ['capability-a'],
    });
    const firstParallelUnit = makeUnit({
      id: 'first-parallel-unit',
      priority: 'P1',
      title: 'First parallel unit',
      affectedCapabilities: ['capability-b'],
    });
    const secondParallelUnit = makeUnit({
      id: 'second-parallel-unit',
      priority: 'P1',
      title: 'Second parallel unit',
      affectedCapabilities: ['capability-c'],
    });
    writeStructuralMemory(rootDir, makeStructuralMemory('blocked-unit', 'observation_only'));

    expect(
      selectMemoryAwareParallelUnits(
        rootDir,
        { nextAutonomousUnits: [blockedUnit, firstParallelUnit, secondParallelUnit] },
        2,
        'balanced',
        null,
        'deterministic',
        'normal',
      ).map((unit) => unit.id),
    ).toEqual(['first-parallel-unit', 'second-parallel-unit']);
  });
});
