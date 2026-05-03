import { describe, expect, it } from 'vitest';
import {
  evaluateBreakpointPrecisionGate,
  evaluateCriticalPathObservedGate,
  evaluateExecutionMatrixCompleteGate,
} from '../cert-gate-execution-matrix';
import { buildMatrix } from './__parts__/execution-matrix.helpers';
import {
  generatedAt,
  makeActorEvidence,
  makeCapability,
  makeChain,
  makeEvidence,
  makeFlow,
} from './__parts__/execution-matrix.fixtures';
import './__parts__/execution-matrix.cases';
describe('buildExecutionMatrix', () => {
  it('maps a chain to capability and flow through node and capability ids', () => {
    const matrix = buildMatrix({});
    expect(matrix.summary.totalPaths).toBe(1);
    expect(matrix.paths[0].capabilityId).toBe('checkout-capability');
    expect(matrix.paths[0].flowId).toBe('checkout-flow');
  });
  it('keeps structural paths terminally reasoned when no executed evidence exists', () => {
    const matrix = buildMatrix({});
    expect(matrix.paths[0].status).toBe('inferred_only');
    expect(matrix.paths[0].truthMode).toBe('inferred');
    expect(matrix.paths[0].breakpoint?.reason).toContain('lacks observed runtime');
    expect(matrix.summary.criticalUnobservedPaths).toBe(0);
  });
  it('marks a matching executed passing flow as observed_pass', () => {
    const evidence = makeEvidence({
      flows: {
        declared: ['checkout-flow'],
        executed: ['checkout-flow'],
        missing: [],
        passed: ['checkout-flow'],
        failed: [],
        accepted: [],
        artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
        summary: 'checkout-flow passed',
        results: [
          {
            flowId: 'checkout-flow',
            status: 'passed',
            executed: true,
            accepted: false,
            summary: 'checkout-flow passed',
            artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(matrix.paths[0].status).toBe('observed_pass');
    expect(matrix.paths[0].truthMode).toBe('observed');
  });
  it('promotes matching actor route evidence to observed_pass', () => {
    const evidence = makeEvidence({
      customer: {
        ...makeActorEvidence('customer'),
        executed: ['customer-checkout'],
        passed: ['customer-checkout'],
        summary: 'customer checkout passed',
        results: [
          {
            scenarioId: 'customer-checkout',
            actorKind: 'customer',
            scenarioKind: 'single-session',
            critical: true,
            requested: true,
            runner: 'derived',
            status: 'passed',
            executed: true,
            truthMode: 'observed',
            summary: 'checkout scenario passed',
            artifactPaths: ['PULSE_SCENARIO_EVIDENCE.json'],
            specsExecuted: ['checkout.spec.ts'],
            durationMs: 100,
            worldStateTouches: ['order'],
            moduleKeys: ['checkout'],
            routePatterns: ['/api/checkout'],
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(matrix.paths[0].status).toBe('observed_pass');
    expect(matrix.paths[0].observedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'actor',
          artifactPath: 'PULSE_SCENARIO_EVIDENCE.json',
          status: 'passed',
        }),
      ]),
    );
  });
  it('keeps customer synthetic missing evidence as machine proof debt instead of observed product capability', () => {
    const evidence = makeEvidence({
      customer: {
        ...makeActorEvidence('customer'),
        missing: ['customer-checkout'],
        summary: 'customer checkout missing runtime observation',
        results: [
          {
            scenarioId: 'customer-checkout',
            actorKind: 'customer',
            scenarioKind: 'single-session',
            critical: true,
            requested: true,
            runner: 'derived',
            status: 'missing_evidence',
            executed: false,
            truthMode: 'observed-from-disk',
            summary: 'customer checkout synthetic missing evidence',
            artifactPaths: ['PULSE_SCENARIO_EVIDENCE.json'],
            specsExecuted: [],
            durationMs: 0,
            worldStateTouches: [],
            moduleKeys: ['checkout'],
            routePatterns: ['/api/checkout'],
            machineWork: {
              kind: 'pulse_machine_proof_debt',
              blueprint: 'Generate or run the customer scenario blueprint for customer-checkout.',
              requiredValidation: [
                'scenario_blueprint_generated',
                'scenario_runtime_execution_attempted_or_classified',
                'terminal_proof_reason_recorded',
              ],
              terminalProofReason:
                'customer synthetic scenario customer-checkout has no runtime-observed terminal proof; this is PULSE machine work, not product capability evidence.',
              actionable: true,
            },
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });

    expect(matrix.paths[0].status).toBe('inferred_only');
    expect(matrix.paths[0].truthMode).toBe('inferred');
    expect(matrix.paths[0].observedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'actor',
          executed: false,
          status: 'missing',
          summary: expect.stringContaining('PULSE machine work'),
        }),
      ]),
    );
    expect(matrix.paths[0].breakpoint?.reason).toContain('PULSE machine work');
    expect(matrix.paths[0].breakpoint?.recovery).toContain('Execute or classify');
  });
  it('keeps inferred critical paths explainable with a concrete missing evidence breakpoint', () => {
    const matrix = buildMatrix({});
    expect(matrix.paths[0].status).toBe('inferred_only');
    expect(matrix.paths[0].breakpoint?.reason).toContain('lacks observed runtime');
    expect(matrix.paths[0].breakpoint?.recovery).toContain('matching runtime');
  });
  it('keeps not-executable critical capabilities terminally explainable', () => {
    const matrix = buildMatrix({
      chains: [],
      capability: makeCapability({
        routePatterns: [],
        nodeIds: [],
      }),
      flow: makeFlow({
        routePatterns: [],
        startNodeIds: [],
        endNodeIds: [],
      }),
      structuralGraph: {
        generatedAt,
        summary: {
          totalNodes: 0,
          totalEdges: 0,
          roleCounts: {
            interface: 0,
            orchestration: 0,
            persistence: 0,
            side_effect: 0,
            simulation: 0,
          },
          interfaceChains: 0,
          completeChains: 0,
          partialChains: 0,
          simulatedChains: 0,
        },
        nodes: [],
        edges: [],
      },
    });
    const capabilityPath = matrix.paths.find((path) => path.source === 'capability');
    expect(capabilityPath?.status).toBe('not_executable');
    expect(capabilityPath?.breakpoint?.reason).toContain('no executable chain');
    expect(matrix.summary.criticalUnobservedPaths).toBe(0);
  });
  it('marks a matching executed failing flow as observed_fail with breakpoint', () => {
    const evidence = makeEvidence({
      flows: {
        declared: ['checkout-flow'],
        executed: ['checkout-flow'],
        missing: [],
        passed: [],
        failed: ['checkout-flow'],
        accepted: [],
        artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
        summary: 'checkout-flow failed',
        results: [
          {
            flowId: 'checkout-flow',
            status: 'failed',
            executed: true,
            accepted: false,
            failureClass: 'product_failure',
            summary: 'checkout endpoint returned 500',
            artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(matrix.paths[0].status).toBe('observed_fail');
    expect(matrix.paths[0].breakpoint?.reason).toContain('500');
    expect(matrix.summary.impreciseBreakpoints).toBe(0);
  });
  it('maps matching browser failure evidence to an observed failure breakpoint', () => {
    const evidence = makeEvidence({
      browser: {
        attempted: true,
        executed: true,
        artifactPaths: ['PULSE_BROWSER_EVIDENCE.json'],
        summary: 'Playwright route /api/checkout returned 500 in checkout-flow',
        failureCode: 'ok',
        totalPages: 1,
        totalTested: 1,
        passRate: 0,
        blockingInteractions: 1,
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(matrix.paths[0].status).toBe('observed_fail');
    expect(matrix.paths[0].observedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'browser',
          status: 'failed',
        }),
      ]),
    );
    expect(matrix.paths[0].breakpoint?.routePattern).toBe('/api/checkout');
    expect(matrix.summary.impreciseBreakpoints).toBe(0);
  });
  it('includes conditional branch steps and files in the chain path', () => {
    const matrix = buildMatrix({
      chain: makeChain({
        conditionalBranches: [
          {
            condition: 'async fulfillment',
            steps: [
              {
                id: 'worker:checkout:step2',
                role: 'worker',
                nodeId: 'worker:checkout',
                description: 'checkout worker',
                truthMode: 'inferred',
                filesInvolved: ['worker/checkout.worker.ts'],
                modelsInvolved: [],
                providersInvolved: [],
              },
            ],
          },
        ],
      }),
    });
    expect(matrix.paths[0].chain.map((step) => step.nodeId)).toContain('worker:checkout');
    expect(matrix.paths[0].filePaths).toContain('worker/checkout.worker.ts');
  });
  it('summarizes paths by source and terminal status for gates', () => {
    const matrix = buildMatrix({});
    expect(matrix.summary.bySource.execution_chain).toBe(1);
    expect(matrix.summary.byStatus.inferred_only).toBe(1);
    expect(matrix.summary.terminalPaths).toBe(matrix.summary.totalPaths);
    expect(matrix.summary.nonTerminalPaths).toBe(0);
    expect(matrix.summary.unknownPaths).toBe(0);
  });
  it('passes matrix completeness but fails critical observation when only terminal proof blueprints exist', () => {
    const matrix = buildMatrix({});
    const path = matrix.paths[0];

    expect(path.risk).toBe('high');
    expect(path.executionMode).toBe('governed_validation');
    expect(path.requiredEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'integration', required: true }),
        expect.objectContaining({ kind: 'e2e', required: true }),
        expect.objectContaining({ kind: 'runtime', required: true }),
      ]),
    );
    expect(path.observedEvidence).toEqual([
      expect.objectContaining({
        source: 'static',
        artifactPath: 'PULSE_CERTIFICATE.json',
        executed: true,
        status: 'mapped',
      }),
    ]);
    expect(path.breakpoint).toEqual(
      expect.objectContaining({
        filePath: 'frontend/checkout.tsx',
        nodeId: 'ui:checkout',
        routePattern: '/api/checkout',
      }),
    );
    expect(path.breakpoint?.reason).toContain('lacks observed runtime');
    expect(path.breakpoint?.recovery).toContain('matching runtime');
    expect(path.validationCommand).toContain('route /api/checkout');

    expect(evaluateExecutionMatrixCompleteGate(matrix).status).toBe('pass');
    const observedGate = evaluateCriticalPathObservedGate(matrix);
    expect(observedGate.status).toBe('fail');
    expect(observedGate.evidenceMode).toBe('inferred');
    expect(observedGate.reason).toContain('precise proof blueprints');
    expect(observedGate.reason).toContain('still need observed pass/fail evidence');
  });

  it('fails critical path gate when path coverage still reports critical unobserved work', () => {
    const matrix = buildMatrix({});
    const observedGate = evaluateCriticalPathObservedGate(matrix, {
      summary: {
        criticalUnobserved: 1,
      },
    });

    expect(observedGate.status).toBe('fail');
    expect(observedGate.reason).toContain(
      'PULSE_PATH_COVERAGE.json still has 1 critical unobserved path',
    );
    expect(observedGate.reason).toContain('matching validation probe');
  });

  it('fails critical path gate when inferred critical paths lack a precise terminal reason', () => {
    const matrix = buildMatrix({});
    matrix.paths[0].breakpoint = null;
    const observedGate = evaluateCriticalPathObservedGate(matrix);
    expect(observedGate.status).toBe('fail');
    expect(observedGate.reason).toContain('critical path(s) without observed evidence');
  });
  it('passes critical observation and breakpoint precision after observed failure is precise', () => {
    const evidence = makeEvidence({
      flows: {
        declared: ['checkout-flow'],
        executed: ['checkout-flow'],
        missing: [],
        passed: [],
        failed: ['checkout-flow'],
        accepted: [],
        artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
        summary: 'checkout-flow failed',
        results: [
          {
            flowId: 'checkout-flow',
            status: 'failed',
            executed: true,
            accepted: false,
            summary: 'checkout endpoint returned 500',
            artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(evaluateCriticalPathObservedGate(matrix).status).toBe('pass');
    expect(evaluateBreakpointPrecisionGate(matrix).status).toBe('pass');
  });
});
