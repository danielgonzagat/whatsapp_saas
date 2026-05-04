import { describe, expect, it } from 'vitest';

import { evaluateCriticalPathObservedGate } from '../cert-gate-execution-matrix';
import type {
  PulseExecutionMatrix,
  PulseExecutionMatrixObservedEvidence,
  PulseExecutionMatrixPath,
  PulseExecutionMatrixPathStatus,
} from '../types';

const generatedAt = '2026-04-29T21:00:00.000Z';

function makePath(args: {
  status: PulseExecutionMatrixPathStatus;
  observedEvidence: PulseExecutionMatrixObservedEvidence[];
}): PulseExecutionMatrixPath {
  return {
    pathId: 'matrix:path:critical-checkout',
    capabilityId: 'checkout-capability',
    flowId: 'checkout-flow',
    source: 'execution_chain',
    entrypoint: {
      nodeId: 'ui:checkout',
      filePath: 'frontend/checkout.tsx',
      routePattern: '/api/checkout',
      description: 'checkout action',
    },
    chain: [
      {
        role: 'trigger',
        nodeId: 'ui:checkout',
        filePath: 'frontend/checkout.tsx',
        description: 'checkout action',
        truthMode: 'inferred',
      },
    ],
    status: args.status,
    truthMode: args.status === 'observed_pass' ? 'observed' : 'inferred',
    productStatus: 'real',
    breakpoint: null,
    requiredEvidence: [
      {
        kind: 'runtime',
        required: true,
        reason: 'Critical checkout path needs runtime proof.',
      },
    ],
    observedEvidence: args.observedEvidence,
    validationCommand:
      'node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path matrix:path:critical-checkout',
    risk: 'critical',
    executionMode: 'governed_validation',
    confidence: 0.9,
    filePaths: ['frontend/checkout.tsx'],
    routePatterns: ['/api/checkout'],
  };
}

function makeMatrix(path: PulseExecutionMatrixPath): PulseExecutionMatrix {
  return {
    generatedAt,
    summary: {
      totalPaths: 1,
      bySource: {
        execution_chain: 1,
        capability: 0,
        flow: 0,
        structural_node: 0,
        scope_file: 0,
      },
      byStatus: {
        observed_pass: path.status === 'observed_pass' ? 1 : 0,
        observed_fail: path.status === 'observed_fail' ? 1 : 0,
        untested: path.status === 'untested' ? 1 : 0,
        observation_only: path.status === 'observation_only' ? 1 : 0,
        blocked_human_required: path.status === 'blocked_human_required' ? 1 : 0,
        unreachable: path.status === 'unreachable' ? 1 : 0,
        inferred_only: path.status === 'inferred_only' ? 1 : 0,
        not_executable: path.status === 'not_executable' ? 1 : 0,
      },
      observedPass: path.status === 'observed_pass' ? 1 : 0,
      observedFail: path.status === 'observed_fail' ? 1 : 0,
      untested: 0,
      blockedHumanRequired: 0,
      observationOnlyRequired: 0,
      unreachable: 0,
      inferredOnly: 0,
      notExecutable: 0,
      terminalPaths: 1,
      nonTerminalPaths: 0,
      unknownPaths: 0,
      criticalUnobservedPaths: 0,
      impreciseBreakpoints: 0,
      coveragePercent: 100,
    },
    paths: [path],
  };
}

describe('execution reality certification contract', () => {
  it('blocks observed critical-path certification when the backing evidence is only mapped/planned proof', () => {
    const path = makePath({
      status: 'observed_pass',
      observedEvidence: [
        {
          source: 'static',
          artifactPath: 'PULSE_CERTIFICATE.json',
          executed: true,
          status: 'mapped',
          summary: 'Static matrix mapping found the path but did not execute it.',
        },
      ],
    });

    const result = evaluateCriticalPathObservedGate(makeMatrix(path));

    expect(result.status).toBe('fail');
    expect(result.evidenceMode).toBe('inferred');
    expect(result.reason).toContain('PULSE_EXECUTION_REALITY_AUDIT');
    expect(result.reason).toContain('non-observed proof');
  });

  it('allows critical-path certification when observed status has executed pass evidence', () => {
    const path = makePath({
      status: 'observed_pass',
      observedEvidence: [
        {
          source: 'flow',
          artifactPath: 'PULSE_FLOW_EVIDENCE.json',
          executed: true,
          status: 'passed',
          summary: 'checkout-flow passed after executing the validation probe.',
        },
      ],
    });

    const result = evaluateCriticalPathObservedGate(makeMatrix(path));

    expect(result.status).toBe('pass');
    expect(result.evidenceMode).toBe('observed');
  });
});
