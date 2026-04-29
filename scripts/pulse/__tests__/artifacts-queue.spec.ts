import { describe, expect, it } from 'vitest';

import {
  buildAutonomyQueue,
  normalizeArtifactExecutionMode,
  normalizeArtifactStatus,
  normalizeCanonicalArtifactValue,
} from '../artifacts.queue';
import type { PulseConvergencePlan } from '../types';

type QueueUnit = PulseConvergencePlan['queue'][number];

function stringifyArtifact(value: unknown): string {
  return JSON.stringify(value);
}

function makeQueueUnit(overrides: Partial<QueueUnit>): QueueUnit {
  return {
    order: overrides.order ?? 1,
    id: overrides.id ?? 'unit',
    kind: overrides.kind ?? 'scope',
    priority: overrides.priority ?? 'P1',
    status: overrides.status ?? 'open',
    source: overrides.source ?? 'scope',
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
    failureClass: overrides.failureClass ?? 'unknown',
    actorKinds: overrides.actorKinds ?? [],
    gateNames: overrides.gateNames ?? [],
    scenarioIds: overrides.scenarioIds ?? [],
    moduleKeys: overrides.moduleKeys ?? [],
    routePatterns: overrides.routePatterns ?? [],
    flowIds: overrides.flowIds ?? [],
    affectedCapabilityIds: overrides.affectedCapabilityIds ?? [],
    affectedFlowIds: overrides.affectedFlowIds ?? [],
    asyncExpectations: overrides.asyncExpectations ?? [],
    breakTypes: overrides.breakTypes ?? [],
    artifactPaths: overrides.artifactPaths ?? [],
    relatedFiles: overrides.relatedFiles ?? [],
    validationArtifacts: overrides.validationArtifacts ?? [],
    expectedGateShift: overrides.expectedGateShift ?? '',
    exitCriteria: overrides.exitCriteria ?? [],
    ...overrides,
  };
}

describe('buildAutonomyQueue', () => {
  it('normalizes legacy human-required artifact states into observation-only governance evidence', () => {
    expect(normalizeArtifactExecutionMode('human_required')).toBe('observation_only');
    expect(normalizeArtifactStatus('blocked_human_required')).toBe('observation_only');
    const normalized = normalizeCanonicalArtifactValue({
      blockedHumanRequired: 1,
      humanRequiredSignals: 3,
      humanRequiredUnits: 2,
      nested: {
        human_required: 'Human approval required for human required protected validation.',
      },
      queue: [
        {
          executionMode: 'human_required',
          status: 'blocked_human_required',
          summary: 'human approval required',
        },
      ],
      summary: 'Human approval required for human_required governance validation.',
    });

    expect(normalized).toEqual({
      governedValidationSignals: 3,
      governedValidationUnits: 2,
      nested: {
        observation_only:
          'Governed autonomous validation required for observation-only protected validation.',
      },
      observationOnlyRequired: 1,
      queue: [
        {
          executionMode: 'observation_only',
          status: 'observation_only',
          summary: 'governed autonomous validation required',
        },
      ],
      summary:
        'Governed autonomous validation required for observation_only governance validation.',
    });
    expect(stringifyArtifact(normalized)).not.toMatch(
      /human_required|blocked_human_required|humanRequired|blockedHuman|Human approval|human approval|human required/i,
    );
  });

  it('merges legacy and canonical governed-validation counters into clean artifact keys', () => {
    const normalized = normalizeCanonicalArtifactValue({
      blockedHumanRequired: 3,
      governedValidationUnits: 5,
      humanRequiredUnits: 2,
      observationOnlyRequired: 1,
    });

    expect(normalized).toEqual({
      governedValidationUnits: 7,
      observationOnlyRequired: 4,
    });
    expect(stringifyArtifact(normalized)).not.toMatch(/humanRequired|blockedHuman/i);
  });

  it('keeps non-ai-safe legacy work out of the autonomy queue', () => {
    const autonomous = makeQueueUnit({
      id: 'autonomous-unit',
      order: 2,
      kind: 'runtime',
      executionMode: 'ai_safe',
    });
    const legacyHuman = makeQueueUnit({
      id: 'legacy-human-unit',
      order: 1,
      kind: 'runtime',
      executionMode: 'human_required',
    });
    const observationOnly = makeQueueUnit({
      id: 'observation-unit',
      order: 3,
      kind: 'runtime',
      executionMode: 'observation_only',
    });

    const queue = buildAutonomyQueue({
      generatedAt: '2026-04-28T00:00:00.000Z',
      commitSha: 'abc123',
      status: 'PARTIAL',
      humanReplacementStatus: 'NOT_READY',
      blockingTier: 2,
      summary: {
        totalUnits: 3,
        scenarioUnits: 0,
        securityUnits: 0,
        staticUnits: 0,
        runtimeUnits: 3,
        changeUnits: 0,
        dependencyUnits: 0,
        scopeUnits: 0,
        gateUnits: 0,
        humanRequiredUnits: 2,
        observationOnlyUnits: 1,
        priorities: { P0: 0, P1: 3, P2: 0, P3: 0 },
        failingGates: [],
        pendingAsyncExpectations: [],
      },
      queue: [legacyHuman, autonomous, observationOnly],
    });

    expect(queue.map((unit) => unit.id)).toEqual(['autonomous-unit']);
  });

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
      commitSha: 'abc123',
      status: 'PARTIAL',
      humanReplacementStatus: 'NOT_READY',
      blockingTier: 2,
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
        priorities: { P0: 0, P1: 2, P2: 0, P3: 0 },
        failingGates: [],
        pendingAsyncExpectations: [],
      },
      queue: [scopeUnit, runtimeUnit],
    });

    expect(queue.map((unit) => unit.id)).toEqual(['runtime-unit', 'scope-unit']);
  });
});
