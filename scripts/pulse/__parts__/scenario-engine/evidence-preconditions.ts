import type { BehaviorNode } from '../../types.behavior-graph';
import type { EntityLifecycle } from '../../types.dataflow-engine';
import type { HarnessTarget } from '../../types.execution-harness';
import type {
  ScenarioCategory,
  ScenarioEvidenceLink,
  ScenarioPrecondition,
  ScenarioStep,
} from '../../types.scenario-engine';
import { getHarnessFixtures } from './artifact-queries';
import { extractRoutePattern, getHttpDecorator } from './surface-queries';

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

export { buildEvidenceLinks, buildPreconditions };
