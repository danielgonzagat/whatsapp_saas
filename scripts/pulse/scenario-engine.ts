/**
 * PULSE Wave 5 — Scenario Evidence Engine
 *
 * Generates executable scenario definitions for every core product flow.
 * Each scenario includes concrete steps (login, navigate, click, type,
 * submit, assert) derived from the structural graph and product model.
 *
 * Persisted to `.pulse/current/PULSE_SCENARIO_EVIDENCE.json`.
 */

import * as path from 'path';
import { safeJoin } from './lib/safe-path';
import { pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type { PulseProductFlow, PulseProductGraph } from './types';
import type {
  Scenario,
  ScenarioEvidenceState,
  ScenarioRole,
  ScenarioStep,
  ScenarioStepKind,
  ScenarioStatus,
} from './types.scenario-engine';

/** Map of flow IDs that represent core (critical) product operations. */
const CORE_FLOW_IDS = new Set([
  'customer-auth-shell',
  'customer-product-checkout',
  'system-payment-reconciliation',
  'admin-settings-kyc-banking',
]);

/** Default timeout for most scenario steps in milliseconds. */
const DEFAULT_STEP_TIMEOUT = 15000;

/** Longer timeout for login/seed_db steps in milliseconds. */
const LONG_STEP_TIMEOUT = 30000;

const PRODUCT_GRAPH_FILENAME = 'PULSE_PRODUCT_GRAPH.json';
const SCENARIO_EVIDENCE_FILENAME = 'PULSE_SCENARIO_EVIDENCE.json';

/** Well-known flow descriptors keyed by canonical flow ID. */
const FLOW_DESCRIPTORS: Record<string, { name: string; role: ScenarioRole; coreSurface: string }> =
  {
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

function isCoreFlow(flowId: string): boolean {
  return CORE_FLOW_IDS.has(flowId);
}

function buildScenarioId(flowId: string): string {
  return `scenario-${flowId}`;
}

/**
 * Load the product graph from its canonical artifact path.
 * Returns null when the file is missing or unreadable.
 */
function loadProductGraph(rootDir: string): PulseProductGraph | null {
  const filePath = resolveArtifactPath(rootDir, PRODUCT_GRAPH_FILENAME);
  try {
    const raw = readJsonFile<PulseProductGraph>(filePath);
    if (raw && Array.isArray(raw.flows)) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Derive scenario steps from the structural graph for a given flow.
 *
 * When a structural graph is available, steps are inferred from the
 * execution chain (UI → API → service → persistence). When absent, a
 * sensible well-known fallback is generated for each flow ID.
 */
export function deriveStepsFromGraph(flowId: string, graph?: unknown): ScenarioStep[] {
  if (graph && typeof graph === 'object' && !Array.isArray(graph)) {
    return deriveStepsFromStructuralGraph(flowId, graph as Record<string, unknown>);
  }
  return deriveFallbackSteps(flowId);
}

function deriveStepsFromStructuralGraph(
  _flowId: string,
  _graph: Record<string, unknown>,
): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  let order = 0;

  const nodes = Array.isArray((_graph as Record<string, unknown>).nodes)
    ? ((_graph as Record<string, unknown>).nodes as Array<Record<string, unknown>>)
    : [];
  const edges = Array.isArray((_graph as Record<string, unknown>).edges)
    ? ((_graph as Record<string, unknown>).edges as Array<Record<string, unknown>>)
    : [];

  const hasUiEntry = nodes.some(
    (n) => typeof n.role === 'string' && ['component', 'page'].includes(n.role as string),
  );
  const hasApiEntry = nodes.some(
    (n) =>
      typeof n.role === 'string' &&
      ['controller', 'resolver', 'gateway'].includes(n.role as string),
  );
  const hasServiceLayer = nodes.some((n) => typeof n.role === 'string' && n.role === 'service');
  const hasPersistence = nodes.some(
    (n) => typeof n.role === 'string' && n.role === 'persistence_layer',
  );

  if (hasUiEntry) {
    steps.push({
      order: order++,
      kind: 'navigate',
      description: 'Navigate to feature entry point',
      target: '/',
      expectedResult: 'Feature page loads without error',
      timeout: DEFAULT_STEP_TIMEOUT,
    });
  }

  steps.push({
    order: order++,
    kind: 'login',
    description: 'Authenticate with valid credentials',
    target: '/auth/login',
    expectedResult: 'Session token returned and stored',
    timeout: LONG_STEP_TIMEOUT,
  });

  if (hasApiEntry) {
    steps.push({
      order: order++,
      kind: 'api_call',
      description: 'Call primary API endpoint',
      target: '/api/',
      expectedResult: 'HTTP 200 with valid response body',
      timeout: DEFAULT_STEP_TIMEOUT,
    });
  }

  if (hasServiceLayer) {
    steps.push({
      order: order++,
      kind: 'click',
      description: 'Trigger action through UI',
      target: 'button[data-testid="submit"]',
      expectedResult: 'Spinner appears then success toast',
      timeout: DEFAULT_STEP_TIMEOUT,
    });

    steps.push({
      order: order++,
      kind: 'type',
      description: 'Fill required fields',
      target: 'input[data-testid="field"]',
      expectedResult: 'Validation passes',
      timeout: DEFAULT_STEP_TIMEOUT,
    });
  }

  steps.push({
    order: order++,
    kind: 'submit',
    description: 'Submit the form',
    target: 'form',
    expectedResult: 'Form submits and redirect without error',
    timeout: DEFAULT_STEP_TIMEOUT,
  });

  if (hasPersistence) {
    steps.push({
      order: order++,
      kind: 'assert',
      description: 'Verify state persisted in database',
      target: 'db',
      expectedResult: 'Related row exists with correct values',
      timeout: DEFAULT_STEP_TIMEOUT,
    });
  }

  if (edges.length > 0) {
    steps.push({
      order: order++,
      kind: 'assert',
      description: 'Verify side effects fired correctly',
      target: 'observability',
      expectedResult: 'Queue message emitted, log written',
      timeout: DEFAULT_STEP_TIMEOUT,
    });
  }

  steps.push({
    order: order++,
    kind: 'cleanup',
    description: 'Rollback seeded data',
    target: 'db',
    expectedResult: 'Test data removed without errors',
    timeout: DEFAULT_STEP_TIMEOUT,
  });

  return steps;
}

function deriveFallbackSteps(flowId: string): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  let order = 0;

  const templates: Record<string, ScenarioStepKind[]> = {
    'customer-auth-shell': ['navigate', 'type', 'submit', 'assert'],
    'customer-whatsapp-inbox': ['login', 'navigate', 'click', 'assert'],
    'customer-product-checkout': ['login', 'navigate', 'click', 'type', 'submit', 'assert'],
    'system-payment-reconciliation': ['api_call', 'assert', 'seed_db', 'cleanup'],
    'operator-autopilot': ['login', 'navigate', 'click', 'submit', 'assert'],
    'admin-settings-kyc-banking': ['login', 'navigate', 'type', 'submit', 'assert'],
    'admin-whatsapp-session': ['login', 'navigate', 'click', 'assert'],
  };

  const stepKinds = templates[flowId] || ['login', 'navigate', 'assert'];
  const descriptor = FLOW_DESCRIPTORS[flowId];

  for (const kind of stepKinds) {
    steps.push({
      order: order++,
      kind,
      description: `${kind} step for ${descriptor?.name || flowId}`,
      target: kind === 'login' ? '/auth/login' : kind === 'navigate' ? '/' : 'form',
      expectedResult: `${kind} completes without error`,
      timeout: kind === 'login' || kind === 'seed_db' ? LONG_STEP_TIMEOUT : DEFAULT_STEP_TIMEOUT,
    });
  }

  return steps;
}

/**
 * Generate a single scenario for a specific flow.
 *
 * @param flowId - Canonical flow ID (e.g. 'customer-auth-shell').
 * @param flowName - Human-readable flow name.
 * @param structuralGraph - Optional structural graph for step derivation.
 * @returns A complete scenario with steps, role, and capability assignments.
 */
export function generateScenarioForFlow(
  flowId: string,
  flowName: string,
  structuralGraph?: unknown,
): Scenario {
  const descriptor = FLOW_DESCRIPTORS[flowId];
  const role = descriptor?.role || 'customer';
  const steps = deriveStepsFromGraph(flowId, structuralGraph);
  const capabilityIds = flowId
    .split('-')
    .map((part, idx) => (idx === 0 ? `${part}-${flowId.split('-').slice(1, 3).join('-')}` : ''))
    .filter(Boolean);

  return {
    id: buildScenarioId(flowId),
    name: flowName,
    role,
    flowId,
    capabilityIds,
    steps,
    status: 'not_run',
    lastRun: null,
    durationMs: null,
    evidence: [SCENARIO_EVIDENCE_FILENAME],
  };
}

function computeSummary(scenarios: Scenario[]) {
  const total = scenarios.length;
  const passed = scenarios.filter((s) => s.status === 'passed').length;
  const failed = scenarios.filter((s) => s.status === 'failed').length;
  const notRun = scenarios.filter((s) => s.status === 'not_run').length;
  const coreScenarios = scenarios.filter((s) => isCoreFlow(s.flowId));
  const coreScenariosPassed = coreScenarios.filter((s) => s.status === 'passed').length;

  return {
    total,
    passed,
    failed,
    notRun,
    coreScenarios: coreScenarios.length,
    coreScenariosPassed,
  };
}

/**
 * Build the full scenario catalog for every core product flow.
 *
 * Reads the product graph from `.pulse/current/PULSE_PRODUCT_GRAPH.json`,
 * generates executable scenario definitions with concrete steps, and
 * persists the result to `.pulse/current/PULSE_SCENARIO_EVIDENCE.json`.
 *
 * @param rootDir - Repo root directory.
 * @returns The generated scenario evidence state.
 */
export function buildScenarioCatalog(rootDir: string): ScenarioEvidenceState {
  const productGraph = loadProductGraph(rootDir);
  const scenarios: Scenario[] = [];

  const flowIds = productGraph
    ? productGraph.flows.map((f) => f.id)
    : Object.keys(FLOW_DESCRIPTORS);

  for (const flowId of flowIds) {
    const productFlow = productGraph?.flows.find((f) => f.id === flowId);
    const descriptor = FLOW_DESCRIPTORS[flowId];
    const flowName = productFlow?.name || descriptor?.name || flowId;

    const structuralGraph = productGraph ? { nodes: [], edges: [] } : undefined;

    const scenario = generateScenarioForFlow(flowId, flowName, structuralGraph);
    scenarios.push(scenario);
  }

  const state: ScenarioEvidenceState = {
    generatedAt: new Date().toISOString(),
    summary: computeSummary(scenarios),
    scenarios,
  };

  const outputPath = resolveArtifactPath(rootDir, SCENARIO_EVIDENCE_FILENAME);
  writeTextFile(outputPath, JSON.stringify(state, null, 2));

  return state;
}
