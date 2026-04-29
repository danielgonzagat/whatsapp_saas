import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { classifyEndpointRisk } from '../api-fuzzer';
import {
  classifyTargetsFromSource,
  detectProviders,
  generateProviderScenarios,
} from '../chaos-engine';
import { isInternalEndpoint, providerFromUrl } from '../contract-tester';
import { classifyFinancialModel } from '../dataflow-engine';
import { buildPathCoverageState, isSafeToExecute } from '../path-coverage-engine';
import { discoverPlugins } from '../plugin-system';
import { classifyEndpointRisk as classifyPropertyEndpointRisk } from '../property-tester';
import { classifyReplaySession } from '../replay-adapter';
import { classifyDestructiveActions } from '../safety-sandbox';
import { detectNewFile } from '../scope-engine';
import { classifySurface, classifyModuleCandidate } from '../scope-state.classify';
import { classifyRoleFromRoute } from '../ui-crawler';
import { determineRiskLevel } from '../dod-engine';
import { classifyExecutionFeasibility, isCriticalHarnessTarget } from '../execution-harness';
import { filePathToCapability, filePathToFlow, isCriticalPath } from '../gitnexus/provider';
import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { classifyWatchChange } from '../watch-classifier';
import { ROUTE_NOISE_TOKENS } from '../codebase-truth.tokens';
import { isUserFacingGroup } from '../codebase-truth.string-utils';
import { isLikelyMutation } from '../codebase-truth-flows';
import { buildScenarioCatalog } from '../scenario-engine';
import { buildBehaviorGraph } from '../behavior-graph';
import { buildSideEffectSignals } from '../structural-side-effects';
import type { APIEndpointProbe } from '../types.api-fuzzer';
import type { HarnessTarget } from '../types.execution-harness';
import type { PulseExecutionMatrixPath } from '../types.execution-matrix';
import type { PulseCapability, PulseConfig, PulseProductGraph } from '../types';
import type { ReplaySession } from '../types.replay-adapter';
import type { InteractionChain } from '../functional-map-types';

function endpointProbe(overrides: Partial<APIEndpointProbe> = {}): APIEndpointProbe {
  return {
    endpointId: 'GET:/anything:index:test.ts:1',
    method: 'GET',
    path: '/anything',
    controller: 'TestController',
    filePath: 'backend/src/renamed/test.controller.ts',
    requiresAuth: false,
    requiresTenant: false,
    rateLimit: null,
    requestSchema: null,
    responseSchema: null,
    authTests: [],
    schemaTests: [],
    idempotencyTests: [],
    rateLimitTests: [],
    securityTests: [],
    ...overrides,
  };
}

function matrixPath(overrides: Partial<PulseExecutionMatrixPath> = {}): PulseExecutionMatrixPath {
  return {
    pathId: 'matrix:path:test',
    capabilityId: null,
    flowId: null,
    source: 'execution_chain',
    entrypoint: {
      nodeId: null,
      filePath: 'backend/src/opaque/controller.ts',
      routePattern: '/opaque',
      description: 'Opaque route',
    },
    chain: [],
    status: 'inferred_only',
    truthMode: 'inferred',
    productStatus: null,
    breakpoint: null,
    requiredEvidence: [],
    observedEvidence: [],
    validationCommand: 'node scripts/pulse/run.js --guidance',
    risk: 'medium',
    executionMode: 'ai_safe',
    confidence: 1,
    filePaths: ['backend/src/opaque/controller.ts'],
    routePatterns: ['/opaque'],
    ...overrides,
  };
}

function replaySession(overrides: Partial<ReplaySession> = {}): ReplaySession {
  return {
    sessionId: 'replay-1',
    source: 'sentry_replay',
    userId: null,
    startTime: '2026-04-29T00:00:00.000Z',
    endTime: '2026-04-29T00:00:01.000Z',
    durationMs: 1000,
    url: '/opaque',
    events: [],
    errors: [{ message: 'failed', timestamp: '2026-04-29T00:00:01.000Z' }],
    status: 'captured',
    convertedScenarioId: null,
    ...overrides,
  };
}

function harnessTarget(overrides: Partial<HarnessTarget> = {}): HarnessTarget {
  return {
    targetId: 'endpoint:get:opaque',
    kind: 'endpoint',
    name: 'OpaqueController.index',
    filePath: 'backend/src/opaque/controller.ts',
    methodName: 'index',
    routePattern: '/opaque',
    httpMethod: 'GET',
    requiresAuth: false,
    requiresTenant: false,
    dependencies: [],
    fixtures: [],
    feasibility: 'executable',
    feasibilityReason: '',
    generatedTests: [],
    generated: false,
    ...overrides,
  };
}

function pulseCapability(overrides: Partial<PulseCapability> = {}): PulseCapability {
  return {
    id: 'capability:opaque',
    name: 'Opaque',
    truthMode: 'observed',
    status: 'partial',
    confidence: 1,
    userFacing: false,
    runtimeCritical: false,
    protectedByGovernance: false,
    ownerLane: 'customer',
    executionMode: 'ai_safe',
    rolesPresent: [],
    missingRoles: [],
    filePaths: [],
    nodeIds: [],
    routePatterns: [],
    evidenceSources: [],
    codacyIssueCount: 0,
    highSeverityIssueCount: 0,
    blockingReasons: [],
    validationTargets: [],
    maturity: {
      stage: 'foundational',
      score: 0,
      dimensions: {
        interfacePresent: false,
        apiSurfacePresent: false,
        orchestrationPresent: false,
        persistencePresent: false,
        sideEffectPresent: false,
        runtimeEvidencePresent: false,
        validationPresent: false,
        scenarioCoveragePresent: false,
        codacyHealthy: true,
        simulationOnly: false,
      },
      missing: [],
    },
    dod: {
      status: 'partial',
      missingRoles: [],
      blockers: [],
      truthModeMet: true,
    },
    ...overrides,
  };
}

function interactionChain(overrides: Partial<InteractionChain> = {}): InteractionChain {
  return {
    pageRoute: '/opaque',
    pageFile: 'frontend/src/app/opaque/page.tsx',
    componentFile: 'frontend/src/components/Opaque.tsx',
    elementType: 'button',
    elementLabel: 'Open',
    elementLine: 1,
    handler: null,
    handlerType: 'unknown',
    apiCall: {
      endpoint: '/opaque',
      method: 'GET',
      file: 'frontend/src/lib/api.ts',
      line: 1,
    },
    proxyRoute: null,
    backendRoute: null,
    serviceMethod: null,
    prismaModels: [],
    status: 'FUNCIONA',
    statusReason: '',
    facadeEvidence: [],
    ...overrides,
  };
}

describe('PULSE no-hardcoded-reality contracts', () => {
  it('fails fixed reality decision maps in core PULSE code', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-hardcoded-reality-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'bad.ts'),
      [
        "const FIXED_ROUTES = ['/checkout', '/billing/status'];",
        "const capabilityIds = ['checkout-capability'];",
        "const flowIds = ['payment-flow'];",
        "const MODULE_DECISIONS = ['Billing', 'Checkout'];",
        "const PRODUCT_CATALOG = ['checkout-basic', 'crm-suite'];",
        "const DOMAIN_PACKS = ['billing', 'marketing'];",
        "const SUPPORTED_PROVIDERS = ['stripe', 'mercado-pago'];",
        "const USER_ROLES = ['owner', 'supplier'];",
      ].join('\n'),
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings.map((finding) => finding.kind)).toEqual([
      'fixed_product_route_collection',
      'fixed_capability_id_collection',
      'fixed_flow_id_collection',
      'fixed_module_decision_collection',
      'fixed_product_catalog_collection',
      'fixed_domain_catalog_collection',
      'fixed_provider_catalog_collection',
      'fixed_role_catalog_collection',
    ]);
  });

  it('allows kernel grammar collections that do not claim product reality', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-hardcoded-grammar-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'grammar.ts'),
      [
        "const TRUTH_MODES = ['observed', 'inferred', 'aspirational'];",
        "const STRUCTURAL_ROLES = ['interface', 'persistence', 'side_effect'];",
        "const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];",
        "const ARTIFACT_FILES = ['PULSE_CERTIFICATE.json', 'PULSE_CLI_DIRECTIVE.json'];",
        "const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];",
        "const SECURITY_PAYLOAD_CLASSES = ['sql-injection', 'xss-payload'];",
        "const PROVIDER_SCHEMA_KEYS = ['provider', 'status', 'source'];",
        "const KERNEL_ROLE_GRAMMAR = ['interface', 'persistence', 'side_effect'];",
      ].join('\n'),
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual([]);
  });

  it('keeps core PULSE free of hardcoded product reality decision collections', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());

    expect(result.scannedFiles).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });

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

  it('classifies money-like state from fields even when the model name is opaque', () => {
    expect(classifyFinancialModel('Xpto', ['id', 'amountCents', 'currency', 'status'])).toBe(true);
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
        totalPaths: 1,
        bySource: {
          execution_chain: 1,
          capability: 0,
          flow: 0,
          structural_node: 0,
          scope_file: 0,
        },
        byStatus: {
          observed_pass: 0,
          observed_fail: 0,
          untested: 0,
          blocked_human_required: 0,
          unreachable: 0,
          inferred_only: 1,
          not_executable: 0,
          observation_only: 0,
        },
        observedPass: 0,
        observedFail: 0,
        untested: 0,
        blockedHumanRequired: 0,
        unreachable: 0,
        inferredOnly: 1,
        notExecutable: 0,
        terminalPaths: 1,
        nonTerminalPaths: 0,
        unknownPaths: 0,
        criticalUnobservedPaths: 1,
        impreciseBreakpoints: 0,
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
    expect(coverage.summary.criticalUnobserved).toBe(0);
    expect(coverage.summary.observedPass + coverage.summary.observedFail).toBe(0);

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

  it('builds behavior graph external calls from import and call shape instead of provider catalogs', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-behavior-dynamic-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    fs.writeFileSync(
      path.join(backendDir, 'provider-name-only.service.ts'),
      ['export class StripeOpenAiWhatsappLabel {', '  run() { return true; }', '}'].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'dynamic-external.service.ts'),
      [
        "import OpaqueClient from 'opaque-sdk';",
        'export class DynamicExternalService {',
        '  async run() { return OpaqueClient.create({ amountCents: 100, currency: "USD" }); }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'dynamic-payment-chain.service.ts'),
      [
        "import OpaqueClient from 'opaque-sdk';",
        'export class DynamicPaymentChainService {',
        '  async run() { return OpaqueClient.checkout.sessions.create({ total: 100 }); }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'semantic-payment-action.service.ts'),
      [
        'export class SemanticPaymentActionService {',
        '  async run() { return processPayment({ amountCents: 100, currency: "USD" }); }',
        '}',
      ].join('\n'),
    );

    const graph = buildBehaviorGraph(rootDir);
    const namedOnly = graph.nodes.find((node) =>
      node.filePath.endsWith('provider-name-only.service.ts'),
    );
    const dynamicExternal = graph.nodes.find((node) =>
      node.filePath.endsWith('dynamic-external.service.ts'),
    );
    const dynamicPaymentChain = graph.nodes.find((node) =>
      node.filePath.endsWith('dynamic-payment-chain.service.ts'),
    );
    const semanticPaymentAction = graph.nodes.find((node) =>
      node.filePath.endsWith('semantic-payment-action.service.ts'),
    );

    expect(namedOnly?.externalCalls).toEqual([]);
    expect(namedOnly?.risk).toBe('low');
    expect(dynamicExternal?.externalCalls.map((call) => call.provider)).toEqual(['OpaqueClient']);
    expect(dynamicExternal?.risk).toBe('high');
    expect(dynamicPaymentChain?.externalCalls).toEqual([
      expect.objectContaining({ provider: 'OpaqueClient', operation: 'create' }),
    ]);
    expect(dynamicPaymentChain?.risk).toBe('high');
    expect(semanticPaymentAction?.externalCalls).toEqual([]);
    expect(semanticPaymentAction?.risk).toBe('high');
  });

  it('builds structural side effects from arbitrary external SDK usage instead of fixed SDK names', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-side-effect-dynamic-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    fs.writeFileSync(
      path.join(backendDir, 'named-only.ts'),
      'export const stripeOpenAiWhatsapp = "label-only";',
    );
    fs.writeFileSync(
      path.join(backendDir, 'external-sdk.ts'),
      [
        "import OpaqueProvider from 'opaque-provider-sdk';",
        'export async function run() {',
        '  return OpaqueProvider.send({ ok: true });',
        '}',
      ].join('\n'),
    );

    const nodes = buildSideEffectSignals(
      rootDir,
      ['backend/src/opaque/named-only.ts', 'backend/src/opaque/external-sdk.ts'],
      new Map(),
      'observed',
    );

    expect(
      nodes.some(
        (node) =>
          node.file?.endsWith('named-only.ts') && node.metadata.signal === 'external_sdk_call',
      ),
    ).toBe(false);
    expect(
      nodes.some(
        (node) =>
          node.file?.endsWith('external-sdk.ts') && node.metadata.signal === 'external_sdk_call',
      ),
    ).toBe(true);
  });

  it('classifies internal endpoints by URL structure instead of known product prefixes', () => {
    expect(isInternalEndpoint('/xpto')).toBe(true);
    expect(isInternalEndpoint('/payment')).toBe(true);
    expect(isInternalEndpoint('https://api.example.test/payment')).toBe(false);
  });

  it('discovers contract providers from observed URL hosts instead of a provider catalog', () => {
    expect(providerFromUrl('https://api.opaque-provider.test/v1/events')).toBe(
      'api.opaque-provider.test',
    );
    expect(providerFromUrl('/api/internal/events')).toBeNull();
  });

  it('classifies chaos targets from dependency behavior instead of provider names', () => {
    expect([
      ...classifyTargetsFromSource('await opaqueNamedService.create({ amount: 100 })'),
    ]).toEqual([]);

    expect([
      ...classifyTargetsFromSource('await billingClient.post("/opaque", payload)'),
    ]).toContain('external_http');

    expect([
      ...classifyTargetsFromSource(
        '@Post("/opaque/webhook") handle(@Headers("x-signature") sig: string) {}',
      ),
    ]).toContain('webhook_receiver');
  });

  it('discovers chaos dependencies from code and artifacts without a provider catalog', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-chaos-deps-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    const pulseDir = path.join(rootDir, '.pulse/current');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.mkdirSync(pulseDir, { recursive: true });

    const externalFile = path.join(backendDir, 'outbound.service.ts');
    fs.writeFileSync(
      externalFile,
      [
        'import { OpaqueClient } from "@vendor/opaque-sdk";',
        'export async function send() {',
        '  const endpoint = process.env.OPAQUE_ENDPOINT_URL;',
        '  return fetch("https://api.opaque-provider.test/v1/events");',
        '}',
      ].join('\n'),
    );

    const signalFile = path.join(backendDir, 'signal.service.ts');
    fs.writeFileSync(
      signalFile,
      'export async function probe() { return opaqueHttpClient.post("/events", {}); }',
    );

    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_BEHAVIOR_GRAPH.json'),
      JSON.stringify({
        nodes: [
          {
            filePath: path.relative(rootDir, signalFile),
            externalCalls: [{ provider: 'observed-opaque-runtime' }],
          },
        ],
      }),
    );

    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_STRUCTURAL_GRAPH.json'),
      JSON.stringify({
        nodes: [
          {
            kind: 'side_effect_signal',
            metadata: { filePath: path.relative(rootDir, signalFile) },
          },
        ],
      }),
    );

    const dependencies = detectProviders(rootDir);
    expect([...dependencies.keys()]).toEqual(
      expect.arrayContaining([
        'host:api-opaque-provider-test',
        'env:opaque-endpoint',
        'package:vendor-opaque-sdk',
        'behavior:observed-opaque-runtime',
        'client:opaquehttpclient',
      ]),
    );

    const scenarios = generateProviderScenarios(rootDir, dependencies, []);
    expect(
      scenarios.some((scenario) => scenario.id.includes('host:api-opaque-provider-test')),
    ).toBe(true);
    expect(scenarios.map((scenario) => scenario.description).join('\n')).not.toMatch(
      /stripe|openai|meta|resend/i,
    );
  });

  it('derives GitNexus impact labels structurally instead of a product domain catalog', () => {
    expect(filePathToCapability('backend/src/checkout/orders.controller.ts')).toBe('Checkout');
    expect(filePathToCapability('backend/src/xpto/orders.controller.ts')).toBe('Xpto');
    expect(filePathToFlow('backend/src/xpto/orders.controller.ts')).toBe('xpto-controller');

    expect(isCriticalPath('backend/src/payments/opaque.service.ts')).toBe(false);
    expect(isCriticalPath('backend/prisma/schema.prisma')).toBe(true);
    expect(isCriticalPath('backend/prisma/migrations/20260429120000_init/migration.sql')).toBe(
      true,
    );
  });

  it('classifies DoD risk from structural evidence instead of capability names', () => {
    expect(determineRiskLevel(pulseCapability({ name: 'Payment Wallet Checkout Auth' }))).toBe(
      'low',
    );

    expect(
      determineRiskLevel(
        pulseCapability({
          name: 'Xpto',
          rolesPresent: ['interface', 'persistence', 'side_effect'],
        }),
      ),
    ).toBe('critical');

    expect(
      determineRiskLevel(
        pulseCapability({
          name: 'Opaque',
          routePatterns: ['post-opaque-id'],
        }),
      ),
    ).toBe('high');
  });

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
          totalNodes: 1,
          handlerNodes: 0,
          apiEndpointNodes: 1,
          queueNodes: 0,
          cronNodes: 0,
          webhookNodes: 0,
          dbNodes: 0,
          externalCallNodes: 0,
          aiSafeNodes: 1,
          humanRequiredNodes: 0,
          nodesWithErrorHandler: 0,
          nodesWithLogging: 0,
          nodesWithMetrics: 0,
          criticalRiskNodes: 0,
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
