import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildAPIFuzzCatalog } from '../api-fuzzer';
import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import {
  buildPropertyTestEvidence,
  classifyEndpointRisk as classifyPropertyEndpointRisk,
  discoverPureFunctionCandidates,
  generateFuzzCasesFromEndpoints,
  generatePropertyTestCases,
  generatePropertyTestTargets,
  scanForExistingPropertyTests,
} from '../property-tester';
import { makeTempRoot, writeFile } from './__parts__/execution-blueprints.helpers';
import './__parts__/execution-blueprints.cases.harness';

describe('PULSE execution blueprints', () => {
  it('keeps execution harness free of hardcoded reality audit findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const harnessFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/execution-harness.ts',
    );

    expect(harnessFindings).toEqual([]);
  });

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

  it('derives API fuzz auth and assignment probes from route, guard, and DTO shape', () => {
    const root = makeTempRoot('pulse-api-fuzz-dynamic-');
    writeFile(
      root,
      'backend/src/opaque/opaque.dto.ts',
      `
        export class UpdateOpaqueDto {
          @IsString()
          label: string;

          @IsBoolean()
          enabled: boolean;

          @IsArray()
          tags: string[];

          @IsOptional()
          @IsString()
          notes?: string;
        }
      `,
    );
    writeFile(
      root,
      'backend/src/opaque/opaque.controller.ts',
      `
        @Controller('opaque/:subjectKey')
        export class OpaqueController {
          @UseGuards(SubjectBoundaryGuard('probe'))
          @PolicyMarker('probe')
          @Patch()
          update(@Body() body: UpdateOpaqueDto) {
            return body;
          }
        }
      `,
    );

    const evidence = buildAPIFuzzCatalog(root);
    const probe = evidence.probes.find((item) => item.path === '/opaque/:subjectKey');

    expect(probe).toBeDefined();
    expect(probe?.authProbeMetadata?.guardNames).toEqual(['SubjectBoundaryGuard']);
    expect(probe?.authProbeMetadata?.authorizationMetadata).toEqual(['PolicyMarker']);
    expect(probe?.authProbeMetadata?.routeParameters).toEqual(['subjectKey']);
    expect(probe?.authTests.map((test) => test.testId)).toEqual(
      expect.arrayContaining([
        `${probe?.endpointId}-auth-boundary-missing-0`,
        `${probe?.endpointId}-auth-context-mismatch-subjectKey`,
        `${probe?.endpointId}-auth-metadata-variant-0`,
      ]),
    );

    const serializedSecurityPayloads = JSON.stringify(
      probe?.securityTests
        .filter(
          (test) =>
            test.vulnerabilityType === 'mass_assignment' || test.vulnerabilityType === 'idor',
        )
        .map((test) => test.payload),
    );

    expect(serializedSecurityPayloads).toContain('label__unexpected');
    expect(serializedSecurityPayloads).toContain('alternate-subjectKey-probe');
    expect(serializedSecurityPayloads).not.toMatch(/\b(role|admin|owner|workspaceId|provider)\b/i);

    const validSchemaPayload = probe?.schemaTests.find((test) =>
      test.testId.endsWith('-schema-valid'),
    )?.payload as Record<string, unknown> | undefined;
    const missingLabelPayload = probe?.schemaTests.find((test) =>
      test.testId.endsWith('-schema-missing-label'),
    )?.payload as Record<string, unknown> | undefined;
    const missingEnabledPayload = probe?.schemaTests.find((test) =>
      test.testId.endsWith('-schema-missing-enabled'),
    )?.payload as Record<string, unknown> | undefined;
    const wrongTagsPayload = probe?.schemaTests.find((test) =>
      test.testId.endsWith('-schema-wrong-type-tags'),
    )?.payload as Record<string, unknown> | undefined;
    const extraFieldsPayload = probe?.schemaTests.find((test) =>
      test.testId.endsWith('-schema-extra-fields'),
    )?.payload as Record<string, unknown> | undefined;

    expect(validSchemaPayload).toMatchObject({
      label: '__pulse_value',
      enabled: true,
      notes: '__pulse_value',
    });
    expect(validSchemaPayload?.tags).toEqual(['__pulse_item']);
    expect(missingLabelPayload).toMatchObject({ enabled: true, tags: ['__pulse_item'] });
    expect(missingLabelPayload).not.toHaveProperty('label');
    expect(missingEnabledPayload).toMatchObject({
      label: '__pulse_value',
      tags: ['__pulse_item'],
    });
    expect(missingEnabledPayload).not.toHaveProperty('enabled');
    expect(wrongTagsPayload?.tags).toBe('__pulse_not_array');
    expect(extraFieldsPayload).toMatchObject({
      label: '__pulse_value',
      enabled: true,
      unexpectedExtraField: 'should-be-rejected',
    });
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

  it('discovers property tests and fuzz strategies from proof shape sensors', () => {
    const root = makeTempRoot('pulse-property-shape-');
    writeFile(
      root,
      'src/arithmetic.property.ts',
      `
        import fc from 'fast-check';
        describe('arithmetic laws', () => {
          it('keeps integers closed', () => {
            fc.assert(fc.property(fc.integer(), (value) => Number.isInteger(value)));
          });
        });
      `,
    );

    const scanned = scanForExistingPropertyTests(root);
    const publicSchemaEndpoint = {
      method: 'POST',
      path: '/opaque',
      filePath: 'backend/src/opaque.controller.ts',
      requiresAuth: false,
      requestSchema: { dtoType: 'CreateOpaqueDto', source: 'inferred' },
    };
    const readEndpoint = {
      method: 'GET',
      path: '/opaque',
      filePath: 'backend/src/opaque.controller.ts',
      requiresAuth: false,
      requestSchema: null,
    };
    const fuzzCases = generateFuzzCasesFromEndpoints([publicSchemaEndpoint, readEndpoint]);
    const publicStrategies = fuzzCases
      .filter((test) => test.endpoint === 'POST /opaque')
      .map((test) => test.strategy);
    const readStrategies = fuzzCases
      .filter((test) => test.endpoint === 'GET /opaque')
      .map((test) => test.strategy);

    expect(scanned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: 'src/arithmetic.property.ts',
          status: 'not_executed',
        }),
      ]),
    );
    expect(classifyPropertyEndpointRisk(publicSchemaEndpoint)).toBe('high');
    expect(publicStrategies).toEqual(
      expect.arrayContaining(['valid_only', 'invalid_only', 'boundary', 'random', 'both']),
    );
    expect(readStrategies).toEqual(['valid_only', 'random']);
  });

  it('discovers const functions, enum members, and BRL money property inputs from source reality', () => {
    const root = makeTempRoot('pulse-property-dynamic-');
    writeFile(
      root,
      'src/payments/money.ts',
      `
        export const formatBRL = (cents: number): string => String(cents);

        export enum PaymentStatus {
          Pending = 'PENDING',
          Paid = 'PAID',
        }
      `,
    );

    const candidates = discoverPureFunctionCandidates(root);
    const generated = generatePropertyTestCases(root);
    const money = generated.find((item) => item.functionName === 'formatBRL');
    const status = generated.find((item) => item.functionName === 'PaymentStatus');

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ functionName: 'formatBRL', category: 'money_handler' }),
        expect.objectContaining({
          functionName: 'PaymentStatus',
          category: 'enum_handler',
          params: ['PENDING', 'PAID'],
        }),
      ]),
    );
    expect(money?.status).toBe('planned');
    expect(money?.generatedInputs.map((input) => input.value)).toEqual(
      expect.arrayContaining(['R$ 1,00', 'R$ 42,50']),
    );
    expect(status?.status).toBe('planned');
    expect(status?.generatedInputs.map((input) => input.value)).toEqual(
      expect.arrayContaining(['PENDING', 'PAID']),
    );
  });
});
