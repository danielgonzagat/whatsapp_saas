import { extractRouteFromSurfaceId } from '../../dynamic-reality-grammar';
import type { BehaviorNode } from '../../types.behavior-graph';
import type { ScenarioCategory, ScenarioStep } from '../../types.scenario-engine';
import { DEFAULT_STEP_TIMEOUT, LONG_STEP_TIMEOUT } from './constants';
import type { ScenarioBuildContext } from './constants';
import { buildDynamicScenarioPlan, buildStep } from './dynamic-plan';
import { extractRoutePattern, getHttpDecorator } from './surface-queries';
import { buildInputSelector, normalizeSelectorToken } from './token-selector-utils';

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

export { generateStepsForSubFlow };
