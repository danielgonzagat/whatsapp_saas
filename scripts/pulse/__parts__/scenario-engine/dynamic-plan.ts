import {
  isObservedHttpEntrypointMethod,
  isObservedMutatingMethod,
} from '../../dynamic-reality-grammar';
import type { PulseProductGraph } from '../../types';
import type { BehaviorGraph, BehaviorNode } from '../../types.behavior-graph';
import type { DataflowState, EntityLifecycle } from '../../types.dataflow-engine';
import type { HarnessEvidence, HarnessTarget } from '../../types.execution-harness';
import type {
  ScenarioCategory,
  ScenarioRole,
  ScenarioStep,
  ScenarioStepKind,
} from '../../types.scenario-engine';
import type { ScenarioBuildContext } from './constants';
import { collectScenarioTokens, hasAnyScenarioToken } from './token-selector-utils';

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

function buildDynamicScenarioPlan(
  ctx: ScenarioBuildContext,
  subFlowId: string,
): DynamicScenarioPlan {
  const { tokens } = collectScenarioTokens(ctx, subFlowId);
  const hasMutation = ctx.endpoints.some((endpoint) => {
    const method = getHttpDecoratorForEndpoint(endpoint);
    return (
      isObservedMutatingMethod(method) ||
      endpoint.outputs.some((output) => output.kind === 'db_write') ||
      endpoint.stateAccess.some((access) => access.operation !== 'read')
    );
  });
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

function getHttpDecoratorForEndpoint(node: BehaviorNode): string {
  for (const d of node.decorators) {
    if (isObservedHttpEntrypointMethod(d)) {
      return d.toUpperCase();
    }
  }
  return 'GET';
}

export type { DynamicScenarioPlan };
export { buildStep, buildDynamicScenarioPlan };
