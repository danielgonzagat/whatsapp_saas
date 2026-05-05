import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { classifyEndpointRisk } from '../../../api-fuzzer';
import { isSafeToExecute, buildPathCoverageState } from '../../../path-coverage-engine';
import { discoverPlugins } from '../../../plugin-system';
import { classifyEndpointRisk as classifyPropertyEndpointRisk } from '../../../property-tester';
import { classifyWatchChange } from '../../../watch-classifier';
import { classifySurface, classifyModuleCandidate } from '../../../scope-state.classify';
import { classifyFinancialModel } from '../../../dataflow-engine';
import { deriveUnitValue, deriveZeroValue } from '../../../dynamic-reality-kernel';
import type { PulseConfig } from '../../../types';

import { endpointProbe, matrixPath } from './helpers';

describe('PULSE no-hardcoded-reality contracts', () => {
  it('does not seed built-in product domain packs from the core', () => {
    const plugins = discoverPlugins(path.join(process.cwd(), '__pulse_no_plugins__'));

    expect(plugins).toEqual([]);
  });

  it('classifies scope surfaces from discovered package and tsconfig signals', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dynamic-surfaces-'));
    const nextDir = path.join(rootDir, 'customer-ui');
    const nestDir = path.join(rootDir, 'api-core');
    const pulseDir = path.join(rootDir, 'tooling/pulse');
    fs.mkdirSync(path.join(nextDir, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(nestDir, 'src'), { recursive: true });
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(nextDir, 'package.json'),
      JSON.stringify({ name: 'customer-ui', dependencies: { next: '1.0.0' } }),
    );
    fs.writeFileSync(
      path.join(nestDir, 'package.json'),
      JSON.stringify({ name: 'api-core', dependencies: { '@nestjs/core': '1.0.0' } }),
    );
    fs.writeFileSync(path.join(pulseDir, 'tsconfig.json'), JSON.stringify({ include: ['*.ts'] }));
    fs.writeFileSync(path.join(pulseDir, 'scanner.ts'), 'export const scanner = true;');

    expect(classifySurface('customer-ui/src/app/page.tsx', false, rootDir)).toBe('frontend');
    expect(classifySurface('api-core/src/controller.ts', false, rootDir)).toBe('backend');
    expect(classifySurface('tooling/pulse/scanner.ts', false, rootDir)).toBe('scripts');
    expect(classifyModuleCandidate('customer-ui/src/app/orders/page.tsx', rootDir)).toBe('orders');
  });

  it('classifies watched files from discovered workspace shape', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dynamic-watch-'));
    const appDir = path.join(rootDir, 'ui-shell');
    fs.mkdirSync(path.join(appDir, 'src/app'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify({ name: 'ui-shell', dependencies: { next: '1.0.0' } }),
    );
    const watchedFile = path.join(appDir, 'src/app/page.tsx');
    fs.writeFileSync(watchedFile, 'export default function Page() { return null; }');

    expect(
      classifyWatchChange(watchedFile, {
        rootDir,
        schemaPath: path.join(rootDir, 'db/schema.prisma'),
      } as PulseConfig),
    ).toBe('frontend');
  });

  it('does not classify a model as financial from name alone', () => {
    expect(classifyFinancialModel('Payment', ['id', 'createdAt', 'updatedAt'])).toBe(false);
  });

  it('does not classify money-like state from field names without schema/type evidence', () => {
    expect(classifyFinancialModel('Xpto', ['id', 'amountCents', 'currency', 'status'])).toBe(false);
  });

  it('classifies API risk from contract shape instead of product path words', () => {
    expect(
      classifyEndpointRisk(
        endpointProbe({ path: '/checkout', filePath: 'backend/src/payment.ts' }),
      ),
    ).toBe('low');

    expect(
      classifyEndpointRisk(
        endpointProbe({
          method: 'POST',
          path: '/xpto',
          filePath: 'backend/src/opaque/controller.ts',
          requiresAuth: false,
          requestSchema: { dtoType: 'CreateOpaqueDto', source: 'inferred' },
        }),
      ),
    ).toBe('critical');
  });

  it('classifies property fuzz endpoint risk from request shape instead of product words', () => {
    expect(
      classifyPropertyEndpointRisk({ method: 'GET', path: '/payment', filePath: 'opaque.ts' }),
    ).toBe('low');
    expect(
      classifyPropertyEndpointRisk({ method: 'DELETE', path: '/xpto/:id', filePath: 'opaque.ts' }),
    ).toBe('high');
  });

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
});
