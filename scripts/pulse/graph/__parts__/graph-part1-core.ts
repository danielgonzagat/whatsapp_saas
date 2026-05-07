import type {
  APICall,
  BackendRoute,
  PrismaModel,
  ServiceTrace,
  ProxyRoute,
} from '../../types.core';
import type { Break } from '../../types.manifest';
import { deriveDynamicFindingIdentity } from '../../finding-identity';
import {
  deriveZeroValue,
  deriveUnitValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/__parts__/type-contract-labels';

export function normalizeForMatch(p: string): string {
  return p
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .replace(/:[a-zA-Z_]\w*/g, ':_')
    .toLowerCase();
}

export type RouteKey = string;

export type GraphEvidenceKind =
  | 'route_target_unmatched'
  | 'route_caller_unobserved'
  | 'state_model_access_unobserved'
  | 'ui_handler_effect_unobserved'
  | 'facade_evidence'
  | 'proxy_upstream_unmatched';

function graphFindingType(kind: GraphEvidenceKind): string {
  return `graph-${kind.replace(/_/g, '-')}`;
}

export function graphFinding(input: {
  kind: GraphEvidenceKind;
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  surface?: string;
}): Break {
  return {
    type: graphFindingType(input.kind),
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `graph:confirmed_static:${input.kind}`,
    surface: input.surface,
  };
}

export function countByDynamicEvent(breaks: Break[], pattern: RegExp): number {
  return breaks.filter((item) => {
    const identity = deriveDynamicFindingIdentity(item);
    return pattern.test(`${identity.eventName} ${item.source ?? ''} ${item.surface ?? ''}`);
  }).length;
}

export function countBySourceKind(breaks: Break[], kind: GraphEvidenceKind): number {
  return breaks.filter((item) => item.source === `graph:confirmed_static:${kind}`).length;
}

function tokenizeGraphEvidence(value: string | null | undefined): Set<string> {
  const tokens = new Set<string>();
  for (const token of (value ?? '').toLowerCase().match(/[a-z][a-z0-9]+/g) ?? []) {
    tokens.add(token);
  }
  return tokens;
}

function hasTokenIntersection(left: Set<string>, right: Set<string>): boolean {
  for (const token of left) {
    if (right.has(token)) {
      return true;
    }
  }
  return false;
}

function addTokens(target: Set<string>, value: string | null | undefined): void {
  for (const token of tokenizeGraphEvidence(value)) {
    target.add(token);
  }
}

export function buildAuthEvidenceTokens(routes: BackendRoute[]): Set<string> {
  const tokens = new Set<string>();
  for (const route of routes) {
    for (const guard of route.guards) {
      addTokens(tokens, guard);
    }
    if (!route.isPublic && route.guards.length > deriveZeroValue()) {
      addTokens(tokens, route.methodName);
      addTokens(tokens, route.controllerPath);
    }
  }
  return tokens;
}

export function buildStateEvidenceTokens(
  models: PrismaModel[],
  traces: ServiceTrace[],
): Set<string> {
  const tokens = new Set<string>();
  for (const model of models) {
    addTokens(tokens, model.name);
    addTokens(tokens, model.accessorName);
    for (const field of model.fields) {
      addTokens(tokens, field.name);
      addTokens(tokens, field.type);
    }
    for (const relation of model.relations) {
      addTokens(tokens, relation.fieldName);
      addTokens(tokens, relation.targetModel);
    }
  }
  for (const trace of traces) {
    for (const model of trace.prismaModels) {
      addTokens(tokens, model);
    }
  }
  return tokens;
}

export function routeKeyFor(route: BackendRoute): RouteKey {
  return `${route.httpMethod}:${normalizeForMatch(route.fullPath)}`;
}

export function inferCallRunsInsideFrontendRuntime(
  call: APICall,
  proxyRoutes: ProxyRoute[],
): boolean {
  if (!call.isProxy) {
    return false;
  }

  const matchingProxy = proxyRoutes.find(
    (proxy) =>
      normalizeForMatch(proxy.frontendPath) === normalizeForMatch(call.normalizedPath) &&
      proxy.httpMethod === call.method,
  );
  if (matchingProxy) {
    return false;
  }

  const pathTokens = tokenizeGraphEvidence(call.normalizedPath);
  const fileTokens = tokenizeGraphEvidence(call.file);
  const callerTokens = tokenizeGraphEvidence(call.callerFunction);
  const runtimeTokens = new Set([...fileTokens, ...callerTokens]);
  return fileTokens.has('route') && hasTokenIntersection(pathTokens, runtimeTokens);
}

export function inferRouteHasExternalCaller(route: BackendRoute): boolean {
  const routeTokens = tokenizeGraphEvidence(
    `${route.controllerPath} ${route.methodPath} ${route.fullPath} ${route.methodName}`,
  );
  const guardTokens = new Set<string>();
  for (const guard of route.guards) {
    addTokens(guardTokens, guard);
  }

  return (
    route.isPublic &&
    (routeTokens.size > deriveZeroValue() || guardTokens.size === deriveZeroValue())
  );
}

function inferTraceHasRuntimeEntry(trace: ServiceTrace): boolean {
  const triggerTokens = new Set<string>();
  for (const trigger of trace.triggers ?? []) {
    addTokens(triggerTokens, trigger);
  }

  const serviceCallTokens = new Set<string>();
  for (const serviceCall of trace.serviceCalls ?? []) {
    addTokens(serviceCallTokens, serviceCall);
  }

  return triggerTokens.size > deriveZeroValue() || serviceCallTokens.size > deriveZeroValue();
}

export function inferModelUsageEvidence(input: {
  model: PrismaModel;
  serviceTraces: ServiceTrace[];
  consumedServiceCalls: Set<string>;
}): boolean {
  const accessor = input.model.accessorName;
  return input.serviceTraces.some((trace) => {
    if (!trace.prismaModels.includes(accessor)) {
      return false;
    }

    const serviceCall = `${trace.serviceName}.${trace.methodName}`;
    return input.consumedServiceCalls.has(serviceCall) || inferTraceHasRuntimeEntry(trace);
  });
}

function inferBreakTextTokens(item: Break): Set<string> {
  return tokenizeGraphEvidence(
    `${item.type} ${item.source ?? ''} ${item.surface ?? ''} ${item.description} ${item.detail}`,
  );
}

export function countAuthRiskIssues(breaks: Break[], authTokens: Set<string>): number {
  return breaks.filter((item) => hasTokenIntersection(inferBreakTextTokens(item), authTokens))
    .length;
}

export function countStateRiskIssues(
  breaks: Break[],
  stateTokens: Set<string>,
  authTokens: Set<string>,
): number {
  return breaks.filter((item) => {
    const tokens = inferBreakTextTokens(item);
    return hasTokenIntersection(tokens, stateTokens) && !hasTokenIntersection(tokens, authTokens);
  }).length;
}

export function resolveBreakSeverityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract('scripts/pulse/types.health.ts', 'severity');
}

export function resolveSeverityRankOrder(): Map<Break['severity'], number> {
  const labels = resolveBreakSeverityLabels();
  const canonical = ['low', 'medium', 'high', 'critical'].filter((s) => labels.has(s));
  const rank = new Map<Break['severity'], number>();
  for (const s of canonical) {
    rank.set(s as Break['severity'], rank.size + deriveUnitValue());
  }
  return rank;
}

function resolveHandlerTypeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract('scripts/pulse/types.core.ts', 'handlerType');
}

export function isUselessHandlerType(handlerType: string): boolean {
  const labels = resolveHandlerTypeLabels();
  return labels.has(handlerType) && (handlerType === 'dead' || handlerType === 'noop');
}

export function isNoopHandlerType(handlerType: string): boolean {
  const labels = resolveHandlerTypeLabels();
  return labels.has(handlerType) && handlerType === 'noop';
}

export function calculateDynamicScore(totalNodes: number, breaks: Break[]): number {
  if (totalNodes === deriveZeroValue()) {
    return 100;
  }

  const observedSeverities = [...new Set(breaks.map((item) => item.severity))];
  if (observedSeverities.length === deriveZeroValue()) {
    return 100;
  }

  const severityRank = resolveSeverityRankOrder();
  const observedRank = new Map<Break['severity'], number>();
  for (const severity of observedSeverities.sort(
    (left, right) =>
      (severityRank.get(left) ?? deriveZeroValue()) -
      (severityRank.get(right) ?? deriveZeroValue()),
  )) {
    observedRank.set(severity, observedRank.size + deriveUnitValue());
  }

  const maxObservedRank = observedRank.size;
  const impact = breaks.reduce((sum, item) => {
    const rank = observedRank.get(item.severity) ?? maxObservedRank;
    return sum + rank / maxObservedRank;
  }, deriveZeroValue());
  const nodeCapacity = Math.max(totalNodes, breaks.length);
  const penalty = (impact / nodeCapacity) * 100;
  return Math.max(deriveZeroValue(), Math.min(100, Math.round(100 - penalty)));
}
