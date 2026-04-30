import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildProofSynthesisState, synthesizeProofPlans } from '../proof-synthesis';
import type { ProofSynthesisInput, ProofSynthesisPlanType } from '../proof-synthesis';

function input(overrides: Partial<ProofSynthesisInput> = {}): ProofSynthesisInput {
  return {
    id: 'target:opaque',
    name: 'opaque target',
    filePath: 'scripts/pulse/opaque.ts',
    behaviorKind: 'function_definition',
    ...overrides,
  };
}

function proofTypes(targetInput: ProofSynthesisInput): ProofSynthesisPlanType[] {
  return synthesizeProofPlans(targetInput).plans.map((plan) => plan.proofType);
}

describe('proof synthesis compiler', () => {
  it('maps discovered evidence kinds to planned proof engines without marking observed', () => {
    const cases: Array<[ProofSynthesisInput, ProofSynthesisPlanType[]]> = [
      [input({ id: 'pure', sourceKind: 'pure_function' }), ['property']],
      [
        input({
          id: 'endpoint',
          sourceKind: 'endpoint',
          routePattern: '/opaque',
          httpMethod: 'POST',
        }),
        ['api_probe', 'fuzz'],
      ],
      [input({ id: 'ui', sourceKind: 'ui_action' }), ['playwright']],
      [input({ id: 'worker', sourceKind: 'worker' }), ['queue_fixture']],
      [input({ id: 'webhook', sourceKind: 'webhook' }), ['replay']],
      [input({ id: 'state', sourceKind: 'state_mutation' }), ['before_after']],
    ];

    for (const [targetInput, expectedProofTypes] of cases) {
      const target = synthesizeProofPlans(targetInput);
      expect(proofTypes(targetInput)).toEqual(expectedProofTypes);
      expect(target.plans.length).toBeGreaterThan(0);
      expect(target.plans.every((plan) => plan.executionReality === 'planned')).toBe(true);
      expect(target.plans.every((plan) => plan.observed === false)).toBe(true);
      expect(target.plans.every((plan) => plan.countsAsObserved === false)).toBe(true);
      expect(target.plans.every((plan) => plan.validationTarget.targetId === targetInput.id)).toBe(
        true,
      );
      expect(target.plans.every((plan) => plan.validationTarget.command.length > 0)).toBe(true);
    }
  });

  it('adds before-after proof when an endpoint also mutates state', () => {
    const target = synthesizeProofPlans(
      input({
        id: 'mutating-endpoint',
        sourceKind: 'endpoint',
        routePattern: '/opaque/:id',
        httpMethod: 'PATCH',
        stateMutation: true,
      }),
    );

    expect(target.plans.map((plan) => plan.proofType)).toEqual([
      'api_probe',
      'fuzz',
      'before_after',
    ]);
  });

  it('emits a planned proof plan for every behavior/path gap artifact entry', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-proof-synthesis-'));
    const pulseDir = path.join(rootDir, '.pulse', 'current');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_BEHAVIOR_GRAPH.json'),
      JSON.stringify({
        nodes: [
          {
            id: 'behavior:pure',
            kind: 'validation',
            name: 'validateOpaque',
            filePath: 'backend/src/opaque.util.ts',
            line: 1,
            parentFunctionId: null,
            inputs: [],
            outputs: [],
            stateAccess: [],
            externalCalls: [],
            risk: 'low',
            executionMode: 'ai_safe',
            calledBy: [],
            calls: [],
            isAsync: false,
            hasErrorHandler: true,
            hasLogging: false,
            hasMetrics: false,
            hasTracing: false,
            decorators: [],
            docComment: null,
          },
          {
            id: 'behavior:state',
            kind: 'db_writer',
            name: 'writeOpaque',
            filePath: 'backend/src/opaque.service.ts',
            line: 1,
            parentFunctionId: null,
            inputs: [],
            outputs: [{ kind: 'db_write', target: 'Opaque', type: 'Opaque', conditional: false }],
            stateAccess: [
              {
                model: 'Opaque',
                operation: 'update',
                fieldPaths: ['status'],
                whereClause: 'id',
              },
            ],
            externalCalls: [],
            risk: 'high',
            executionMode: 'ai_safe',
            calledBy: [],
            calls: [],
            isAsync: true,
            hasErrorHandler: true,
            hasLogging: true,
            hasMetrics: false,
            hasTracing: false,
            decorators: [],
            docComment: null,
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_EXECUTION_MATRIX.json'),
      JSON.stringify({
        paths: [
          {
            pathId: 'matrix:path:api',
            capabilityId: null,
            flowId: null,
            source: 'execution_chain',
            entrypoint: {
              nodeId: 'node:api',
              filePath: 'backend/src/opaque.controller.ts',
              routePattern: '/opaque',
              description: 'Opaque endpoint',
            },
            chain: [],
            status: 'inferred_only',
            truthMode: 'inferred',
            productStatus: null,
            breakpoint: null,
            requiredEvidence: [],
            observedEvidence: [],
            validationCommand: 'node scripts/pulse/run.js --guidance',
            risk: 'high',
            executionMode: 'ai_safe',
            confidence: 1,
            filePaths: ['backend/src/opaque.controller.ts'],
            routePatterns: ['/opaque'],
          },
        ],
      }),
    );

    const state = buildProofSynthesisState(rootDir);

    expect(state.summary).toMatchObject({
      totalTargets: 3,
      observedPlans: 0,
      targetsWithoutPlan: 0,
    });
    expect(state.summary.plannedPlans).toBe(state.summary.totalPlans);
    expect(state.targets.every((target) => target.plans.length > 0)).toBe(true);
    expect(
      state.targets
        .flatMap((target) => target.plans)
        .every((plan) => plan.executionReality === 'planned'),
    ).toBe(true);
    expect(fs.existsSync(path.join(pulseDir, 'PULSE_PROOF_SYNTHESIS.json'))).toBe(true);
  });
});
