import { describe, expect, it } from 'vitest';
import {
  buildFixtureDataStructures,
  discoverEndpoints,
  discoverServices,
  generateFixturesForTarget,
  generateTestHarnessCode,
} from '../../execution-harness';
import {
  harnessTarget,
  makeTempRoot,
  pulseConfig,
  writeFile,
} from './execution-blueprints.helpers';

describe('PULSE execution blueprints', () => {
  it('generates fail-closed harness blueprints instead of weak runnable tests', () => {
    const generated = generateTestHarnessCode(harnessTarget());
    const blueprintJson = generated[0].code.match(
      /const pulseHarnessBlueprint = ([\s\S]*?);\n\nthrow/,
    )?.[1];

    expect(generated).toHaveLength(1);
    expect(generated[0].status).toBe('planned');
    expect(generated[0].canRunLocally).toBe(false);
    expect(generated[0].code).toContain('PULSE_HARNESS_BLUEPRINT_NOT_EXECUTED');
    expect(generated[0].code).not.toContain('expect(');
    expect(generated[0].code).not.toContain('toBeDefined');
    expect(generated[0].code).not.toContain('toBeLessThan');
    expect(generated[0].code).not.toContain('TODO');
    expect(blueprintJson).toBeDefined();

    if (!blueprintJson) {
      throw new Error('Expected generated harness code to embed a blueprint object');
    }

    const blueprint = JSON.parse(blueprintJson) as {
      validationCommand: string;
      expectedEvidence: Array<{ kind: string; required: boolean }>;
      structuralSafetyClassification: {
        risk: string;
        executionMode: string;
        safeToExecute: boolean;
      };
      artifactLinks: Array<{ artifactPath: string; relationship: string }>;
      executionPlan: Array<{ step: string; required: boolean; detail: string }>;
      requiredAssertions: string[];
      evidenceMode: string;
      executed: boolean;
      coverageCountsAsObserved: boolean;
    };

    expect(JSON.stringify(blueprint)).not.toContain('human_required');
    expect(blueprint.validationCommand).toContain('node scripts/pulse/run.js --guidance');
    expect(blueprint.executionPlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: 'http_contract', required: true }),
        expect.objectContaining({ step: 'auth_boundary', required: true }),
        expect.objectContaining({ step: 'tenant_boundary', required: true }),
      ]),
    );
    expect(blueprint.requiredAssertions).toEqual(
      expect.arrayContaining([
        'assert HTTP status, response schema, and error schema for the discovered route',
        'assert authenticated and unauthenticated credential boundaries',
        'assert same-context success and cross-context rejection',
      ]),
    );
    expect(blueprint.evidenceMode).toBe('blueprint');
    expect(blueprint.executed).toBe(false);
    expect(blueprint.coverageCountsAsObserved).toBe(false);
    expect(blueprint.expectedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'runtime', required: true }),
        expect.objectContaining({ kind: 'integration', required: true }),
        expect.objectContaining({ kind: 'isolation', required: true }),
      ]),
    );
    expect(blueprint.structuralSafetyClassification).toEqual(
      expect.objectContaining({
        risk: 'high',
        executionMode: 'ai_safe',
        safeToExecute: true,
      }),
    );
    expect(blueprint.artifactLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactPath: '.pulse/current/PULSE_HARNESS_EVIDENCE.json',
          relationship: 'harness_evidence',
        }),
        expect.objectContaining({
          artifactPath: 'backend/src/widget.controller.ts',
          relationship: 'target_source',
        }),
      ]),
    );
  });

  it('derives harness context fixtures from guards, route params, and mutations without fixed roles', () => {
    const root = makeTempRoot('pulse-harness-dynamic-');
    writeFile(
      root,
      'backend/src/opaque/opaque.controller.ts',
      `
        @Controller('opaque/:subjectKey')
        export class OpaqueController {
          constructor(private readonly opaqueService: OpaqueService) {}

          @UseGuards(SubjectBoundaryGuard)
          @Patch('items/:itemKey')
          update() {
            return this.opaqueService.apply();
          }
        }
      `,
    );
    writeFile(
      root,
      'backend/src/opaque/opaque.service.ts',
      `
        @Injectable()
        export class OpaqueService
        {
          constructor(private readonly prisma: PrismaService) {}

          async apply() {
            return this.prisma.opaque.update({ where: { id: 'probe' }, data: {} });
          }
        }
      `,
    );

    const config = pulseConfig(root);
    const endpoint = discoverEndpoints(config).find(
      (target) => target.routePattern === '/opaque/:subjectKey/items/:itemKey',
    );
    const service = discoverServices(config).find(
      (target) => target.name === 'OpaqueService.apply',
    );

    expect(endpoint).toBeDefined();
    expect(service).toBeDefined();
    if (!endpoint || !service) {
      throw new Error('Expected dynamic harness targets to be discovered.');
    }

    expect(endpoint.requiresAuth).toBe(true);
    expect(endpoint.requiresTenant).toBe(true);
    expect(service.requiresAuth).toBe(false);
    expect(service.requiresTenant).toBe(true);
    expect(service.dependencies).toContain('model:opaque');

    const fixtures = generateFixturesForTarget(endpoint, root);
    const fixtureData = buildFixtureDataStructures([{ ...endpoint, fixtures }, service]);
    const serialized = JSON.stringify({ fixtures, fixtureData });

    expect(serialized).toContain('subjectKey');
    expect(serialized).toContain('itemKey');
    expect(serialized).not.toMatch(
      /\b(admin|member|role|roles|workspaceId|pulse-test-workspace)\b/i,
    );
  });
});
