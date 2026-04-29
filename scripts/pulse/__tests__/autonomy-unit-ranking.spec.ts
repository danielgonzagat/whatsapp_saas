import { describe, expect, it } from 'vitest';

import {
  buildRuntimeRealityQueueInfluence,
  buildRuntimeRealityUnitMetadata,
  buildStructuralQueueInfluence,
  getPreferredAutomationSafeUnits,
} from '../autonomy-loop.unit-ranking';
import type { PulseAutonomousDirectiveUnit } from '../autonomy-loop.types';
import type { RuntimeSignal } from '../types.runtime-fusion';
import type { FalsePositiveAdjudicationState } from '../types.false-positive-adjudicator';
import type { StructuralMemoryState } from '../types.structural-memory';

function makeUnit(overrides: Partial<PulseAutonomousDirectiveUnit>): PulseAutonomousDirectiveUnit {
  return {
    id: overrides.id ?? 'unit',
    kind: overrides.kind ?? 'static',
    priority: overrides.priority ?? 'P1',
    source: overrides.source ?? 'test',
    executionMode: overrides.executionMode ?? 'ai_safe',
    riskLevel: overrides.riskLevel ?? 'medium',
    evidenceMode: overrides.evidenceMode ?? 'inferred',
    confidence: overrides.confidence ?? 'high',
    productImpact: overrides.productImpact ?? 'diagnostic',
    ownerLane: overrides.ownerLane ?? 'platform',
    title: overrides.title ?? 'Unit',
    summary: overrides.summary ?? 'Test unit',
    affectedCapabilities: overrides.affectedCapabilities ?? [],
    affectedFlows: overrides.affectedFlows ?? [],
    validationTargets: overrides.validationTargets ?? [],
    ...overrides,
  };
}

describe('autonomy unit ranking', () => {
  it('prioritizes runtime reality over static scope work in final selection', () => {
    const staticUnit = makeUnit({
      id: 'scope-static',
      kind: 'scope',
      priority: 'P1',
      title: 'Static scope parity',
    });
    const runtimeUnit = makeUnit({
      id: 'runtime-sentry',
      kind: 'runtime',
      priority: 'P1',
      title: 'Runtime Sentry pressure',
    });

    const ranked = getPreferredAutomationSafeUnits(
      {
        nextAutonomousUnits: [staticUnit, runtimeUnit],
      },
      'balanced',
      null,
    );

    expect(ranked.map((unit) => unit.id)).toEqual(['runtime-sentry', 'scope-static']);
  });

  it('uses structural memory to promote repeated failures into autonomous validation work', () => {
    const normalUnit = makeUnit({
      id: 'normal-unit',
      kind: 'scenario',
      priority: 'P1',
      title: 'Normal unit',
    });
    const repeatedFailureUnit = makeUnit({
      id: 'repeated-failure-unit',
      kind: 'scope',
      priority: 'P1',
      title: 'Repeated failure unit',
    });
    const memory: StructuralMemoryState = {
      generatedAt: '2026-04-29T00:00:00.000Z',
      summary: {
        totalUnits: 1,
        activeUnits: 0,
        escalatedValidationUnits: 1,
        resolvedUnits: 0,
        falsePositives: 0,
        learnedStrategies: 0,
      },
      units: [
        {
          unitId: 'repeated-failure-unit',
          attempts: 3,
          lastAttempt: '2026-04-29T00:00:00.000Z',
          failedStrategies: ['normal_deterministic'],
          successfulStrategies: [],
          lastFailure: '2026-04-29T00:00:00.000Z',
          repeatedFailures: 3,
          status: 'escalated_validation',
          recommendedStrategy: 'governed_sandbox',
          falsePositive: false,
          fpProof: null,
        },
      ],
      learnedPatterns: [],
    };

    const ranked = getPreferredAutomationSafeUnits(
      { nextAutonomousUnits: [normalUnit, repeatedFailureUnit] },
      'balanced',
      null,
      buildStructuralQueueInfluence(memory, null),
    );

    expect(ranked.map((unit) => unit.id)).toEqual(['repeated-failure-unit', 'normal-unit']);
  });

  it('removes false positives and deprioritizes accepted risks without domain allowlists', () => {
    const falsePositiveUnit = makeUnit({
      id: 'fp-unit',
      kind: 'scenario',
      priority: 'P0',
      title: 'False positive unit',
      affectedCapabilities: ['opaque-capability'],
    });
    const acceptedRiskUnit = makeUnit({
      id: 'risk-unit',
      kind: 'scenario',
      priority: 'P0',
      title: 'Accepted risk unit',
      relatedFiles: ['backend/src/opaque-risk.ts'],
    });
    const cleanUnit = makeUnit({
      id: 'clean-unit',
      kind: 'scenario',
      priority: 'P1',
      title: 'Clean unit',
    });
    const adjudication: FalsePositiveAdjudicationState = {
      generatedAt: '2026-04-29T00:00:00.000Z',
      summary: {
        totalFindings: 2,
        open: 0,
        confirmed: 0,
        fixed: 0,
        falsePositives: 1,
        acceptedRisks: 1,
        expiredSuppressions: 0,
        precision: 0,
      },
      findings: [
        {
          findingId: 'fp',
          title: 'Opaque false positive',
          source: 'pulse',
          status: 'false_positive',
          severity: 'high',
          filePath: 'backend/src/opaque-capability.ts',
          line: 1,
          capabilityId: 'opaque-capability',
          proof: 'Observed checker noise against non-runtime evidence.',
          expiresOnFileChange: true,
          fileHashAtSuppression: 'hash',
          suppressedAt: '2026-04-29T00:00:00.000Z',
          lastChecked: '2026-04-29T00:00:00.000Z',
        },
        {
          findingId: 'risk',
          title: 'Opaque accepted risk',
          source: 'pulse',
          status: 'accepted_risk',
          severity: 'medium',
          filePath: 'backend/src/opaque-risk.ts',
          line: 2,
          capabilityId: null,
          proof: 'Risk accepted until runtime evidence changes.',
          expiresOnFileChange: true,
          fileHashAtSuppression: 'hash',
          suppressedAt: '2026-04-29T00:00:00.000Z',
          lastChecked: '2026-04-29T00:00:00.000Z',
        },
      ],
    };

    const ranked = getPreferredAutomationSafeUnits(
      { nextAutonomousUnits: [falsePositiveUnit, acceptedRiskUnit, cleanUnit] },
      'balanced',
      null,
      buildStructuralQueueInfluence(null, adjudication),
    );

    expect(ranked.map((unit) => unit.id)).toEqual(['clean-unit', 'risk-unit']);
  });

  it('uses runtime-fusion metadata to rank observed runtime reality ahead of static findings', () => {
    const staticUnit = makeUnit({
      id: 'static-unit',
      kind: 'static',
      priority: 'P0',
      title: 'Static hotspot',
      affectedCapabilities: ['capability:opaque'],
    });
    const runtimeUnit = makeUnit({
      id: 'runtime-unit',
      kind: 'runtime',
      priority: 'P1',
      title: 'Runtime incident',
      affectedCapabilities: ['capability:opaque'],
      affectedFlows: ['flow:opaque'],
    });
    const signals: RuntimeSignal[] = [
      {
        id: 'static-signal',
        source: 'codacy',
        type: 'static',
        severity: 'critical',
        action: 'prioritize_fix',
        message: 'Opaque static finding.',
        affectedCapabilityIds: ['capability:opaque'],
        affectedFlowIds: [],
        affectedFilePaths: [],
        frequency: 1,
        affectedUsers: 0,
        impactScore: 1,
        confidence: 1,
        evidenceKind: 'static',
        firstSeen: '2026-04-29T00:00:00.000Z',
        lastSeen: '2026-04-29T00:00:00.000Z',
        count: 1,
        trend: 'unknown',
        pinned: false,
        evidenceMode: 'observed',
        affectedCapabilities: ['capability:opaque'],
        affectedFlows: [],
      },
      {
        id: 'runtime-signal',
        source: 'sentry',
        type: 'runtime',
        severity: 'high',
        action: 'prioritize_fix',
        message: 'Opaque runtime failure.',
        affectedCapabilityIds: ['capability:opaque'],
        affectedFlowIds: ['flow:opaque'],
        affectedFilePaths: [],
        frequency: 1,
        affectedUsers: 0,
        impactScore: 0.55,
        confidence: 0.8,
        evidenceKind: 'runtime',
        firstSeen: '2026-04-29T00:00:00.000Z',
        lastSeen: '2026-04-29T00:00:00.000Z',
        count: 1,
        trend: 'unknown',
        pinned: false,
        evidenceMode: 'observed',
        affectedCapabilities: ['capability:opaque'],
        affectedFlows: ['flow:opaque'],
      },
    ];

    const metadata = buildRuntimeRealityUnitMetadata([staticUnit, runtimeUnit], signals);
    expect(metadata.find((entry) => entry.unitId === 'runtime-unit')).toMatchObject({
      primarySignalId: 'runtime-signal',
      primaryEvidenceKind: 'runtime',
      primarySource: 'sentry',
      affectedCapabilities: ['capability:opaque'],
      affectedFlows: ['flow:opaque'],
    });

    const ranked = getPreferredAutomationSafeUnits(
      { nextAutonomousUnits: [staticUnit, runtimeUnit] },
      'balanced',
      null,
      buildRuntimeRealityQueueInfluence(
        { nextAutonomousUnits: [staticUnit, runtimeUnit] },
        {
          generatedAt: '2026-04-29T00:00:00.000Z',
          signals,
          summary: {
            totalSignals: 2,
            criticalSignals: 1,
            highSignals: 1,
            blockMergeSignals: 0,
            blockDeploySignals: 0,
            sourceCounts: {
              github: 0,
              sentry: 1,
              datadog: 0,
              prometheus: 0,
              github_actions: 0,
              codacy: 1,
              codecov: 0,
              dependabot: 0,
              gitnexus: 0,
              otel_runtime: 0,
            },
            signalsByCapability: { 'capability:opaque': 2 },
            signalsByFlow: { 'flow:opaque': 1 },
            topImpactCapabilities: [{ capabilityId: 'capability:opaque', impactScore: 1.55 }],
            topImpactFlows: [{ flowId: 'flow:opaque', impactScore: 0.55 }],
          },
          evidence: {
            externalSignalState: {
              status: 'observed',
              artifactPath: 'PULSE_EXTERNAL_SIGNAL_STATE.json',
              totalSignals: 2,
              observedSignals: 2,
              inferredSignals: 0,
              adapterStatusCounts: {},
              notAvailableAdapters: [],
              skippedAdapters: [],
              staleAdapters: [],
              invalidAdapters: [],
              reason: 'test',
            },
            runtimeTraces: {
              status: 'observed',
              artifactPath: 'PULSE_RUNTIME_TRACES.json',
              source: 'test',
              totalTraces: 0,
              totalSpans: 0,
              errorTraces: 0,
              derivedSignals: 0,
              reason: 'test',
            },
          },
          priorityOverrides: [],
        },
      ),
    );

    expect(ranked.map((unit) => unit.id)).toEqual(['runtime-unit', 'static-unit']);
  });
});
