import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ROUTE_NOISE_TOKENS } from '../../codebase-truth.tokens';
import { isUserFacingGroup } from '../../codebase-truth.string-utils';
import { isLikelyMutation } from '../../codebase-truth-flows';
import { buildScenarioCatalog } from '../../scenario-engine';
import { deriveUnitValue, deriveZeroValue } from '../../dynamic-reality-kernel';

import type { PulseConfig, PulseProductGraph } from '../../types';

import { interactionChain, pulseCapability } from './helpers.spec';

describe('PULSE no-hardcoded-reality contracts', () => {
  it('does not treat product route names as codebase-truth control tokens', () => {
    expect(ROUTE_NOISE_TOKENS.has('checkout')).toBe(false);
    expect(ROUTE_NOISE_TOKENS.has('auth')).toBe(false);
    expect(isUserFacingGroup('checkout')).toBe(false);
    expect(isUserFacingGroup('public')).toBe(true);
  });

  it('detects likely UI mutations from method and generic verbs instead of product words', () => {
    expect(
      isLikelyMutation(
        interactionChain({
          elementLabel: 'Pay now',
          apiCall: { endpoint: '/checkout', method: 'GET', file: 'api.ts', line: 1 },
        }),
      ),
    ).toBe(false);

    expect(
      isLikelyMutation(
        interactionChain({
          elementLabel: 'Submit',
          apiCall: { endpoint: '/opaque', method: 'GET', file: 'api.ts', line: 1 },
        }),
      ),
    ).toBe(true);

    expect(
      isLikelyMutation(
        interactionChain({
          elementLabel: 'Open',
          apiCall: { endpoint: '/opaque', method: 'POST', file: 'api.ts', line: 1 },
        }),
      ),
    ).toBe(true);
  });

  it('builds scenario catalog from arbitrary product graph surfaces instead of fixed domains', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scenario-dynamic-'));
    const pulseDir = path.join(rootDir, '.pulse', 'current');
    fs.mkdirSync(pulseDir, { recursive: true });

    const graph: PulseProductGraph = {
      surfaces: [
        {
          id: 'xpto',
          name: 'Xpto',
          description: 'Opaque discovered surface',
          artifactIds: [],
          capabilities: ['cap-xpto'],
          completeness: 0.5,
          truthMode: 'observed',
        },
      ],
      capabilities: [
        {
          id: 'cap-xpto',
          name: 'Opaque Capability',
          surfaceId: 'xpto',
          artifactIds: [],
          flowIds: ['flow-xpto'],
          maturityScore: 0.5,
          truthMode: 'observed',
          criticality: 'must_have',
          blockers: [],
        },
      ],
      flows: [
        {
          id: 'flow-xpto',
          name: 'Opaque Flow',
          entryCapability: 'cap-xpto',
          capabilities: ['cap-xpto'],
          completeness: 0.5,
          truthMode: 'observed',
          blockers: [],
        },
      ],
      orphanedArtifactIds: [],
      phantomCapabilities: [],
      latentCapabilities: [],
    };

    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_PRODUCT_GRAPH.json'),
      JSON.stringify(graph, null, 2),
    );
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_BEHAVIOR_GRAPH.json'),
      JSON.stringify({
        generatedAt: '2026-04-29T00:00:00.000Z',
        summary: {
          totalNodes: deriveUnitValue(),
          handlerNodes: deriveZeroValue(),
          apiEndpointNodes: deriveUnitValue(),
          queueNodes: deriveZeroValue(),
          cronNodes: deriveZeroValue(),
          webhookNodes: deriveZeroValue(),
          dbNodes: deriveZeroValue(),
          externalCallNodes: deriveZeroValue(),
          aiSafeNodes: deriveUnitValue(),
          humanRequiredNodes: deriveZeroValue(),
          nodesWithErrorHandler: deriveZeroValue(),
          nodesWithLogging: deriveZeroValue(),
          nodesWithMetrics: deriveZeroValue(),
          criticalRiskNodes: deriveZeroValue(),
        },
        nodes: [
          {
            id: 'node:xpto',
            kind: 'api_endpoint',
            name: 'XptoController.create',
            filePath: 'backend/src/xpto/xpto.controller.ts',
            line: 1,
            parentFunctionId: null,
            inputs: [
              {
                kind: 'body',
                name: 'opaqueField',
                type: 'string',
                required: true,
                validated: true,
                source: 'dto',
              },
            ],
            outputs: [{ kind: 'db_write', target: 'Opaque', type: 'create', conditional: false }],
            stateAccess: [],
            externalCalls: [],
            risk: 'medium',
            executionMode: 'ai_safe',
            calledBy: [],
            calls: [],
            isAsync: false,
            hasErrorHandler: false,
            hasLogging: false,
            hasMetrics: false,
            hasTracing: false,
            decorators: ['Post'],
            docComment: null,
          },
        ],
        orphanNodes: [],
        unreachableNodes: [],
      }),
    );

    const state = buildScenarioCatalog(rootDir);

    expect(state.scenarios).toHaveLength(1);
    expect(state.scenarios[0].id).toBe('flow-xpto');
    expect(state.scenarios[0].flowId).toBe('xpto/flow-xpto');
    expect(state.scenarios[0].role).toBe('anonymous');
    expect(state.scenarios[0].steps.map((step) => step.kind)).toContain('api_call');
    expect(state.scenarios[0].steps.some((step) => step.target.includes('opaqueField'))).toBe(true);
  });
});
