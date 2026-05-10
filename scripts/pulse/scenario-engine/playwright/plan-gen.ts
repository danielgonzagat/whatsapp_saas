// PULSE Wave 5 — Dynamic Scenario Plan Generator
// Sub-part: token collection, token matching, and dynamic plan derivation

import { isObservedMutatingMethod } from '../../../../dynamic-reality-grammar';
import {
  _unit,
  _zero,
  getCapabilitiesForSurface,
  getHttpDecorator,
  getSurface,
  tokenizeScenarioText,
} from '../../queries';
import type { ScenarioBuildContext } from '../../queries';
import type { DynamicScenarioPlan } from './spec-gen';

export function collectScenarioTokens(
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

export function hasAnyScenarioToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
}

export function buildDynamicScenarioPlan(
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
      endpoint.externalCalls.length > _zero ||
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

  const _three = _unit + _unit + _unit;
  const _two = _unit + _unit;

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
        ? _three
        : isAuthEntry || isWorkspaceMutation || isMessaging
          ? _two
          : _unit,
  };
}
