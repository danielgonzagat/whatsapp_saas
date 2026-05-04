/**
 * PULSE Wave 5 — Scenario Builder & Catalog Generator
 *
 * Part of the Scenario Evidence Engine. Builds individual scenarios from
 * graph evidence, computes scenario summaries, and assembles the full
 * scenario catalog persisted to `.pulse/current/PULSE_SCENARIO_EVIDENCE.json`.
 */

import { extractRouteFromSurfaceId } from '../../dynamic-reality-grammar';
import {
  deriveLengthBoundariesFromObservedCatalog,
  discoverHarnessExecutionStatusLabels,
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverScenarioStatusLabels,
} from '../../dynamic-reality-kernel';
import { writeTextFile } from '../../safe-fs';
import type { PulseProductSurface } from '../../types';
import type { BehaviorNode } from '../../types.behavior-graph';
import type {
  Scenario,
  ScenarioCategory,
  ScenarioEvidenceState,
  ScenarioStatus,
  ScenarioStep,
} from '../../types.scenario-engine';

import type { LoadedArtifacts } from './queries';
import type { ScenarioBuildContext } from './queries';
import {
  _okTextLen,
  _scale,
  _unit,
  _zero,
  DEFAULT_STEP_TIMEOUT,
  LONG_STEP_TIMEOUT,
  extractRoutePattern,
  getCapabilitiesForSurface,
  getEndpointsForSurface,
  getEntitiesForSurface,
  getEntityOperations,
  getFlowsForSurface,
  getHarnessTargetsForSurface,
  getHttpDecorator,
  getPrimaryEntity,
  getSurface,
  loadAllArtifacts,
  resolveArtifactPath,
  resolveCategory,
  resolveRole,
  SCENARIO_EVIDENCE_FILENAME,
} from './queries';

import {
  buildDynamicScenarioPlan,
  buildEvidenceLinks,
  buildPreconditions,
  buildStep,
  generatePlaywrightSpec,
} from './playwright';

// ─── Selector Helpers ────────────────────────────────────────────────────────

const _selectorMaxLen =
  deriveLengthBoundariesFromObservedCatalog()[
    deriveLengthBoundariesFromObservedCatalog().length - _unit
  ] ?? _okTextLen * _scale;

function normalizeSelectorToken(inputName: string, fallbackIndex: number): string {
  const trimmed = inputName.trim();
  if (isStableSelectorToken(trimmed)) {
    return trimmed;
  }
  const normalized = normalizeSelectorCharacters(trimmed).slice(_zero, _selectorMaxLen);
  return normalized || `pulse-field-${fallbackIndex}`;
}

function isStableSelectorToken(value: string): boolean {
  const _maxLen = _selectorMaxLen + _selectorMaxLen;
  if (value.length === _zero || value.length > _maxLen || !isAsciiLetter(value[_zero])) {
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

// ─── Step Generation ─────────────────────────────────────────────────────────

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

  const _maxInputStep =
    deriveLengthBoundariesFromObservedCatalog()[_zero] ?? _unit + _unit + _unit + _unit + _unit;
  const selectedInputs =
    inputNames.length > _zero
      ? inputNames.slice(
          _zero,
          Math.max(plan.minInputSteps, Math.min(inputNames.length, _maxInputStep)),
        )
      : Array.from({ length: plan.minInputSteps }, (_, index) => `pulseField${index + _unit}`);

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

  const apiLimit = _okTextLen + _unit;
  const apiTargets = endpoints.length > _zero ? endpoints.slice(_zero, apiLimit) : [];
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
    status: ([...discoverScenarioStatusLabels()].sort()[_zero] ?? 'not_run') as ScenarioStatus,
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
  const allStatuses = discoverScenarioStatusLabels();
  const _harnessStatuses = discoverHarnessExecutionStatusLabels();
  const passedSet = new Set(
    [...allStatuses].filter((s) => discoverPropertyPassedStatusFromTypeEvidence().has(s)),
  );
  const notRunSet = new Set([...allStatuses].filter((s) => !_harnessStatuses.has(s)));
  const _passedAndNotRun = new Set([...passedSet, ...notRunSet]);
  const failedSet = new Set(
    [...allStatuses].filter((s) => _harnessStatuses.has(s) && !_passedAndNotRun.has(s)),
  );

  const total = scenarios.length;
  const passed = scenarios.filter((s) => passedSet.has(s.status)).length;
  const failed = scenarios.filter((s) => failedSet.has(s.status)).length;
  const notRun = scenarios.filter((s) => notRunSet.has(s.status)).length;
  const generated = scenarios.filter((s) => s.playwrightSpec != null).length;
  const coreThreshold = _okTextLen;
  const coreScenarios = scenarios.filter(
    (s) => s.preconditions.length > _zero || s.steps.length > coreThreshold,
  );
  const coreScenariosPassed = coreScenarios.filter((s) => passedSet.has(s.status)).length;

  const byCategory: Record<
    string,
    { total: number; passed: number; failed: number; notRun: number }
  > = {};
  for (const s of scenarios) {
    const cat = s.category || 'unknown';
    if (!byCategory[cat]) {
      byCategory[cat] = { total: _zero, passed: _zero, failed: _zero, notRun: _zero };
    }
    byCategory[cat].total++;
    if (passedSet.has(s.status)) byCategory[cat].passed++;
    else if (failedSet.has(s.status)) byCategory[cat].failed++;
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
