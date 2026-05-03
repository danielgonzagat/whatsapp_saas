import type { PulseProductSurface } from '../../types';
import type { Scenario, ScenarioStatus } from '../../types.scenario-engine';
import type { LoadedArtifacts } from './artifact-loaders';
import {
  getCapabilitiesForSurface,
  getEntitiesForSurface,
  getEntityOperations,
  getFlowsForSurface,
  getHarnessTargetsForSurface,
  getPrimaryEntity,
} from './artifact-queries';
import { resolveCategory, resolveRole } from './classifiers';
import type { ScenarioBuildContext } from './dynamic-plan';
import { buildEvidenceLinks, buildPreconditions } from './evidence-preconditions';
import { generatePlaywrightSpec } from './spec-generator';
import { generateStepsForSubFlow } from './step-generator';
import { getEndpointsForSurface } from './surface-queries';

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

export { resolveScenarioBuildContext, buildScenario };
