import { describe, expect, it } from 'vitest';

import { buildAutonomyQueue } from '../artifacts.queue';
import type { PulseConvergencePlan } from '../types';

type QueueUnit = PulseConvergencePlan['queue'][number];

function makeQueueUnit(overrides: Partial<QueueUnit>): QueueUnit {
  return {
    order: overrides.order ?? 1,
    id: overrides.id ?? 'unit',
    kind: overrides.kind ?? 'scope',
    priority: overrides.priority ?? 'P1',
    source: overrides.source ?? 'test',
    title: overrides.title ?? 'Unit',
    summary: overrides.summary ?? 'Test unit',
    visionDelta: overrides.visionDelta ?? 'test',
    targetState: overrides.targetState ?? 'test',
    executionMode: overrides.executionMode ?? 'ai_safe',
    riskLevel: overrides.riskLevel ?? 'medium',
    evidenceMode: overrides.evidenceMode ?? 'inferred',
    confidence: overrides.confidence ?? 'high',
    productImpact: overrides.productImpact ?? 'material',
    ownerLane: overrides.ownerLane ?? 'platform',
    affectedCapabilityIds: overrides.affectedCapabilityIds ?? [],
    affectedFlowIds: overrides.affectedFlowIds ?? [],
    relatedFiles: overrides.relatedFiles ?? [],
    validationArtifacts: overrides.validationArtifacts ?? [],
    gateNames: overrides.gateNames ?? [],
    scenarioIds: overrides.scenarioIds ?? [],
    expectedGateShift: overrides.expectedGateShift ?? {},
    exitCriteria: overrides.exitCriteria ?? [],
    ...overrides,
  };
}

describe('buildAutonomyQueue', () => {
  it('keeps runtime work ahead of static/scope work in generated directives', () => {
    const scopeUnit = makeQueueUnit({
      order: 1,
      id: 'scope-unit',
      kind: 'scope',
      priority: 'P1',
      productImpact: 'transformational',
    });
    const runtimeUnit = makeQueueUnit({
      order: 2,
      id: 'runtime-unit',
      kind: 'runtime',
      priority: 'P1',
      productImpact: 'diagnostic',
    });

    const queue = buildAutonomyQueue({
      generatedAt: '2026-04-28T00:00:00.000Z',
      summary: {
        totalUnits: 2,
        scenarioUnits: 0,
        securityUnits: 0,
        staticUnits: 0,
        runtimeUnits: 1,
        changeUnits: 0,
        dependencyUnits: 0,
        scopeUnits: 1,
        gateUnits: 0,
        humanRequiredUnits: 0,
        observationOnlyUnits: 0,
        priorityCounts: { P0: 0, P1: 2, P2: 0, P3: 0 },
        topCapabilities: [],
        topFlows: [],
      },
      queue: [scopeUnit, runtimeUnit],
    });

    expect(queue.map((unit) => unit.id)).toEqual(['runtime-unit', 'scope-unit']);
  });
});
