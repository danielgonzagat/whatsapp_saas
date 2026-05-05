import type {
  BackendRoute,
  APICall,
  ProxyRoute,
  ServiceTrace,
  UIElement,
  FacadeEntry,
  PrismaModel,
} from '../../types.core';
import type { Break, PulseConfig } from '../../types.manifest';
import { normalizeForMatch } from './graph-part1-core';
import type { RouteKey } from './graph-part1-core';

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

export function matchApiCallToRoute(
  call: APICall,
  routeLookup: Map<RouteKey, BackendRoute>,
  proxyRoutes: ProxyRoute[],
): BackendRoute | null {
  let targetPath = call.normalizedPath;

  if (call.isProxy) {
    const proxy = proxyRoutes.find(
      (p) =>
        normalizeForMatch(p.frontendPath) === normalizeForMatch(call.normalizedPath) &&
        p.httpMethod === call.method,
    );
    if (proxy) {
      targetPath = proxy.backendPath;
    } else {
      targetPath = call.normalizedPath.replace(/^\/api\//, '/');
    }
  }

  const key = `${call.method}:${normalizeForMatch(targetPath)}`;
  const direct = routeLookup.get(key);
  if (direct) {
    return direct;
  }

  for (const [routeKey, route] of routeLookup) {
    const [rMethod, rPath] = routeKey.split(':');
    if (rMethod !== call.method) {
      continue;
    }
    const normalTarget = normalizeForMatch(targetPath);
    if (rPath === normalTarget) {
      return route;
    }
    if (normalTarget.startsWith(rPath + '/') || rPath.startsWith(normalTarget + '/')) {
      return route;
    }
  }

  return null;
}

export function buildServiceModelMap(traces: ServiceTrace[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const trace of traces) {
    const key = `${trace.serviceName}.${trace.methodName}`;
    const existing = map.get(key) || [];
    existing.push(...trace.prismaModels);
    map.set(key, [...new Set(existing)]);
  }
  return map;
}

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

    const exact = serviceModelMap.get(svcCall);
    if (exact) {
      exact.forEach((m) => models.add(m));
      continue;
    }

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

export interface PulseGraphInput {
  uiElements: UIElement[];
  apiCalls: APICall[];
  backendRoutes: BackendRoute[];
  prismaModels: PrismaModel[];
  serviceTraces: ServiceTrace[];
  proxyRoutes: ProxyRoute[];
  facades: FacadeEntry[];
  globalPrefix: string;
  config?: PulseConfig;
  extendedBreaks?: Break[];
}
