/**
 * PULSE Wave 5 — Scenario Evidence Engine
 *
 * Generates executable scenario definitions for every core product flow.
 * Each scenario includes concrete steps (login, navigate, click, type,
 * submit, assert) derived from the behavior graph, execution harness,
 * dataflow engine, and product graph.
 *
 * Persisted to `.pulse/current/PULSE_SCENARIO_EVIDENCE.json`.
 */

import * as path from 'path';
import { safeJoin } from './lib/safe-path';
import {
  extractRouteFromSurfaceId,
  isObservedHttpEntrypointMethod,
  isObservedMutatingMethod,
  toPlaywrightHttpMethod,
} from './dynamic-reality-grammar';
import { pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type {
  PulseProductCapability,
  PulseProductFlow,
  PulseProductGraph,
  PulseProductSurface,
} from './types';
import type { BehaviorGraph, BehaviorNode } from './types.behavior-graph';
import type { DataflowState, EntityLifecycle } from './types.dataflow-engine';
import type { HarnessEvidence, HarnessTarget } from './types.execution-harness';
import type {
  Scenario,
  ScenarioCategory,
  ScenarioEvidenceLink,
  ScenarioEvidenceState,
  ScenarioPrecondition,
  ScenarioRole,
  ScenarioStep,
  ScenarioStepKind,
  ScenarioStatus,
} from './types.scenario-engine';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_STEP_TIMEOUT = 15000;
const LONG_STEP_TIMEOUT = 30000;

const BEHAVIOR_GRAPH_FILENAME = 'PULSE_BEHAVIOR_GRAPH.json';
const DATAFLOW_STATE_FILENAME = 'PULSE_DATAFLOW_STATE.json';
const HARNESS_EVIDENCE_FILENAME = 'PULSE_HARNESS_EVIDENCE.json';
const PRODUCT_GRAPH_FILENAME = 'PULSE_PRODUCT_GRAPH.json';
const SCENARIO_EVIDENCE_FILENAME = 'PULSE_SCENARIO_EVIDENCE.json';

function resolveCategory(
  surface: PulseProductSurface | null,
  capabilities: PulseProductCapability[],
  flows: PulseProductFlow[],
  endpoints: BehaviorNode[],
): ScenarioCategory {
  if (!surface) return 'system-flow';
  if (flows.length > 0 || capabilities.some((capability) => capability.flowIds.length > 0)) {
    return endpoints.length > 0 ? 'interaction-flow' : 'runtime-flow';
  }
  return 'surface-map';
}

function resolveRole(
  surface: PulseProductSurface | null,
  endpoints: BehaviorNode[],
  capabilities: PulseProductCapability[],
): ScenarioRole {
  const discoveredTokens = [
    surface?.id,
    surface?.name,
    ...(surface?.artifactIds || []),
    ...(surface?.capabilities || []),
    ...capabilities.flatMap((capability) => [
      capability.id,
      capability.name,
      ...capability.artifactIds,
    ]),
    ...endpoints.map((endpoint) => endpoint.filePath),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (/\badmin\b/.test(discoveredTokens)) {
    return 'admin';
  }
  if (/\boperator\b/.test(discoveredTokens)) {
    return 'operator';
  }
  if (/\bproducer\b/.test(discoveredTokens)) {
    return 'producer';
  }
  if (/\baffiliate\b/.test(discoveredTokens)) {
    return 'affiliate';
  }
  if (/\bcustomer\b/.test(discoveredTokens)) {
    return 'customer';
  }
  if (
    endpoints.length === 0 &&
    capabilities.every((capability) => capability.truthMode !== 'observed')
  ) {
    return 'anonymous';
  }
  return 'anonymous';
}

// ─── Artifact Loaders ────────────────────────────────────────────────────────

function resolveArtifactPath(rootDir: string, fileName: string): string {
  const candidates = [
    path.join(rootDir, fileName),
    safeJoin(rootDir, '.pulse', 'current', fileName),
  ];
  for (const candidate of candidates) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }
  return safeJoin(rootDir, '.pulse', 'current', fileName);
}

function loadJsonArtifact<T>(rootDir: string, fileName: string): T | null {
  const filePath = resolveArtifactPath(rootDir, fileName);
  try {
    const raw = readJsonFile<T>(filePath);
    if (raw !== null && raw !== undefined) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

interface LoadedArtifacts {
  productGraph: PulseProductGraph | null;
  behaviorGraph: BehaviorGraph | null;
  harnessEvidence: HarnessEvidence | null;
  dataflowState: DataflowState | null;
}

function loadAllArtifacts(rootDir: string): LoadedArtifacts {
  return {
    productGraph: loadJsonArtifact<PulseProductGraph>(rootDir, PRODUCT_GRAPH_FILENAME),
    behaviorGraph: loadJsonArtifact<BehaviorGraph>(rootDir, BEHAVIOR_GRAPH_FILENAME),
    harnessEvidence: loadJsonArtifact<HarnessEvidence>(rootDir, HARNESS_EVIDENCE_FILENAME),
    dataflowState: loadJsonArtifact<DataflowState>(rootDir, DATAFLOW_STATE_FILENAME),
  };
}

// ─── Behavior Graph Queries ──────────────────────────────────────────────────

function tokenizeSurface(surface: PulseProductSurface): string[] {
  const raw = [surface.id, surface.name, ...surface.artifactIds, ...surface.capabilities].join(' ');
  return [...new Set(tokenizeScenarioText(raw).filter((token) => !isSurfaceHintNoiseToken(token)))];
}

function isSurfaceHintNoiseToken(token: string): boolean {
  return (
    token.length <= 2 ||
    [
      'api',
      'app',
      'backend',
      'component',
      'components',
      'controller',
      'controllers',
      'frontend',
      'lib',
      'page',
      'pages',
      'route',
      'routes',
      'service',
      'services',
      'src',
      'ts',
      'tsx',
      'js',
      'jsx',
    ].includes(token) ||
    isObservedHttpEntrypointMethod(token)
  );
}

function nodeMatchesSurface(node: BehaviorNode, surface: PulseProductSurface): boolean {
  const hints = tokenizeSurface(surface);
  if (hints.length === 0) return false;
  const lower = node.filePath.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

function getEndpointsForSurface(
  behaviorGraph: BehaviorGraph | null,
  surface: PulseProductSurface,
): BehaviorNode[] {
  if (!behaviorGraph) return [];
  return behaviorGraph.nodes.filter(
    (n) =>
      n.kind === 'api_endpoint' &&
      nodeMatchesSurface(n, surface) &&
      n.decorators.some(isObservedHttpEntrypointMethod),
  );
}

function getHttpDecorator(node: BehaviorNode): string {
  for (const d of node.decorators) {
    if (isObservedHttpEntrypointMethod(d)) {
      return d.toUpperCase();
    }
  }
  return 'GET';
}

function extractRoutePattern(node: BehaviorNode): string {
  const segments = node.filePath.split('/').filter(Boolean);
  const backendIndex = segments.indexOf('backend');
  const srcIndex = segments.indexOf('src');
  const controllerIndex = segments.findIndex((segment) => segment.endsWith('.controller.ts'));
  if (backendIndex >= 0 && srcIndex === backendIndex + 1 && controllerIndex > srcIndex + 1) {
    const segment = segments[srcIndex + 1];
    return `/api/${segment}`;
  }
  return '/api/';
}

// ─── Execution Harness Queries ───────────────────────────────────────────────

function getHarnessTargetsForSurface(
  harnessEvidence: HarnessEvidence | null,
  surface: PulseProductSurface,
): HarnessTarget[] {
  if (!harnessEvidence) return [];
  const hints = tokenizeSurface(surface);
  return harnessEvidence.targets.filter((t) => {
    const lower = (t.filePath + (t.routePattern || '')).toLowerCase();
    return hints.some((hint) => lower.includes(hint));
  });
}

function getHarnessFixtures(targets: HarnessTarget[]): string[] {
  const names = new Set<string>();
  for (const t of targets) {
    for (const f of t.fixtures) {
      names.add(f.name);
    }
  }
  return Array.from(names).slice(0, 5);
}

// ─── Dataflow Queries ────────────────────────────────────────────────────────

function getEntitiesForSurface(
  dataflowState: DataflowState | null,
  surface: PulseProductSurface,
): EntityLifecycle[] {
  if (!dataflowState) return [];
  const hints = tokenizeSurface(surface);
  return dataflowState.entities.filter((e) => {
    const lower = e.model.toLowerCase();
    return hints.some((hint) => lower.includes(hint));
  });
}

function getPrimaryEntity(entities: EntityLifecycle[]): EntityLifecycle | null {
  if (entities.length === 0) return null;
  const critical = entities.filter((e) => e.critical || e.financial);
  return critical.length > 0 ? critical[0] : entities[0];
}

function getEntityOperations(entity: EntityLifecycle | null): string[] {
  if (!entity) return [];
  const ops: string[] = [];
  if (entity.createdBy.length > 0) ops.push('create');
  if (entity.readBy.length > 0) ops.push('read');
  if (entity.updatedBy.length > 0) ops.push('update');
  if (entity.deletedBy.length > 0) ops.push('delete');
  return ops;
}

// ─── Surface / Capability Mappings ───────────────────────────────────────────

function getSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductSurface | null {
  return productGraph?.surfaces.find((s) => s.id === surfaceId) || null;
}

function getCapabilitiesForSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductCapability[] {
  if (!productGraph) return [];
  return productGraph.capabilities.filter((c) => c.surfaceId === surfaceId);
}

function getFlowsForSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductFlow[] {
  if (!productGraph) return [];
  const caps = new Set(
    productGraph.capabilities.filter((c) => c.surfaceId === surfaceId).map((c) => c.id),
  );
  return productGraph.flows.filter((f) => caps.has(f.entryCapability));
}

// ─── Playwright Spec Generation ──────────────────────────────────────────────

function generatePlaywrightSpec(scenario: {
  id: string;
  name: string;
  role: ScenarioRole;
  category: ScenarioCategory;
  steps: ScenarioStep[];
  preconditions: ScenarioPrecondition[];
}): string {
  const lines: string[] = [];
  lines.push(`// PULSE auto-generated Playwright spec — ${scenario.id}`);
  lines.push(`// Category: ${scenario.category}  Role: ${scenario.role}`);
  lines.push(`// Generated at: ${new Date().toISOString()}`);
  lines.push(`// Status: generated (pending staging execution)`);
  lines.push('');

  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push('');

  const fixtures = scenario.preconditions
    .filter((p) => p.fixture)
    .map((p) => p.fixture)
    .join(', ');
  const fixtureComment = fixtures ? ` // requires: ${fixtures}` : '';

  lines.push(`test.describe('${scenario.name}', () => {`);
  lines.push(`  test('${scenario.id}', async ({ page, request }) => {${fixtureComment}`);

  for (const step of scenario.steps) {
    switch (step.kind) {
      case 'login':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.goto('${step.target}');`);
        lines.push(
          `    await page.fill('input[name="email"]', process.env.TEST_EMAIL || 'pulse-test@example.invalid');`,
        );
        lines.push(
          `    await page.fill('input[name="password"]', process.env.TEST_PASSWORD || 'pulse-test-password');`,
        );
        lines.push(`    await page.click('button[type="submit"]');`);
        lines.push(`    await page.waitForURL('**/main/**', { timeout: ${step.timeout} });`);
        break;

      case 'navigate':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.goto('${step.target}');`);
        lines.push(`    await page.waitForLoadState('networkidle', { timeout: ${step.timeout} });`);
        break;

      case 'click':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.click('${step.target}');`);
        lines.push(`    await page.waitForTimeout(1000);`);
        break;

      case 'type':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.fill('${step.target}', 'pulse-test-value');`);
        lines.push(
          `    await expect(page.locator('${step.target}')).toHaveValue('pulse-test-value');`,
        );
        break;

      case 'submit':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.click('button[type="submit"]');`);
        lines.push(`    await page.waitForLoadState('networkidle', { timeout: ${step.timeout} });`);
        break;

      case 'api_call':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(
          `    const apiRes${step.order} = await request.${getHttpMethodForStep(step)}('${getApiPathForStep(step)}', {`,
        );
        lines.push(`      data: { /* pulse-test-payload */ },`);
        lines.push(`      failOnStatusCode: false,`);
        lines.push(`    });`);
        lines.push(`    expect(apiRes${step.order}.status()).toBe(200);`);
        break;

      case 'assert':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(
          `    await expect(page.locator('body')).not.toContainText('error', { timeout: ${step.timeout} });`,
        );
        break;

      case 'seed_db':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    // DB seed via API or direct fixture — executed by harness`);
        break;

      case 'cleanup':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    // Cleanup test data — executed by harness teardown`);
        break;

      case 'wait':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.waitForTimeout(${step.timeout});`);
        break;

      default:
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.waitForTimeout(${DEFAULT_STEP_TIMEOUT});`);
        break;
    }
  }

  lines.push(`  });`);
  lines.push(`});`);
  lines.push('');

  return lines.join('\n');
}

function getHttpMethodForStep(step: ScenarioStep): string {
  const method = step.target.trim().split(/\s+/)[0]?.toUpperCase();
  return toPlaywrightHttpMethod(method);
}

function getApiPathForStep(step: ScenarioStep): string {
  const [, ...pathParts] = step.target.trim().split(/\s+/);
  const apiPath = pathParts.join(' ');
  return apiPath.startsWith('/') ? apiPath : step.target;
}

// ─── Evidence Links ──────────────────────────────────────────────────────────

function buildEvidenceLinks(
  steps: ScenarioStep[],
  endpoints: BehaviorNode[],
  entity: EntityLifecycle | null,
): ScenarioEvidenceLink[] {
  const links: ScenarioEvidenceLink[] = [];

  for (const step of steps) {
    const link: ScenarioEvidenceLink = {};

    if (step.kind === 'navigate' || step.kind === 'click') {
      link.ui = step.target;
    }

    if (step.kind === 'api_call' && endpoints.length > 0) {
      const ep = endpoints[0];
      link.api = `${getHttpDecorator(ep)} ${extractRoutePattern(ep)}`;
    }

    if (step.kind === 'assert' && entity) {
      link.dbModel = entity.model;
      link.dbOperation = entity.createdBy.length > 0 ? 'create' : 'read';
    }

    if (step.kind === 'submit' || step.kind === 'api_call') {
      link.runtimeSignal = 'log.info | trace.span | metric.increment';
    }

    if (link.ui || link.api || link.dbModel || link.runtimeSignal) {
      links.push(link);
    }
  }

  return links;
}

// ─── Precondition Builders ───────────────────────────────────────────────────

function buildPreconditions(
  _category: ScenarioCategory,
  endpoints: BehaviorNode[],
  harnessTargets: HarnessTarget[],
  entity: EntityLifecycle | null,
): ScenarioPrecondition[] {
  const preconditions: ScenarioPrecondition[] = [];

  const needsRequestContext = endpoints.some((endpoint) =>
    endpoint.inputs.some((input) => input.kind === 'context' || input.kind === 'headers'),
  );
  if (needsRequestContext) {
    preconditions.push({
      description: 'Request context is required by discovered endpoint input metadata',
      workspaceState: 'runtime-context',
      fixture: 'pulse-auth-token',
    });
  }

  const fixtures = getHarnessFixtures(harnessTargets);
  for (const f of fixtures) {
    if (!preconditions.some((p) => p.fixture === f)) {
      preconditions.push({
        description: `Harness fixture required: ${f}`,
        fixture: f,
      });
    }
  }

  if (entity) {
    preconditions.push({
      description: `Entity '${entity.model}' exists in schema (migration applied)`,
      fixture: 'pulse-test-env',
    });
  }

  return preconditions;
}

// ─── Dynamic Step Generation ─────────────────────────────────────────────────

function buildStep(
  order: number,
  kind: ScenarioStepKind,
  description: string,
  target: string,
  expectedResult: string,
  timeout: number,
): ScenarioStep {
  return { order, kind, description, target, expectedResult, timeout };
}

interface DynamicScenarioPlan {
  needsLogin: boolean;
  needsActionClick: boolean;
  needsSubmit: boolean;
  needsAsyncWait: boolean;
  needsCleanup: boolean;
  needsSeedData: boolean;
  minInputSteps: number;
}

function collectScenarioTokens(
  ctx: ScenarioBuildContext,
  subFlowId: string,
): { text: string; tokens: Set<string> } {
  const surface = getSurface(ctx.productGraph, ctx.primarySurfaceId);
  const capabilities = getCapabilitiesForSurface(ctx.productGraph, ctx.primarySurfaceId);
  const raw = [
    subFlowId,
    ctx.primarySurfaceId,
    surface?.id,
    surface?.name,
    surface?.description,
    ...(surface?.artifactIds || []),
    ...(surface?.capabilities || []),
    ...capabilities.flatMap((capability) => [
      capability.id,
      capability.name,
      ...capability.artifactIds,
      ...capability.flowIds,
      ...capability.blockers,
    ]),
    ...ctx.endpoints.flatMap((endpoint) => [
      endpoint.name,
      endpoint.filePath,
      endpoint.docComment,
      ...endpoint.inputs.map((input) => input.name),
      ...endpoint.outputs.map((output) => output.target),
      ...endpoint.stateAccess.map((access) => access.model),
      ...endpoint.externalCalls.map((call) => `${call.provider} ${call.operation}`),
    ]),
    ...ctx.entities.map((entity) => entity.model),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return {
    text: raw,
    tokens: new Set(tokenizeScenarioText(raw).filter((token) => token.length > 1)),
  };
}

function tokenizeScenarioText(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const char of value.toLowerCase()) {
    const isDigit = char >= '0' && char <= '9';
    const isLetter = char >= 'a' && char <= 'z';
    if (isDigit || isLetter) {
      current += char;
      continue;
    }
    if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function hasAnyScenarioToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
}

function buildDynamicScenarioPlan(
  ctx: ScenarioBuildContext,
  subFlowId: string,
): DynamicScenarioPlan {
  const { tokens } = collectScenarioTokens(ctx, subFlowId);
  const hasMutation = ctx.endpoints.some(
    (endpoint) =>
      isObservedMutatingMethod(getHttpDecorator(endpoint)) ||
      endpoint.outputs.some((output) => output.kind === 'db_write') ||
      endpoint.stateAccess.some((access) => access.operation !== 'read'),
  );
  const hasExternalAsync = ctx.endpoints.some(
    (endpoint) =>
      endpoint.externalCalls.length > 0 ||
      endpoint.outputs.some((output) => output.kind === 'event' || output.kind === 'queue_message'),
  );
  const needsRequestContext = ctx.endpoints.some((endpoint) =>
    endpoint.inputs.some((input) => input.kind === 'context' || input.kind === 'headers'),
  );
  const isAuthEntry = hasAnyScenarioToken(tokens, [
    'auth',
    'login',
    'signup',
    'signin',
    'register',
    'oauth',
    'token',
    'session',
    'password',
  ]);
  const isFinancial =
    ctx.primaryEntity?.financial === true ||
    hasAnyScenarioToken(tokens, [
      'amount',
      'price',
      'balance',
      'currency',
      'ledger',
      'wallet',
      'checkout',
      'payment',
      'payout',
      'refund',
      'subscription',
      'order',
      'invoice',
    ]);
  const isMessaging = hasAnyScenarioToken(tokens, [
    'whatsapp',
    'message',
    'inbox',
    'webhook',
    'qr',
    'session',
    'provider',
    'phone',
  ]);
  const isWorkspaceMutation =
    hasAnyScenarioToken(tokens, [
      'workspace',
      'tenant',
      'member',
      'invite',
      'settings',
      'account',
    ]) && hasMutation;
  const isProductMutation =
    hasAnyScenarioToken(tokens, ['product', 'catalog', 'sku', 'item', 'offer', 'checkout']) &&
    hasMutation;
  const isConnectionFlow = hasExternalAsync && (hasMutation || needsRequestContext);

  return {
    needsLogin:
      needsRequestContext ||
      (!isAuthEntry &&
        (hasMutation || isFinancial || isMessaging || isWorkspaceMutation || isProductMutation)),
    needsActionClick:
      hasMutation || isConnectionFlow || tokens.has('send') || tokens.has('receive'),
    needsSubmit: hasMutation || isAuthEntry || isConnectionFlow,
    needsAsyncWait: hasExternalAsync || isMessaging || isConnectionFlow,
    needsCleanup:
      hasMutation || isFinancial || isMessaging || isWorkspaceMutation || isProductMutation,
    needsSeedData: isFinancial || isProductMutation || isWorkspaceMutation,
    minInputSteps:
      isFinancial || isProductMutation
        ? 3
        : isAuthEntry || isWorkspaceMutation || isMessaging
          ? 2
          : 1,
  };
}

function normalizeSelectorToken(inputName: string, fallbackIndex: number): string {
  const trimmed = inputName.trim();
  if (isStableSelectorToken(trimmed)) {
    return trimmed;
  }
  const normalized = normalizeSelectorCharacters(trimmed).slice(0, 48);
  return normalized || `pulse-field-${fallbackIndex}`;
}

function isStableSelectorToken(value: string): boolean {
  if (value.length === 0 || value.length > 80 || !isAsciiLetter(value[0])) {
    return false;
  }
  return value
    .split('')
    .every(
      (char) =>
        isAsciiLetter(char) ||
        (char >= '0' && char <= '9') ||
        char === '_' ||
        char === '.' ||
        char === ':' ||
        char === '-',
    );
}

function normalizeSelectorCharacters(value: string): string {
  const output: string[] = [];
  for (const char of value) {
    const isLetter = isAsciiLetter(char);
    const isDigit = char >= '0' && char <= '9';
    if (isLetter || isDigit || char === '_' || char === '-') {
      output.push(char.toLowerCase());
      continue;
    }
    if (output.length > 0 && output[output.length - 1] !== '-') {
      output.push('-');
    }
  }
  while (output[0] === '-') {
    output.shift();
  }
  while (output[output.length - 1] === '-') {
    output.pop();
  }
  return output.join('');
}

function isAsciiLetter(char: string): boolean {
  const lower = char.toLowerCase();
  return lower >= 'a' && lower <= 'z';
}

function buildInputSelector(inputName: string, fallbackIndex: number): string {
  const token = normalizeSelectorToken(inputName, fallbackIndex);
  return `[name="${token}"], [data-testid="${token}"]`;
}

function generateStepsForSubFlow(
  category: ScenarioCategory,
  subFlowId: string,
  primarySurfaceId: string,
  endpoints: BehaviorNode[],
  ctx: ScenarioBuildContext,
): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  let order = 0;
  const plan = buildDynamicScenarioPlan(ctx, subFlowId);

  const routeFromSurface = extractRouteFromSurfaceId(primarySurfaceId);
  const routeFromEndpoint =
    endpoints.length > 0 ? extractRoutePattern(endpoints[0]) : routeFromSurface;
  const needsContext = endpoints.some((endpoint) =>
    endpoint.inputs.some((input) => input.kind === 'context' || input.kind === 'headers'),
  );

  if (needsContext || plan.needsLogin) {
    steps.push(
      buildStep(
        order++,
        'login',
        needsContext
          ? 'Authenticate because discovered endpoint input requires request context or headers'
          : 'Authenticate because discovered scenario evidence requires protected runtime state',
        routeFromSurface,
        'Session context is available to downstream steps',
        LONG_STEP_TIMEOUT,
      ),
    );
  }

  if (plan.needsSeedData) {
    steps.push(
      buildStep(
        order++,
        'seed_db',
        'Prepare isolated fixture state required by discovered data dependencies',
        routeFromEndpoint,
        'Required fixture data exists in isolated test scope',
        LONG_STEP_TIMEOUT,
      ),
    );
  }

  steps.push(
    buildStep(
      order++,
      'navigate',
      `Navigate to discovered surface for ${subFlowId}`,
      routeFromSurface,
      'Surface loads without client/runtime error',
      DEFAULT_STEP_TIMEOUT,
    ),
  );

  const inputNames = [
    ...new Set(
      endpoints
        .flatMap((endpoint) => endpoint.inputs)
        .filter(
          (input) => input.kind === 'body' || input.kind === 'query' || input.kind === 'params',
        )
        .map((input) => input.name)
        .filter(Boolean),
    ),
  ];

  const selectedInputs =
    inputNames.length > 0
      ? inputNames.slice(0, Math.max(plan.minInputSteps, Math.min(inputNames.length, 5)))
      : Array.from({ length: plan.minInputSteps }, (_, index) => `pulseField${index + 1}`);

  for (const [index, inputName] of selectedInputs.entries()) {
    steps.push(
      buildStep(
        order++,
        'type',
        `Fill discovered input ${inputName}`,
        buildInputSelector(inputName, index),
        'Field accepts generated input or reports validation error explicitly',
        DEFAULT_STEP_TIMEOUT,
      ),
    );
  }

  if (plan.needsActionClick) {
    steps.push(
      buildStep(
        order++,
        'click',
        `Trigger discovered action for ${subFlowId}`,
        `[data-pulse-action="${normalizeSelectorToken(subFlowId, order)}"], button[type="submit"]`,
        'Action is dispatched through the discovered user-facing path',
        DEFAULT_STEP_TIMEOUT,
      ),
    );
  }

  if (plan.needsSubmit) {
    steps.push(
      buildStep(
        order++,
        'submit',
        `Submit discovered state transition for ${subFlowId}`,
        'button[type="submit"]',
        'Mutation request is sent and classified without fake success fallback',
        LONG_STEP_TIMEOUT,
      ),
    );
  }

  const apiTargets = endpoints.length > 0 ? endpoints.slice(0, 3) : [];
  for (const endpoint of apiTargets) {
    steps.push(
      buildStep(
        order++,
        'api_call',
        `Verify discovered endpoint ${endpoint.name}`,
        `${getHttpDecorator(endpoint)} ${extractRoutePattern(endpoint)}`,
        'Endpoint returns a classified response and no unhandled exception',
        DEFAULT_STEP_TIMEOUT,
      ),
    );
  }

  if (plan.needsAsyncWait) {
    steps.push(
      buildStep(
        order++,
        'wait',
        `Wait for async/provider evidence for ${subFlowId}`,
        routeFromEndpoint,
        'Asynchronous provider, queue, webhook, or session evidence settles',
        LONG_STEP_TIMEOUT,
      ),
    );
  }

  steps.push(
    buildStep(
      order++,
      'assert',
      `Assert ${category} evidence for ${subFlowId}`,
      routeFromEndpoint,
      'UI/API/runtime evidence can be linked back to the discovered flow',
      DEFAULT_STEP_TIMEOUT,
    ),
  );

  if (plan.needsCleanup) {
    steps.push(
      buildStep(
        order++,
        'cleanup',
        'Rollback state created by discovered write path',
        routeFromEndpoint,
        'Test-created state is removed or isolated',
        DEFAULT_STEP_TIMEOUT,
      ),
    );
  }

  return steps;
}

// ─── Scenario Builder ────────────────────────────────────────────────────────

/**
 * Context passed to each scenario generator, containing resolved artifacts.
 */
interface ScenarioBuildContext {
  category: ScenarioCategory;
  primarySurfaceId: string;
  role: ScenarioRole;
  productGraph: PulseProductGraph | null;
  behaviorGraph: BehaviorGraph | null;
  harnessEvidence: HarnessEvidence | null;
  dataflowState: DataflowState | null;
  endpoints: BehaviorNode[];
  harnessTargets: HarnessTarget[];
  entities: EntityLifecycle[];
  primaryEntity: EntityLifecycle | null;
}

function resolveScenarioBuildContext(
  surface: PulseProductSurface,
  artifacts: LoadedArtifacts,
): ScenarioBuildContext {
  const capabilities = getCapabilitiesForSurface(artifacts.productGraph, surface.id);
  const flows = getFlowsForSurface(artifacts.productGraph, surface.id);
  const endpoints = getEndpointsForSurface(artifacts.behaviorGraph, surface);
  const category = resolveCategory(surface, capabilities, flows, endpoints);
  const harnessTargets = getHarnessTargetsForSurface(artifacts.harnessEvidence, surface);
  const entities = getEntitiesForSurface(artifacts.dataflowState, surface);
  const primaryEntity = getPrimaryEntity(entities);
  const role = resolveRole(surface, endpoints, capabilities);

  return {
    category,
    primarySurfaceId: surface.id,
    role,
    productGraph: artifacts.productGraph,
    behaviorGraph: artifacts.behaviorGraph,
    harnessEvidence: artifacts.harnessEvidence,
    dataflowState: artifacts.dataflowState,
    endpoints,
    harnessTargets,
    entities,
    primaryEntity,
  };
}

function buildScenario(
  id: string,
  name: string,
  subFlowId: string,
  ctx: ScenarioBuildContext,
): Scenario {
  const steps = generateStepsForSubFlow(
    ctx.category,
    subFlowId,
    ctx.primarySurfaceId,
    ctx.endpoints,
    ctx,
  );

  const preconditions = buildPreconditions(
    ctx.category,
    ctx.endpoints,
    ctx.harnessTargets,
    ctx.primaryEntity,
  );

  const capabilities = getCapabilitiesForSurface(ctx.productGraph, ctx.primarySurfaceId);
  const capabilityIds = capabilities.map((c) => c.id);
  const entityOps = getEntityOperations(ctx.primaryEntity);

  const evidenceLinks = buildEvidenceLinks(steps, ctx.endpoints, ctx.primaryEntity);

  const scenario: Scenario = {
    id,
    name,
    role: ctx.role,
    flowId: `${ctx.primarySurfaceId}/${subFlowId}`,
    category: ctx.category,
    capabilityIds,
    preconditions,
    steps,
    status: 'not_run' as ScenarioStatus,
    lastRun: null,
    durationMs: null,
    evidence: [],
  };

  if (evidenceLinks.length > 0) {
    scenario.evidenceLinks = evidenceLinks;
  }

  const spec = generatePlaywrightSpec({
    id,
    name,
    role: ctx.role,
    category: ctx.category,
    steps,
    preconditions,
  });
  scenario.playwrightSpec = spec;

  return scenario;
}

// ─── Summary Computation ─────────────────────────────────────────────────────

interface ScenarioSummary {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  generated: number;
  coreScenarios: number;
  coreScenariosPassed: number;
  byCategory: Record<string, { total: number; passed: number; failed: number; notRun: number }>;
}

function computeSummary(scenarios: Scenario[]): ScenarioSummary {
  const total = scenarios.length;
  const passed = scenarios.filter((s) => s.status === 'passed').length;
  const failed = scenarios.filter((s) => s.status === 'failed').length;
  const notRun = scenarios.filter((s) => s.status === 'not_run').length;
  const generated = scenarios.filter((s) => s.playwrightSpec != null).length;
  const coreScenarios = scenarios.filter((s) => s.preconditions.length > 0 || s.steps.length > 2);
  const coreScenariosPassed = coreScenarios.filter((s) => s.status === 'passed').length;

  const byCategory: Record<
    string,
    { total: number; passed: number; failed: number; notRun: number }
  > = {};
  for (const s of scenarios) {
    const cat = s.category || 'unknown';
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, passed: 0, failed: 0, notRun: 0 };
    }
    byCategory[cat].total++;
    if (s.status === 'passed') byCategory[cat].passed++;
    else if (s.status === 'failed') byCategory[cat].failed++;
    else byCategory[cat].notRun++;
  }

  return {
    total,
    passed,
    failed,
    notRun,
    generated,
    coreScenarios: coreScenarios.length,
    coreScenariosPassed,
    byCategory,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the full scenario catalog for every core product flow.
 *
 * Reads the behavior graph, product graph, execution harness, and dataflow
 * engine from `.pulse/current/`, generates executable scenario definitions
 * with concrete steps and Playwright-compatible spec strings, and persists
 * the result to `.pulse/current/PULSE_SCENARIO_EVIDENCE.json`.
 *
 * @param rootDir - Repo root directory.
 * @returns The generated scenario evidence state.
 */
export function buildScenarioCatalog(rootDir: string): ScenarioEvidenceState {
  const artifacts = loadAllArtifacts(rootDir);

  const allScenarios: Scenario[] = [];
  const productGraph = artifacts.productGraph;

  if (productGraph) {
    for (const surface of productGraph.surfaces) {
      const ctx = resolveScenarioBuildContext(surface, artifacts);
      const flows = getFlowsForSurface(productGraph, surface.id);

      if (flows.length === 0) {
        allScenarios.push(
          buildScenario(`surface-${surface.id}`, `Surface Map: ${surface.name}`, 'surface-map', {
            ...ctx,
            category: 'surface-map',
          }),
        );
        continue;
      }

      for (const flow of flows) {
        allScenarios.push(buildScenario(flow.id, flow.name, flow.id, ctx));
      }
    }
  }

  const state: ScenarioEvidenceState = {
    generatedAt: new Date().toISOString(),
    summary: computeSummary(allScenarios),
    scenarios: allScenarios,
  };

  const outputPath = resolveArtifactPath(rootDir, SCENARIO_EVIDENCE_FILENAME);
  writeTextFile(outputPath, JSON.stringify(state, null, 2));

  return state;
}
