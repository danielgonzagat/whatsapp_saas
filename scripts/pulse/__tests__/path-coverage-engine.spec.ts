import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { buildPathCoverageState } from '../path-coverage-engine';
import type { PulseExecutionMatrix, PulseExecutionMatrixPath } from '../types';

function makeMatrixPath(
  overrides: Partial<PulseExecutionMatrixPath> = {},
): PulseExecutionMatrixPath {
  return {
    pathId: 'matrix:path:critical-checkout',
    capabilityId: 'checkout-capability',
    flowId: 'checkout-flow',
    source: 'execution_chain',
    entrypoint: {
      nodeId: 'ui:checkout',
      filePath: 'frontend/checkout.tsx',
      routePattern: '/api/checkout',
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
      routePattern: '/api/checkout',
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
    routePatterns: ['/api/checkout'],
    ...overrides,
  };
}

function makeMatrix(paths: PulseExecutionMatrixPath[]): PulseExecutionMatrix {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalPaths: paths.length,
      bySource: {
        execution_chain: paths.filter((entry) => entry.source === 'execution_chain').length,
        capability: paths.filter((entry) => entry.source === 'capability').length,
        flow: paths.filter((entry) => entry.source === 'flow').length,
        structural_node: paths.filter((entry) => entry.source === 'structural_node').length,
        scope_file: paths.filter((entry) => entry.source === 'scope_file').length,
      },
      byStatus: {
        observed_pass: paths.filter((entry) => entry.status === 'observed_pass').length,
        observed_fail: paths.filter((entry) => entry.status === 'observed_fail').length,
        untested: paths.filter((entry) => entry.status === 'untested').length,
        observation_only: paths.filter((entry) => entry.status === 'observation_only').length,
        blocked_human_required: paths.filter((entry) => entry.status === 'blocked_human_required')
          .length,
        unreachable: paths.filter((entry) => entry.status === 'unreachable').length,
        inferred_only: paths.filter((entry) => entry.status === 'inferred_only').length,
        not_executable: paths.filter((entry) => entry.status === 'not_executable').length,
      },
      observedPass: 0,
      observedFail: 0,
      untested: 0,
      blockedHumanRequired: 0,
      observationOnlyRequired: 0,
      unreachable: 0,
      inferredOnly: paths.filter((entry) => entry.status === 'inferred_only').length,
      notExecutable: 0,
      terminalPaths: paths.length,
      nonTerminalPaths: 0,
      unknownPaths: 0,
      criticalUnobservedPaths: paths.length,
      impreciseBreakpoints: 0,
      coveragePercent: 100,
    },
    paths,
  };
}

describe('buildPathCoverageState terminal proof routing', () => {
  it('exposes generated probe blueprint commands as terminal proof for critical paths', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-path-proof-'));
    const coverage = buildPathCoverageState(rootDir, makeMatrix([makeMatrixPath()]));
    const entry = coverage.paths[0];

    expect(entry.classification).toBe('probe_blueprint_generated');
    expect(entry.terminalProof).toEqual(
      expect.objectContaining({
        status: 'blueprint_ready',
        breakpoint: expect.objectContaining({
          routePattern: '/api/checkout',
          reason: expect.stringContaining('lacks observed runtime evidence'),
        }),
      }),
    );
    expect(entry.terminalProof.validationCommand).toContain(entry.validationCommand);
    expect(entry.terminalProof.validationCommand).toContain('.pulse/frontier/');
    expect(entry.terminalProof.reason).toContain('generated probe blueprint');
    expect(coverage.summary.criticalBlueprintReady).toBe(1);
    expect(coverage.summary.criticalInferredGap).toBe(0);
  });

  it('routes customer synthetic missing evidence as actionable PULSE machine proof debt', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-path-proof-'));
    const coverage = buildPathCoverageState(
      rootDir,
      makeMatrix([
        makeMatrixPath({
          observedEvidence: [
            {
              source: 'actor',
              artifactPath: 'PULSE_SCENARIO_EVIDENCE.json',
              executed: false,
              status: 'missing',
              summary:
                'customer synthetic scenario customer-checkout has no runtime-observed terminal proof; this is PULSE machine work, not product capability evidence.',
            },
            {
              source: 'static',
              artifactPath: 'PULSE_CERTIFICATE.json',
              executed: true,
              status: 'mapped',
              summary: 'Path is statically reconstructed.',
            },
          ],
          breakpoint: {
            stage: 'trigger',
            stepIndex: 0,
            filePath: 'frontend/checkout.tsx',
            nodeId: 'ui:checkout',
            routePattern: '/api/checkout',
            reason:
              'customer synthetic scenario customer-checkout has no runtime-observed terminal proof; this is PULSE machine work, not product capability evidence.',
            recovery:
              'Execute or classify the matching customer/soak scenario blueprint and attach terminal runtime evidence before promoting this path to observed.',
          },
        }),
      ]),
    );
    const entry = coverage.paths[0];
    const probePath = entry.testFilePath ? path.join(rootDir, entry.testFilePath) : null;
    const probe = probePath
      ? (JSON.parse(fs.readFileSync(probePath, 'utf8')) as { validationRequired: string[] })
      : null;

    expect(entry.classification).toBe('probe_blueprint_generated');
    expect(entry.terminalReason).toContain('PULSE machine work');
    expect(entry.terminalProof.reason).toContain('actionable proof debt');
    expect(entry.expectedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'e2e',
          reason: expect.stringContaining('Customer/soak synthetic missing evidence'),
        }),
      ]),
    );
    expect(probe?.validationRequired).toEqual(
      expect.arrayContaining([
        'scenario_blueprint_generated',
        'scenario_runtime_execution_attempted_or_classified',
        'terminal_proof_reason_recorded',
      ]),
    );
  });

  it('keeps protected inferred paths terminally reasoned instead of hiding the breakpoint', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-path-proof-'));
    const protectedPath = makeMatrixPath({
      pathId: 'matrix:path:protected-governance',
      entrypoint: {
        nodeId: 'ops:gate',
        filePath: 'scripts/ops/check-governance-boundary.mjs',
        routePattern: null,
        description: 'governance gate',
      },
      breakpoint: {
        stage: 'entrypoint',
        stepIndex: 0,
        filePath: 'scripts/ops/check-governance-boundary.mjs',
        nodeId: 'ops:gate',
        routePattern: null,
        reason: 'Protected governance path cannot be executed by an AI worker.',
        recovery: 'Ask the human to approve governance-surface validation.',
      },
      filePaths: ['scripts/ops/check-governance-boundary.mjs'],
      routePatterns: [],
    });
    const coverage = buildPathCoverageState(rootDir, makeMatrix([protectedPath]));
    const entry = coverage.paths[0];

    expect(entry.classification).toBe('inferred_only');
    expect(entry.safeToExecute).toBe(false);
    expect(entry.terminalProof).toEqual(
      expect.objectContaining({
        status: 'terminal_reasoned',
        breakpoint: expect.objectContaining({
          filePath: 'scripts/ops/check-governance-boundary.mjs',
          recovery: expect.stringContaining('Ask the human'),
        }),
        validationCommand: protectedPath.validationCommand,
      }),
    );
    expect(coverage.summary.criticalTerminalReasoned).toBe(1);
    expect(coverage.summary.criticalInferredGap).toBe(0);
  });
});
