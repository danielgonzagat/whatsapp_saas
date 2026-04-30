import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPathCoverageState } from '../path-coverage-engine';
import { buildPathProofPlan, type PathProofTaskMode } from '../path-proof-runner';
import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import type {
  PulseExecutionMatrix,
  PulseExecutionMatrixPath,
  PulseExecutionMatrixPathSource,
  PulseExecutionMatrixPathStatus,
} from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-path-proof-runner-'));
  tempRoots.push(rootDir);
  return rootDir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    if (rootDir) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

function makeMatrixPath(
  overrides: Partial<PulseExecutionMatrixPath> = {},
): PulseExecutionMatrixPath {
  const routePatterns = overrides.routePatterns ?? ['/api/checkout'];
  return {
    pathId: 'matrix:path:critical-checkout',
    capabilityId: 'checkout-capability',
    flowId: 'checkout-flow',
    source: 'execution_chain',
    entrypoint: {
      nodeId: 'ui:checkout',
      filePath: 'frontend/checkout.tsx',
      routePattern: routePatterns[0] ?? null,
      description: 'checkout button',
    },
    chain: [
      {
        role: 'trigger',
        nodeId: 'ui:checkout',
        filePath: 'frontend/checkout.tsx',
        description: 'checkout button',
        truthMode: 'inferred',
      },
    ],
    status: 'inferred_only',
    truthMode: 'inferred',
    productStatus: 'real',
    breakpoint: {
      stage: 'trigger',
      stepIndex: 0,
      filePath: 'frontend/checkout.tsx',
      nodeId: 'ui:checkout',
      routePattern: routePatterns[0] ?? null,
      reason: 'Path is structurally inferred but lacks observed runtime evidence.',
      recovery: 'Run the checkout runtime probe and refresh path coverage.',
    },
    requiredEvidence: [
      {
        kind: 'runtime',
        required: true,
        reason: 'Critical checkout path needs runtime evidence.',
      },
    ],
    observedEvidence: [
      {
        source: 'static',
        artifactPath: 'PULSE_CERTIFICATE.json',
        executed: true,
        status: 'mapped',
        summary: 'Path is statically reconstructed.',
      },
    ],
    validationCommand:
      'node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path matrix:path:critical-checkout route /api/checkout',
    risk: 'critical',
    executionMode: 'governed_validation',
    confidence: 0.7,
    filePaths: ['frontend/checkout.tsx'],
    routePatterns,
    ...overrides,
  };
}

function countByStatus(
  paths: PulseExecutionMatrixPath[],
): Record<PulseExecutionMatrixPathStatus, number> {
  const statuses: PulseExecutionMatrixPathStatus[] = [
    'observed_pass',
    'observed_fail',
    'untested',
    'observation_only',
    'blocked_human_required',
    'unreachable',
    'inferred_only',
    'not_executable',
  ];

  return Object.fromEntries(
    statuses.map((status) => [status, paths.filter((entry) => entry.status === status).length]),
  ) as Record<PulseExecutionMatrixPathStatus, number>;
}

function countBySource(
  paths: PulseExecutionMatrixPath[],
): Record<PulseExecutionMatrixPathSource, number> {
  const sources: PulseExecutionMatrixPathSource[] = [
    'execution_chain',
    'capability',
    'flow',
    'structural_node',
    'scope_file',
  ];

  return Object.fromEntries(
    sources.map((source) => [source, paths.filter((entry) => entry.source === source).length]),
  ) as Record<PulseExecutionMatrixPathSource, number>;
}

function makeMatrix(paths: PulseExecutionMatrixPath[]): PulseExecutionMatrix {
  const byStatus = countByStatus(paths);
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalPaths: paths.length,
      bySource: countBySource(paths),
      byStatus,
      observedPass: byStatus.observed_pass,
      observedFail: byStatus.observed_fail,
      untested: byStatus.untested,
      blockedHumanRequired: byStatus.blocked_human_required,
      observationOnlyRequired: byStatus.observation_only,
      unreachable: byStatus.unreachable,
      inferredOnly: byStatus.inferred_only,
      notExecutable: byStatus.not_executable,
      terminalPaths: paths.length,
      nonTerminalPaths: 0,
      unknownPaths: 0,
      criticalUnobservedPaths: paths.filter(
        (entry) =>
          (entry.risk === 'high' || entry.risk === 'critical') &&
          entry.status !== 'observed_pass' &&
          entry.status !== 'observed_fail',
      ).length,
      impreciseBreakpoints: 0,
      coveragePercent: 100,
    },
    paths,
  };
}
