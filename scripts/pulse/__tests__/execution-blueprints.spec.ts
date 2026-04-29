import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildAPIFuzzCatalog } from '../api-fuzzer';
import { generateTestHarnessCode } from '../execution-harness';
import {
  buildPropertyTestEvidence,
  generateFuzzCasesFromEndpoints,
  generatePropertyTestTargets,
  scanForExistingPropertyTests,
} from '../property-tester';
import type { HarnessTarget } from '../types.execution-harness';

const tempRoots: string[] = [];

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function harnessTarget(overrides: Partial<HarnessTarget> = {}): HarnessTarget {
  return {
    targetId: 'endpoint:post:widgets',
    kind: 'endpoint',
    name: 'WidgetController.create',
    filePath: 'backend/src/widget.controller.ts',
    methodName: 'create',
    routePattern: '/widgets',
    httpMethod: 'POST',
    requiresAuth: true,
    requiresTenant: true,
    dependencies: ['service:widget-service'],
    fixtures: [],
    feasibility: 'executable',
    feasibilityReason: 'test target',
    generatedTests: [],
    generated: false,
    ...overrides,
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('PULSE execution blueprints', () => {
  it('does not count generated API fuzz plans as probed or tested endpoints', () => {
    const root = makeTempRoot('pulse-api-fuzz-');
    writeFile(
      root,
      'backend/src/widget.controller.ts',
      `
        @Controller('widgets')
        export class WidgetController {
          @UseGuards(AuthGuard)
          @Post()
          create(@Body() body: CreateWidgetDto) {
            return body;
          }
        }
      `,
    );

    const evidence = buildAPIFuzzCatalog(root);
    const plannedStatuses = evidence.probes.flatMap((probe) => [
      ...probe.authTests.map((test) => test.status),
      ...probe.schemaTests.map((test) => test.status),
      ...probe.idempotencyTests.map((test) => test.status),
      ...probe.rateLimitTests.map((test) => test.status),
      ...probe.securityTests.map((test) => test.status),
    ]);

    expect(evidence.summary.totalEndpoints).toBeGreaterThan(0);
    expect(evidence.summary.plannedEndpoints).toBe(evidence.summary.totalEndpoints);
    expect(evidence.summary.probedEndpoints).toBe(0);
    expect(evidence.summary.authTestedEndpoints).toBe(0);
    expect(evidence.summary.schemaTestedEndpoints).toBe(0);
    expect(evidence.summary.securityTestedEndpoints).toBe(0);
    expect(evidence.summary.endpointsWithIssues).toBe(0);
    expect(plannedStatuses.every((status) => status === 'planned')).toBe(true);
  });

  it('does not mark scanned or generated property/fuzz plans as passed', () => {
    const root = makeTempRoot('pulse-property-');
    writeFile(
      root,
      'src/math.spec.ts',
      `
        import fc from 'fast-check';
        fc.assert(fc.property(fc.integer(), (value) => Number.isInteger(value)));
      `,
    );

    const scanned = scanForExistingPropertyTests(root);
    const fuzzCases = generateFuzzCasesFromEndpoints([
      { method: 'POST', path: '/widgets/:id', filePath: 'backend/src/widget.controller.ts' },
    ]);
    const evidence = buildPropertyTestEvidence(root, path.join(root, '.pulse', 'current'));

    expect(generatePropertyTestTargets()).toEqual([]);
    expect(scanned.length).toBeGreaterThan(0);
    expect(scanned.every((test) => test.status === 'not_executed')).toBe(true);
    expect(fuzzCases.every((test) => test.status === 'planned')).toBe(true);
    expect(evidence.summary.passedPropertyTests).toBe(0);
    expect(evidence.summary.passedFuzzTests).toBe(0);
    expect(evidence.summary.notExecutedPropertyTests).toBeGreaterThan(0);
  });

  it('generates fail-closed harness blueprints instead of weak runnable tests', () => {
    const generated = generateTestHarnessCode(harnessTarget());

    expect(generated).toHaveLength(1);
    expect(generated[0].status).toBe('planned');
    expect(generated[0].canRunLocally).toBe(false);
    expect(generated[0].code).toContain('PULSE_HARNESS_BLUEPRINT_NOT_EXECUTED');
    expect(generated[0].code).not.toContain('expect(');
    expect(generated[0].code).not.toContain('toBeDefined');
    expect(generated[0].code).not.toContain('toBeLessThan');
    expect(generated[0].code).not.toContain('TODO');
  });
});
