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

/** Surface IDs that map to scenario categories (excluding surface-map/system categories). */
const CATEGORY_SURFACE_MAP: Record<ScenarioCategory, string[]> = {
  'auth-flow': ['auth'],
  'payment-flow': ['payments', 'billing', 'wallet'],
  'whatsapp-flow': ['whatsapp', 'inbox'],
  'workspace-flow': ['workspace', 'settings'],
  'product-flow': ['products'],
  'surface-map': [],
  'system-flow': [],
};

/** Core (critical) scenario IDs — must pass for certification. */
const CORE_SCENARIO_GROUPS = new Set([
  'auth-login',
  'auth-signup',
  'payment-checkout',
  'whatsapp-connect',
  'workspace-create',
]);

/** Flow-to-category mapping derived from surface IDs. */
function resolveCategory(surfaceId: string): ScenarioCategory {
  for (const [category, surfaces] of Object.entries(CATEGORY_SURFACE_MAP)) {
    if (surfaces.includes(surfaceId)) {
      return category as ScenarioCategory;
    }
  }
  if (surfaceId === 'admin' || surfaceId === 'analytics' || surfaceId === 'crm') {
    return 'surface-map';
  }
  return 'system-flow';
}

/** Flow-to-role mapping by surface. */
const SURFACE_ROLE_MAP: Record<string, ScenarioRole> = {
  auth: 'anonymous',
  workspace: 'admin',
  billing: 'customer',
  wallet: 'admin',
  payments: 'customer',
  whatsapp: 'admin',
  inbox: 'customer',
  crm: 'operator',
  products: 'customer',
  settings: 'admin',
  admin: 'admin',
  analytics: 'operator',
};

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

/** Keywords in file paths that suggest a surface. */
const SURFACE_PATH_HINTS: Record<string, string[]> = {
  auth: ['auth', 'login', 'signup', 'register', 'password', 'token', 'session', 'magic-link'],
  payments: ['payment', 'checkout', 'order', 'billing', 'plan', 'subscription', 'refund'],
  whatsapp: ['whatsapp', 'meta', 'waba', 'wa-', 'whatsapp-'],
  workspace: ['workspace', 'invite', 'member', 'tenant'],
  products: ['product', 'catalog', 'item'],
  wallet: ['wallet', 'ledger', 'balance', 'withdraw', 'kyc', 'bank'],
};

function nodeMatchesSurface(node: BehaviorNode, surfaceId: string): boolean {
  const hints = SURFACE_PATH_HINTS[surfaceId];
  if (!hints) return false;
  const lower = node.filePath.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

function getEndpointsForSurface(
  behaviorGraph: BehaviorGraph | null,
  surfaceId: string,
): BehaviorNode[] {
  if (!behaviorGraph) return [];
  return behaviorGraph.nodes.filter(
    (n) =>
      n.kind === 'api_endpoint' &&
      nodeMatchesSurface(n, surfaceId) &&
      n.decorators.some((d) => ['Get', 'Post', 'Put', 'Patch', 'Delete'].includes(d)),
  );
}

function getHttpDecorator(node: BehaviorNode): string {
  for (const d of node.decorators) {
    if (['Get', 'Post', 'Put', 'Patch', 'Delete'].includes(d)) {
      return d;
    }
  }
  return 'Get';
}

function extractRoutePattern(node: BehaviorNode): string {
  const match = node.filePath.match(/backend\/src\/(.+?)\/(.+?)\.controller\.ts/);
  if (match) {
    const segment = match[1];
    return `/api/${segment}`;
  }
  return '/api/';
}

// ─── Execution Harness Queries ───────────────────────────────────────────────

function getHarnessTargetsForSurface(
  harnessEvidence: HarnessEvidence | null,
  surfaceId: string,
): HarnessTarget[] {
  if (!harnessEvidence) return [];
  return harnessEvidence.targets.filter((t) => {
    const lower = (t.filePath + (t.routePattern || '')).toLowerCase();
    const hints = SURFACE_PATH_HINTS[surfaceId] || [];
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
  surfaceId: string,
): EntityLifecycle[] {
  if (!dataflowState) return [];
  const hints = SURFACE_PATH_HINTS[surfaceId] || [];
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
          `    await page.fill('input[name="email"]', process.env.TEST_EMAIL || 'pulse-test@kloel.com');`,
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
          `    const apiRes = await request.${getHttpMethodForStep(step)}('${step.target}', {`,
        );
        lines.push(`      data: { /* pulse-test-payload */ },`);
        lines.push(`      failOnStatusCode: false,`);
        lines.push(`    });`);
        lines.push(`    expect(apiRes.status()).toBe(200);`);
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
  if (step.target.startsWith('POST')) return 'post';
  if (step.target.startsWith('PUT')) return 'put';
  if (step.target.startsWith('PATCH')) return 'patch';
  if (step.target.startsWith('DELETE')) return 'delete';
  return 'get';
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
  category: ScenarioCategory,
  endpoints: BehaviorNode[],
  harnessTargets: HarnessTarget[],
  entity: EntityLifecycle | null,
): ScenarioPrecondition[] {
  const preconditions: ScenarioPrecondition[] = [];

  if (category === 'auth-flow') {
    preconditions.push({
      description: 'No active session; fresh browser context',
      workspaceState: 'none',
    });
    preconditions.push({
      description: 'Test user email not already registered',
      fixture: 'pulse-test-env',
    });
  }

  if (category === 'payment-flow') {
    preconditions.push({
      description: 'Customer authenticated with valid session',
      workspaceState: 'customer-workspace',
      fixture: 'pulse-auth-token',
    });
    preconditions.push({
      description: 'Product catalog has at least one active item',
      fixture: 'pulse-db-seed',
    });
  }

  if (category === 'whatsapp-flow') {
    preconditions.push({
      description: 'WhatsApp session configured and connected',
      workspaceState: 'admin-workspace',
      fixture: 'pulse-auth-token',
    });
  }

  if (category === 'workspace-flow') {
    preconditions.push({
      description: 'Admin authenticated with valid session',
      workspaceState: 'admin-workspace',
      fixture: 'pulse-auth-token',
    });
  }

  if (category === 'product-flow') {
    preconditions.push({
      description: 'Customer or admin authenticated',
      workspaceState: 'customer-workspace',
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

// ─── Step Generation Per Category ────────────────────────────────────────────

interface StepPlan {
  kinds: ScenarioStepKind[];
  loginNeeded: boolean;
}

const CATEGORY_STEP_PLANS: Record<ScenarioCategory, Record<string, StepPlan>> = {
  'auth-flow': {
    login: {
      kinds: ['navigate', 'type', 'type', 'submit', 'assert', 'cleanup'],
      loginNeeded: false,
    },
    signup: {
      kinds: ['navigate', 'type', 'type', 'type', 'submit', 'assert', 'cleanup'],
      loginNeeded: false,
    },
    oauth: {
      kinds: ['navigate', 'click', 'wait', 'assert', 'cleanup'],
      loginNeeded: false,
    },
    'magic-link': {
      kinds: ['navigate', 'type', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: false,
    },
    'password-reset': {
      kinds: ['navigate', 'type', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: false,
    },
  },
  'payment-flow': {
    checkout: {
      kinds: ['login', 'navigate', 'click', 'type', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
    payment: {
      kinds: ['login', 'navigate', 'click', 'type', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
    subscription: {
      kinds: ['login', 'navigate', 'click', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
    refund: {
      kinds: ['login', 'navigate', 'click', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
  },
  'whatsapp-flow': {
    connect: {
      kinds: ['login', 'navigate', 'click', 'wait', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
    disconnect: {
      kinds: ['login', 'navigate', 'click', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
    'send-message': {
      kinds: ['login', 'navigate', 'click', 'type', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
    'receive-message': {
      kinds: ['login', 'navigate', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
  },
  'workspace-flow': {
    create: {
      kinds: ['login', 'navigate', 'type', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
    invite: {
      kinds: ['login', 'navigate', 'click', 'type', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
    'settings-change': {
      kinds: ['login', 'navigate', 'click', 'type', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
  },
  'product-flow': {
    create: {
      kinds: [
        'login',
        'navigate',
        'click',
        'type',
        'type',
        'type',
        'submit',
        'api_call',
        'assert',
        'cleanup',
      ],
      loginNeeded: true,
    },
    edit: {
      kinds: ['login', 'navigate', 'click', 'type', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
    delete: {
      kinds: ['login', 'navigate', 'click', 'submit', 'api_call', 'assert', 'cleanup'],
      loginNeeded: true,
    },
  },
  'surface-map': {},
  'system-flow': {},
};

interface StepTargetTemplate {
  navigate?: string;
  type?: string;
  click?: string;
  submit?: string;
  api_call?: string;
}

const SURFACE_TARGET_TEMPLATES: Record<string, StepTargetTemplate> = {
  auth: {
    navigate: '/auth/login',
    type: 'input[name="email"]',
    click: 'button[data-testid="oauth-google"]',
    submit: 'button[type="submit"]',
    api_call: 'POST /api/auth/login',
  },
  payments: {
    navigate: '/checkout',
    type: 'input[name="card-number"]',
    click: 'button[data-testid="checkout"]',
    submit: 'button[type="submit"]',
    api_call: 'POST /api/payments/create',
  },
  billing: {
    navigate: '/billing',
    type: 'input[name="plan"]',
    click: 'button[data-testid="subscribe"]',
    submit: 'button[type="submit"]',
    api_call: 'POST /api/billing/subscribe',
  },
  wallet: {
    navigate: '/wallet',
    type: 'input[name="amount"]',
    click: 'button[data-testid="withdraw"]',
    submit: 'button[type="submit"]',
    api_call: 'POST /api/wallet/withdraw',
  },
  whatsapp: {
    navigate: '/whatsapp',
    type: 'input[name="phone-number"]',
    click: 'button[data-testid="connect-whatsapp"]',
    submit: 'button[type="submit"]',
    api_call: 'POST /api/meta/auth',
  },
  inbox: {
    navigate: '/inbox',
    type: 'textarea[name="message"]',
    click: 'button[data-testid="send"]',
    submit: 'button[type="submit"]',
    api_call: 'POST /api/messages/send',
  },
  workspace: {
    navigate: '/workspace',
    type: 'input[name="workspace-name"]',
    click: 'button[data-testid="create-workspace"]',
    submit: 'button[type="submit"]',
    api_call: 'POST /api/workspace',
  },
  settings: {
    navigate: '/settings',
    type: 'input[name="setting-value"]',
    click: 'button[data-testid="save-settings"]',
    submit: 'button[type="submit"]',
    api_call: 'PATCH /api/admin/settings',
  },
  products: {
    navigate: '/products',
    type: 'input[name="product-name"]',
    click: 'button[data-testid="add-product"]',
    submit: 'button[type="submit"]',
    api_call: 'POST /api/products',
  },
};

function getTargetTemplate(surfaceId: string): StepTargetTemplate {
  return (
    SURFACE_TARGET_TEMPLATES[surfaceId] || {
      navigate: '/',
      type: 'input[data-testid="field"]',
      click: 'button[data-testid="submit"]',
      submit: 'button[type="submit"]',
      api_call: 'GET /api/',
    }
  );
}

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

/** Sub-flow specific target templates for richer Playwright specs. */
const SUBFLOW_TARGETS: Record<string, { typeTargets: string[]; extraDescription: string }> = {
  login: {
    typeTargets: ['input[name="email"]', 'input[name="password"]'],
    extraDescription: 'email and password',
  },
  signup: {
    typeTargets: [
      'input[name="email"]',
      'input[name="password"]',
      'input[name="confirm-password"]',
    ],
    extraDescription: 'registration fields',
  },
  'password-reset': { typeTargets: ['input[name="email"]'], extraDescription: 'email address' },
  'magic-link': { typeTargets: ['input[name="email"]'], extraDescription: 'email address' },
  checkout: {
    typeTargets: ['input[name="card-number"]', 'input[name="expiry"]', 'input[name="cvc"]'],
    extraDescription: 'payment details',
  },
  payment: { typeTargets: ['input[name="amount"]'], extraDescription: 'payment amount' },
  'send-message': {
    typeTargets: ['textarea[name="message"]'],
    extraDescription: 'message content',
  },
  create: {
    typeTargets: [
      'input[name="product-name"]',
      'input[name="price"]',
      'textarea[name="description"]',
    ],
    extraDescription: 'product details',
  },
  edit: { typeTargets: ['input[name="product-name"]'], extraDescription: 'updated fields' },
  invite: { typeTargets: ['input[name="email"]'], extraDescription: 'invitee email' },
  'settings-change': {
    typeTargets: ['input[name="setting-value"]'],
    extraDescription: 'setting value',
  },
};

function generateStepsForSubFlow(
  category: ScenarioCategory,
  subFlowId: string,
  primarySurfaceId: string,
  endpoints: BehaviorNode[],
): ScenarioStep[] {
  const plan = CATEGORY_STEP_PLANS[category]?.[subFlowId];
  if (!plan) {
    return [
      buildStep(
        0,
        'login',
        'Authenticate',
        '/auth/login',
        'Session token obtained',
        LONG_STEP_TIMEOUT,
      ),
      buildStep(1, 'navigate', 'Navigate to page', '/', 'Page loads', DEFAULT_STEP_TIMEOUT),
      buildStep(2, 'assert', 'Verify no errors', 'body', 'No error shown', DEFAULT_STEP_TIMEOUT),
    ];
  }

  const template = getTargetTemplate(primarySurfaceId);
  const subTargets = SUBFLOW_TARGETS[subFlowId];
  const steps: ScenarioStep[] = [];
  let order = 0;
  let typeIndex = 0;

  const bestEp = endpoints.length > 0 ? endpoints[0] : null;
  const apiTarget = bestEp
    ? `${getHttpDecorator(bestEp)} ${extractRoutePattern(bestEp)}`
    : template.api_call || 'GET /api/';

  for (const kind of plan.kinds) {
    switch (kind) {
      case 'login':
        steps.push(
          buildStep(
            order++,
            'login',
            'Authenticate with valid credentials',
            template.navigate || '/auth/login',
            'Session token returned and stored',
            LONG_STEP_TIMEOUT,
          ),
        );
        break;

      case 'navigate':
        steps.push(
          buildStep(
            order++,
            'navigate',
            `Navigate to ${subFlowId} page`,
            template.navigate || '/',
            'Feature page loads without error',
            DEFAULT_STEP_TIMEOUT,
          ),
        );
        break;

      case 'type': {
        let target: string;
        let desc: string;
        if (subTargets && typeIndex < subTargets.typeTargets.length) {
          target = subTargets.typeTargets[typeIndex++];
          desc = `Fill field: ${target}`;
        } else {
          target = template.type || 'input[data-testid="field"]';
          desc = `Fill form field`;
        }
        steps.push(
          buildStep(
            order++,
            'type',
            desc,
            target,
            'Field accepts input and passes validation',
            DEFAULT_STEP_TIMEOUT,
          ),
        );
        break;
      }

      case 'click':
        steps.push(
          buildStep(
            order++,
            'click',
            `Click ${subFlowId} action button`,
            template.click || 'button[data-testid="submit"]',
            'Action triggered and UI responds',
            DEFAULT_STEP_TIMEOUT,
          ),
        );
        break;

      case 'submit':
        steps.push(
          buildStep(
            order++,
            'submit',
            'Submit the form',
            template.submit || 'button[type="submit"]',
            'Form submits without validation errors, redirect or toast appears',
            LONG_STEP_TIMEOUT,
          ),
        );
        break;

      case 'api_call':
        steps.push(
          buildStep(
            order++,
            'api_call',
            'Verify API endpoint responds correctly',
            apiTarget,
            'HTTP 200 with valid response body and correct content-type',
            DEFAULT_STEP_TIMEOUT,
          ),
        );
        break;

      case 'wait':
        steps.push(
          buildStep(
            order++,
            'wait',
            'Wait for async operation to complete',
            'observability',
            'Queue processed, callback received',
            LONG_STEP_TIMEOUT,
          ),
        );
        break;

      case 'assert':
        steps.push(
          buildStep(
            order++,
            'assert',
            `Assert ${subFlowId} outcome persisted correctly`,
            'db',
            'Related row(s) exist with expected state, no unexpected side effects',
            DEFAULT_STEP_TIMEOUT,
          ),
        );
        break;

      case 'seed_db':
        steps.push(
          buildStep(
            order++,
            'seed_db',
            'Seed database with test fixture data',
            'db',
            'Test rows inserted without constraint violations',
            LONG_STEP_TIMEOUT,
          ),
        );
        break;

      case 'cleanup':
        steps.push(
          buildStep(
            order++,
            'cleanup',
            'Rollback test data and restore clean state',
            'db',
            'All test-created rows removed, no FK leaks',
            DEFAULT_STEP_TIMEOUT,
          ),
        );
        break;

      default:
        steps.push(
          buildStep(
            order++,
            'assert',
            `Unknown step kind: ${kind}`,
            'body',
            'Step completes',
            DEFAULT_STEP_TIMEOUT,
          ),
        );
        break;
    }
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
  category: ScenarioCategory,
  artifacts: LoadedArtifacts,
): ScenarioBuildContext {
  const surfaces = CATEGORY_SURFACE_MAP[category] || [];
  const primarySurfaceId = surfaces[0] || 'unknown';
  const role = SURFACE_ROLE_MAP[primarySurfaceId] || 'customer';

  const endpoints = surfaces.flatMap((sid) => getEndpointsForSurface(artifacts.behaviorGraph, sid));
  const harnessTargets = surfaces.flatMap((sid) =>
    getHarnessTargetsForSurface(artifacts.harnessEvidence, sid),
  );
  const entities = surfaces.flatMap((sid) => getEntitiesForSurface(artifacts.dataflowState, sid));
  const primaryEntity = getPrimaryEntity(entities);

  return {
    category,
    primarySurfaceId,
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
  );

  const preconditions = buildPreconditions(
    ctx.category,
    ctx.endpoints,
    ctx.harnessTargets,
    ctx.primaryEntity,
  );

  const surface = getSurface(ctx.productGraph, ctx.primarySurfaceId);
  const capabilities = getCapabilitiesForSurface(ctx.productGraph, ctx.primarySurfaceId);
  const capabilityIds = capabilities.map((c) => c.id);
  const entityOps = getEntityOperations(ctx.primaryEntity);

  const evidenceLinks = buildEvidenceLinks(steps, ctx.endpoints, ctx.primaryEntity);

  const isCore = CORE_SCENARIO_GROUPS.has(id);

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
    evidence: [
      SCENARIO_EVIDENCE_FILENAME,
      ...(surface?.artifactIds || []).filter((a) => !a.includes(':')).slice(0, 5),
    ],
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

// ─── Category Scenario Generators ────────────────────────────────────────────

function generateAuthScenarios(ctx: ScenarioBuildContext): Scenario[] {
  const subFlows = [
    { id: 'auth-login', name: 'Auth: Login', subFlowId: 'login' },
    { id: 'auth-signup', name: 'Auth: Signup / Registration', subFlowId: 'signup' },
    { id: 'auth-oauth', name: 'Auth: OAuth (Google/Facebook/Apple)', subFlowId: 'oauth' },
    { id: 'auth-magic-link', name: 'Auth: Magic Link', subFlowId: 'magic-link' },
    { id: 'auth-password-reset', name: 'Auth: Password Reset', subFlowId: 'password-reset' },
  ];

  const roleOverride: ScenarioBuildContext = { ...ctx, role: 'anonymous' };
  return subFlows.map((s) => buildScenario(s.id, s.name, s.subFlowId, roleOverride));
}

function generatePaymentScenarios(ctx: ScenarioBuildContext): Scenario[] {
  const subFlows = [
    { id: 'payment-checkout', name: 'Payment: Checkout Flow', subFlowId: 'checkout' },
    { id: 'payment-create', name: 'Payment: Process Payment', subFlowId: 'payment' },
    {
      id: 'payment-subscription',
      name: 'Payment: Subscription Management',
      subFlowId: 'subscription',
    },
    { id: 'payment-refund', name: 'Payment: Refund Flow', subFlowId: 'refund' },
  ];

  const customerCtx: ScenarioBuildContext = { ...ctx, role: 'customer' };
  return subFlows.map((s) => buildScenario(s.id, s.name, s.subFlowId, customerCtx));
}

function generateWhatsappScenarios(ctx: ScenarioBuildContext): Scenario[] {
  const subFlows = [
    { id: 'whatsapp-connect', name: 'WhatsApp: Connect Session', subFlowId: 'connect' },
    { id: 'whatsapp-disconnect', name: 'WhatsApp: Disconnect Session', subFlowId: 'disconnect' },
    { id: 'whatsapp-send-message', name: 'WhatsApp: Send Message', subFlowId: 'send-message' },
    {
      id: 'whatsapp-receive-message',
      name: 'WhatsApp: Receive Message',
      subFlowId: 'receive-message',
    },
  ];

  const adminCtx: ScenarioBuildContext = { ...ctx, role: 'admin' };
  return subFlows.map((s) => buildScenario(s.id, s.name, s.subFlowId, adminCtx));
}

function generateWorkspaceScenarios(ctx: ScenarioBuildContext): Scenario[] {
  const subFlows = [
    { id: 'workspace-create', name: 'Workspace: Create Workspace', subFlowId: 'create' },
    { id: 'workspace-invite', name: 'Workspace: Invite Member', subFlowId: 'invite' },
    {
      id: 'workspace-settings-change',
      name: 'Workspace: Change Settings',
      subFlowId: 'settings-change',
    },
  ];

  const adminCtx: ScenarioBuildContext = { ...ctx, role: 'admin' };
  return subFlows.map((s) => buildScenario(s.id, s.name, s.subFlowId, adminCtx));
}

function generateProductScenarios(ctx: ScenarioBuildContext): Scenario[] {
  const subFlows = [
    { id: 'product-create', name: 'Product: Create Product', subFlowId: 'create' },
    { id: 'product-edit', name: 'Product: Edit Product', subFlowId: 'edit' },
    { id: 'product-delete', name: 'Product: Delete Product', subFlowId: 'delete' },
  ];

  const customerCtx: ScenarioBuildContext = { ...ctx, role: 'customer' };
  return subFlows.map((s) => buildScenario(s.id, s.name, s.subFlowId, customerCtx));
}

function generateSurfaceMapScenarios(
  productGraph: PulseProductGraph | null,
  artifacts: LoadedArtifacts,
): Scenario[] {
  if (!productGraph) return [];

  const surfaceMapSurfaces = productGraph.surfaces.filter(
    (s) =>
      !CATEGORY_SURFACE_MAP['auth-flow'].includes(s.id) &&
      !CATEGORY_SURFACE_MAP['payment-flow'].includes(s.id) &&
      !CATEGORY_SURFACE_MAP['whatsapp-flow'].includes(s.id) &&
      !CATEGORY_SURFACE_MAP['workspace-flow'].includes(s.id) &&
      !CATEGORY_SURFACE_MAP['product-flow'].includes(s.id),
  );

  return surfaceMapSurfaces.map((surface) => {
    const ctx = resolveScenarioBuildContext('surface-map', artifacts);
    const nsctx: ScenarioBuildContext = {
      ...ctx,
      primarySurfaceId: surface.id,
      role: SURFACE_ROLE_MAP[surface.id] || 'admin',
      endpoints: getEndpointsForSurface(artifacts.behaviorGraph, surface.id),
      harnessTargets: getHarnessTargetsForSurface(artifacts.harnessEvidence, surface.id),
      entities: getEntitiesForSurface(artifacts.dataflowState, surface.id),
      primaryEntity: getPrimaryEntity(getEntitiesForSurface(artifacts.dataflowState, surface.id)),
    };

    return buildScenario(
      `surface-${surface.id}`,
      `Surface Map: ${surface.name}`,
      'surface-map',
      nsctx,
    );
  });
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
  const coreScenarios = scenarios.filter((s) => CORE_SCENARIO_GROUPS.has(s.id));
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

  const categories: ScenarioCategory[] = [
    'auth-flow',
    'payment-flow',
    'whatsapp-flow',
    'workspace-flow',
    'product-flow',
  ];

  const allScenarios: Scenario[] = [];

  for (const category of categories) {
    const ctx = resolveScenarioBuildContext(category, artifacts);

    let categoryScenarios: Scenario[];
    switch (category) {
      case 'auth-flow':
        categoryScenarios = generateAuthScenarios(ctx);
        break;
      case 'payment-flow':
        categoryScenarios = generatePaymentScenarios(ctx);
        break;
      case 'whatsapp-flow':
        categoryScenarios = generateWhatsappScenarios(ctx);
        break;
      case 'workspace-flow':
        categoryScenarios = generateWorkspaceScenarios(ctx);
        break;
      case 'product-flow':
        categoryScenarios = generateProductScenarios(ctx);
        break;
      default:
        categoryScenarios = [];
    }

    allScenarios.push(...categoryScenarios);
  }

  const surfaceMapScenarios = generateSurfaceMapScenarios(artifacts.productGraph, artifacts);
  allScenarios.push(...surfaceMapScenarios);

  const state: ScenarioEvidenceState = {
    generatedAt: new Date().toISOString(),
    summary: computeSummary(allScenarios),
    scenarios: allScenarios,
  };

  const outputPath = resolveArtifactPath(rootDir, SCENARIO_EVIDENCE_FILENAME);
  writeTextFile(outputPath, JSON.stringify(state, null, 2));

  return state;
}

// ─── Legacy well-known flow descriptors (kept for backward compat) ───────────

/** Well-known flow descriptors keyed by canonical flow ID. */
export const FLOW_DESCRIPTORS: Record<
  string,
  { name: string; role: ScenarioRole; coreSurface: string }
> = {
  'customer-auth-shell': {
    name: 'Customer Auth Shell',
    role: 'customer',
    coreSurface: 'auth',
  },
  'customer-whatsapp-inbox': {
    name: 'Customer WhatsApp Inbox',
    role: 'customer',
    coreSurface: 'inbox',
  },
  'customer-product-checkout': {
    name: 'Customer Product Checkout',
    role: 'customer',
    coreSurface: 'payments',
  },
  'system-payment-reconciliation': {
    name: 'System Payment Reconciliation',
    role: 'operator',
    coreSurface: 'wallet',
  },
  'operator-autopilot': {
    name: 'Operator Autopilot',
    role: 'operator',
    coreSurface: 'whatsapp',
  },
  'admin-settings-kyc-banking': {
    name: 'Admin Settings KYC Banking',
    role: 'admin',
    coreSurface: 'kyc',
  },
  'admin-whatsapp-session': {
    name: 'Admin WhatsApp Session',
    role: 'admin',
    coreSurface: 'whatsapp',
  },
};
