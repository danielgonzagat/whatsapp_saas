import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { classifyEndpointRisk } from '../../../api-fuzzer';
import { classifyReplaySession } from '../../../replay-adapter';
import { classifyRoleFromRoute } from '../../../ui-crawler';
import { classifyDestructiveActions } from '../../../safety-sandbox';
import { classifyExecutionFeasibility, isCriticalHarnessTarget } from '../../../execution-harness';
import { buildPathCoverageState, isSafeToExecute } from '../../../path-coverage-engine';
import { detectNewFile } from '../../../scope-engine';
import { deriveUnitValue, deriveZeroValue } from '../../../dynamic-reality-kernel';

import { matrixPath, replaySession, harnessTarget, endpointProbe } from './helpers.spec';

describe('PULSE no-hardcoded-reality contracts', () => {
  it('classifies path execution safety from governance surfaces and generates governed probes for high risk', () => {
    expect(
      isSafeToExecute(
        matrixPath({ filePaths: ['backend/src/checkout/payment.controller.ts'], risk: 'medium' }),
      ),
    ).toBe(true);

    const criticalPath = matrixPath({
      pathId: 'matrix:path:opaque-critical',
      filePaths: ['backend/src/opaque/controller.ts'],
      risk: 'high',
      routePatterns: ['/opaque'],
      status: 'blocked_human_required',
    });
    expect(isSafeToExecute(criticalPath)).toBe(true);

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-path-coverage-'));
    const coverage = buildPathCoverageState(rootDir, {
      generatedAt: '2026-04-29T00:00:00.000Z',
      summary: {
        totalPaths: deriveUnitValue(),
        bySource: {
          execution_chain: deriveUnitValue(),
          capability: deriveZeroValue(),
          flow: deriveZeroValue(),
          structural_node: deriveZeroValue(),
          scope_file: deriveZeroValue(),
        },
        byStatus: {
          observed_pass: deriveZeroValue(),
          observed_fail: deriveZeroValue(),
          untested: deriveZeroValue(),
          blocked_human_required: deriveZeroValue(),
          unreachable: deriveZeroValue(),
          inferred_only: deriveUnitValue(),
          not_executable: deriveZeroValue(),
          observation_only: deriveZeroValue(),
        },
        observedPass: deriveZeroValue(),
        observedFail: deriveZeroValue(),
        untested: deriveZeroValue(),
        blockedHumanRequired: deriveZeroValue(),
        unreachable: deriveZeroValue(),
        inferredOnly: deriveUnitValue(),
        notExecutable: deriveZeroValue(),
        terminalPaths: deriveUnitValue(),
        nonTerminalPaths: deriveZeroValue(),
        unknownPaths: deriveZeroValue(),
        criticalUnobservedPaths: deriveUnitValue(),
        impreciseBreakpoints: deriveZeroValue(),
        coveragePercent: 100,
      },
      paths: [criticalPath],
    });
    const generatedPath = coverage.paths[0];

    expect(generatedPath.safeToExecute).toBe(true);
    expect(generatedPath.classification).toBe('probe_blueprint_generated');
    expect(generatedPath.evidenceMode).toBe('blueprint');
    expect(generatedPath.probeExecutionMode).toBe('governed_validation');
    expect(generatedPath.terminalReason).toContain('governed_validation probe blueprint');
    expect(generatedPath.validationCommand).toBe('node scripts/pulse/run.js --guidance');
    expect(generatedPath.expectedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'runtime',
          required: true,
        }),
      ]),
    );
    expect(generatedPath.structuralSafetyClassification).toEqual(
      expect.objectContaining({
        risk: 'high',
        executionMode: 'governed_validation',
        safeToExecute: true,
        protectedSurface: false,
      }),
    );
    expect(generatedPath.artifactLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactPath: '.pulse/current/PULSE_EXECUTION_MATRIX.json',
          relationship: 'source_matrix',
        }),
        expect.objectContaining({
          artifactPath: '.pulse/current/PULSE_PATH_COVERAGE.json',
          relationship: 'coverage_state',
        }),
      ]),
    );
    expect(generatedPath.testFilePath).toMatch(/\.pulse\/frontier\/.*\.probe\.json/);
    expect(coverage.summary.criticalUnobserved).toBe(deriveZeroValue());
    expect(coverage.summary.observedPass + coverage.summary.observedFail).toBe(deriveZeroValue());

    if (!generatedPath.testFilePath) {
      throw new Error('Expected path coverage to generate a probe blueprint file');
    }
    const probeBlueprint = JSON.parse(
      fs.readFileSync(path.join(rootDir, generatedPath.testFilePath), 'utf8'),
    ) as {
      matrixStatus: string;
      coverageCountsAsObserved: boolean;
      expectedEvidence: Array<{ kind: string; required: boolean }>;
      structuralSafetyClassification: { executionMode: string; safeToExecute: boolean };
      artifactLinks: Array<{ artifactPath: string; relationship: string }>;
    };

    expect(JSON.stringify(probeBlueprint)).not.toContain('human_required');
    expect(probeBlueprint.matrixStatus).toBe('governed_validation_required');
    expect(probeBlueprint.coverageCountsAsObserved).toBe(false);
    expect(probeBlueprint.expectedEvidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'runtime', required: true })]),
    );
    expect(probeBlueprint.structuralSafetyClassification).toEqual(
      expect.objectContaining({
        executionMode: 'governed_validation',
        safeToExecute: true,
      }),
    );
    expect(probeBlueprint.artifactLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactPath: generatedPath.testFilePath,
          relationship: 'probe_blueprint',
        }),
      ]),
    );

    expect(
      isSafeToExecute(
        matrixPath({ filePaths: ['scripts/ops/check-governance-boundary.mjs'], risk: 'medium' }),
      ),
    ).toBe(false);
  });

  it('promotes replay sessions from observed impact instead of URL words', () => {
    expect(classifyReplaySession(replaySession({ url: '/checkout' }))).toBe('temporary');

    expect(
      classifyReplaySession(
        replaySession({
          url: '/opaque',
          events: [
            {
              type: 'error',
              timestamp: '2026-04-29T00:00:01.000Z',
              detail: { severity: 9 },
            },
          ],
        }),
      ),
    ).toBe('permanent');
  });

  it('does not assign crawler roles from product route names', () => {
    expect(classifyRoleFromRoute('/checkout')).toBe('customer');
    expect(classifyRoleFromRoute('/payments')).toBe('customer');
    expect(classifyRoleFromRoute('/admin')).toBe('admin');
    expect(classifyRoleFromRoute('/operator/queue')).toBe('operator');
  });

  it('does not mark product-named source paths as protected governance', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scope-'));
    const governanceDir = path.join(rootDir, 'ops');
    fs.mkdirSync(governanceDir, { recursive: true });
    fs.writeFileSync(
      path.join(governanceDir, 'protected-governance-files.json'),
      JSON.stringify({
        protectedExact: [],
        protectedPrefixes: ['scripts/ops/'],
      }),
    );
    const productNamedDir = path.join(rootDir, 'backend/src/auth');
    fs.mkdirSync(productNamedDir, { recursive: true });
    const productNamedFile = path.join(productNamedDir, 'opaque.ts');
    fs.writeFileSync(productNamedFile, 'export function opaque() { return true; }');

    const protectedDir = path.join(rootDir, 'scripts/ops');
    fs.mkdirSync(protectedDir, { recursive: true });
    const protectedFile = path.join(protectedDir, 'guard.mjs');
    fs.writeFileSync(protectedFile, 'export default true;');

    expect(detectNewFile(rootDir, productNamedFile)?.isProtected).toBe(false);
    expect(detectNewFile(rootDir, productNamedFile)?.executionMode).toBe('ai_safe');
    expect(detectNewFile(rootDir, protectedFile)?.isProtected).toBe(true);
    expect(detectNewFile(rootDir, protectedFile)?.executionMode).toBe('human_required');
  });

  it('does not classify sandbox destructive actions from product path names alone', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-sandbox-'));
    const productNamedDir = path.join(rootDir, 'backend/src/payments');
    fs.mkdirSync(productNamedDir, { recursive: true });
    fs.writeFileSync(path.join(productNamedDir, 'opaque.ts'), 'export const opaque = true;');

    const mutatingDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(mutatingDir, { recursive: true });
    fs.writeFileSync(
      path.join(mutatingDir, 'mutating.ts'),
      'export async function run(client: { post(input: string): Promise<void> }) { await client.post("/opaque"); }',
    );

    const actions = classifyDestructiveActions(rootDir);

    expect(actions.some((action) => action.targetFile?.endsWith('payments/opaque.ts'))).toBe(false);
    expect(actions.some((action) => action.kind === 'external_state_mutation')).toBe(true);
  });

  it('classifies harness criticality from execution shape instead of target names', () => {
    expect(
      isCriticalHarnessTarget(
        harnessTarget({
          targetId: 'endpoint:get:payment',
          name: 'PaymentController.index',
          routePattern: '/payment',
        }),
      ),
    ).toBe(false);

    expect(
      isCriticalHarnessTarget(
        harnessTarget({
          targetId: 'endpoint:post:opaque',
          name: 'OpaqueController.create',
          routePattern: '/opaque',
          httpMethod: 'POST',
        }),
      ),
    ).toBe(true);
  });

  it('classifies harness staging from executable source shape instead of provider names', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-harness-shape-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    const namedOnlyFile = path.join(backendDir, 'opaque-label.service.ts');
    fs.writeFileSync(namedOnlyFile, 'export class OpaqueLabel { run() { return true; } }');

    const outboundFile = path.join(backendDir, 'outbound.service.ts');
    fs.writeFileSync(
      outboundFile,
      'export class Outbound { async run() { return fetch("https://example.test/probe"); } }',
    );

    expect(
      classifyExecutionFeasibility(
        harnessTarget({
          kind: 'service',
          name: 'OpaqueLabel.run',
          filePath: path.relative(rootDir, namedOnlyFile),
          methodName: 'run',
        }),
        new Map(),
        rootDir,
      ).feasibility,
    ).toBe('executable');

    expect(
      classifyExecutionFeasibility(
        harnessTarget({
          kind: 'service',
          name: 'Opaque.run',
          filePath: path.relative(rootDir, outboundFile),
          methodName: 'run',
        }),
        new Map(),
        rootDir,
      ).feasibility,
    ).toBe('needs_staging');
  });
});
