import type {
  APICall,
  BackendRoute,
  PrismaModel,
  ServiceTrace,
  ProxyRoute,
  UIElement,
  FacadeEntry,
  Break,
  PulseHealth,
  PulseConfig,
} from './types';
import { buildApiModuleMap } from './parsers/api-parser';
import { deriveDynamicFindingIdentity } from './finding-identity';

/** Normalize for match. */
export function normalizeForMatch(p: string): string {
  return p
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .replace(/:[a-zA-Z_]\w*/g, ':_')
    .toLowerCase();
}

/** Route key type. */
export type RouteKey = string; // "GET:/campaigns/:_"

type GraphEvidenceKind =
  | 'route_target_unmatched'
  | 'route_caller_unobserved'
  | 'state_model_access_unobserved'
  | 'ui_handler_effect_unobserved'
  | 'facade_evidence'
  | 'proxy_upstream_unmatched';

function graphFindingType(kind: GraphEvidenceKind): string {
  return `graph-${kind.replace(/_/g, '-')}`;
}

function graphFinding(input: {
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

function countByDynamicEvent(breaks: Break[], pattern: RegExp): number {
  return breaks.filter((item) => {
    const identity = deriveDynamicFindingIdentity(item);
    return pattern.test(`${identity.eventName} ${item.source ?? ''} ${item.surface ?? ''}`);
  }).length;
}

function countBySourceKind(breaks: Break[], kind: GraphEvidenceKind): number {
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

function buildAuthEvidenceTokens(routes: BackendRoute[]): Set<string> {
  const tokens = new Set<string>();
  for (const route of routes) {
    for (const guard of route.guards) {
      addTokens(tokens, guard);
    }
    if (!route.isPublic && route.guards.length > 0) {
      addTokens(tokens, route.methodName);
      addTokens(tokens, route.controllerPath);
    }
  }
  return tokens;
}

function buildStateEvidenceTokens(models: PrismaModel[], traces: ServiceTrace[]): Set<string> {
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

function routeKeyFor(route: BackendRoute): RouteKey {
  return `${route.httpMethod}:${normalizeForMatch(route.fullPath)}`;
}

function inferCallRunsInsideFrontendRuntime(call: APICall, proxyRoutes: ProxyRoute[]): boolean {
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

function inferRouteHasExternalCaller(route: BackendRoute): boolean {
  const routeTokens = tokenizeGraphEvidence(
    `${route.controllerPath} ${route.methodPath} ${route.fullPath} ${route.methodName}`,
  );
  const guardTokens = new Set<string>();
  for (const guard of route.guards) {
    addTokens(guardTokens, guard);
  }

  return route.isPublic && (routeTokens.size > 0 || guardTokens.size === 0);
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

  return triggerTokens.size > 0 || serviceCallTokens.size > 0;
}

function inferModelUsageEvidence(input: {
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

function countAuthRiskIssues(breaks: Break[], authTokens: Set<string>): number {
  return breaks.filter((item) => hasTokenIntersection(inferBreakTextTokens(item), authTokens))
    .length;
}

function countStateRiskIssues(
  breaks: Break[],
  stateTokens: Set<string>,
  authTokens: Set<string>,
): number {
  return breaks.filter((item) => {
    const tokens = inferBreakTextTokens(item);
    return hasTokenIntersection(tokens, stateTokens) && !hasTokenIntersection(tokens, authTokens);
  }).length;
}

function calculateDynamicScore(totalNodes: number, breaks: Break[]): number {
  if (totalNodes === 0) {
    return 100;
  }

  const observedSeverities = [...new Set(breaks.map((item) => item.severity))];
  if (observedSeverities.length === 0) {
    return 100;
  }

  const severityOrder: Break['severity'][] = ['low', 'medium', 'high', 'critical'];
  const observedRank = new Map<Break['severity'], number>();
  for (const severity of observedSeverities.sort(
    (left, right) => severityOrder.indexOf(left) - severityOrder.indexOf(right),
  )) {
    observedRank.set(severity, observedRank.size + 1);
  }

  const maxObservedRank = observedRank.size;
  const impact = breaks.reduce((sum, item) => {
    const rank = observedRank.get(item.severity) ?? maxObservedRank;
    return sum + rank / maxObservedRank;
  }, 0);
  const nodeCapacity = Math.max(totalNodes, breaks.length);
  const penalty = (impact / nodeCapacity) * 100;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

/** Build route lookup. */
export function buildRouteLookup(
  routes: BackendRoute[],
  globalPrefix: string,
): Map<RouteKey, BackendRoute> {
  const map = new Map<RouteKey, BackendRoute>();
  for (const route of routes) {
    let fullPath = route.fullPath;
    if (globalPrefix) {
      fullPath = `/${globalPrefix}${fullPath}`.replace(/\/+/g, '/');
    }
    const key = `${route.httpMethod}:${normalizeForMatch(fullPath)}`;
    map.set(key, route);
  }
  return map;
}

/** Match api call to route. */
export function matchApiCallToRoute(
  call: APICall,
  routeLookup: Map<RouteKey, BackendRoute>,
  proxyRoutes: ProxyRoute[],
): BackendRoute | null {
  let targetPath = call.normalizedPath;

  // Resolve proxy routes
  if (call.isProxy) {
    const proxy = proxyRoutes.find(
      (p) =>
        normalizeForMatch(p.frontendPath) === normalizeForMatch(call.normalizedPath) &&
        p.httpMethod === call.method,
    );
    if (proxy) {
      targetPath = proxy.backendPath;
    } else {
      // Fallback: strip /api/ prefix
      targetPath = call.normalizedPath.replace(/^\/api\//, '/');
    }
  }

  const key = `${call.method}:${normalizeForMatch(targetPath)}`;
  const direct = routeLookup.get(key);
  if (direct) {
    return direct;
  }

  // Fuzzy match: try without trailing param segments (handles /endpoint vs /endpoint/:id)
  for (const [routeKey, route] of routeLookup) {
    const [rMethod, rPath] = routeKey.split(':');
    if (rMethod !== call.method) {
      continue;
    }
    const normalTarget = normalizeForMatch(targetPath);
    if (rPath === normalTarget) {
      return route;
    }
    // Check if one is a prefix of the other (handles nested routes)
    if (normalTarget.startsWith(rPath + '/') || rPath.startsWith(normalTarget + '/')) {
      return route;
    }
  }

  return null;
}

/** Build service model map. */
export function buildServiceModelMap(traces: ServiceTrace[]): Map<string, string[]> {
  // "serviceName.methodName" -> ["ModelName", ...]
  const map = new Map<string, string[]>();
  for (const trace of traces) {
    const key = `${trace.serviceName}.${trace.methodName}`;
    const existing = map.get(key) || [];
    existing.push(...trace.prismaModels);
    map.set(key, [...new Set(existing)]);
  }
  return map;
}

/** Resolve route models. */
export function resolveRouteModels(
  route: BackendRoute,
  serviceModelMap: Map<string, string[]>,
  allTraces: ServiceTrace[],
): string[] {
  const models = new Set<string>();

  for (const svcCall of route.serviceCalls) {
    const [svcProp, methodName] = svcCall.split('.');
    if (!methodName) {
      continue;
    }

    // Try exact match
    const exact = serviceModelMap.get(svcCall);
    if (exact) {
      exact.forEach((m) => models.add(m));
      continue;
    }

    // Try fuzzy: match service name (without 'Service' suffix) + method
    for (const trace of allTraces) {
      const shortSvc = trace.serviceName.replace(/Service$/i, '').toLowerCase();
      const shortProp = svcProp.replace(/Service$/i, '').toLowerCase();
      if (shortSvc === shortProp && trace.methodName === methodName) {
        trace.prismaModels.forEach((m) => models.add(m));
      }
    }
  }

  return [...models];
}

/** Pulse graph input shape. */
export interface PulseGraphInput {
  /** Ui elements property. */
  uiElements: UIElement[];
  /** Api calls property. */
  apiCalls: APICall[];
  /** Backend routes property. */
  backendRoutes: BackendRoute[];
  /** Prisma models property. */
  prismaModels: PrismaModel[];
  /** Service traces property. */
  serviceTraces: ServiceTrace[];
  /** Proxy routes property. */
  proxyRoutes: ProxyRoute[];
  /** Facades property. */
  facades: FacadeEntry[];
  /** Global prefix property. */
  globalPrefix: string;
  /** Config property. */
  config?: PulseConfig;
  /** Extended breaks property. */
  extendedBreaks?: Break[];
}
