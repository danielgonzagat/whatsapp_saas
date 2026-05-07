// PULSE Wave 5 — Scenario Builder Core
// Part of builder sub-decomposition: scenario construction, summary, and catalog

import {
  discoverHarnessExecutionStatusLabels,
  discoverScenarioStatusLabels,
} from '../../../../dynamic-reality-kernel/__parts__/type-contract-engines';
import { discoverPropertyPassedStatusFromTypeEvidence } from '../../../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { writeTextFile } from '../../../../safe-fs';
import type { PulseProductSurface } from '../../../../types.product-graph';
import type {
  Scenario,
  ScenarioEvidenceState,
  ScenarioStatus,
} from '../../../../types.scenario-engine';

import type { LoadedArtifacts } from '../../queries';
import type { ScenarioBuildContext } from '../../queries';
import {
  _okTextLen,
  _unit,
  _zero,
  SCENARIO_EVIDENCE_FILENAME,
  getCapabilitiesForSurface,
  getEndpointsForSurface,
  getEntitiesForSurface,
  getEntityOperations,
  getFlowsForSurface,
  getHarnessTargetsForSurface,
  getPrimaryEntity,
  loadAllArtifacts,
  resolveArtifactPath,
  resolveCategory,
  resolveRole,
} from '../../queries';

import {
  buildEvidenceLinks,
  buildPreconditions,
  generatePlaywrightSpec,
} from '../../playwright/__parts__/spec-gen';

import { generateStepsForSubFlow } from './step-generation';

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
