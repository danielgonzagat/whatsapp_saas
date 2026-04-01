import type {
  APICall, BackendRoute, PrismaModel, ServiceTrace,
  ProxyRoute, UIElement, FacadeEntry, Break, PulseHealth, PulseConfig,
} from './types';
import { buildApiModuleMap } from './parsers/api-parser';

function normalizeForMatch(p: string): string {
  return p
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .replace(/:[a-zA-Z_]\w*/g, ':_')
    .toLowerCase();
}

type RouteKey = string; // "GET:/campaigns/:_"

function buildRouteLookup(routes: BackendRoute[], globalPrefix: string): Map<RouteKey, BackendRoute> {
  const map = new Map<RouteKey, BackendRoute>();
  for (const route of routes) {
    let fullPath = route.fullPath;
    if (globalPrefix) fullPath = `/${globalPrefix}${fullPath}`.replace(/\/+/g, '/');
    const key = `${route.httpMethod}:${normalizeForMatch(fullPath)}`;
    map.set(key, route);
  }
  return map;
}

function matchApiCallToRoute(
  call: APICall,
  routeLookup: Map<RouteKey, BackendRoute>,
  proxyRoutes: ProxyRoute[],
): BackendRoute | null {
  let targetPath = call.normalizedPath;

  // Resolve proxy routes
  if (call.isProxy) {
    const proxy = proxyRoutes.find(p =>
      normalizeForMatch(p.frontendPath) === normalizeForMatch(call.normalizedPath) &&
      p.httpMethod === call.method
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
  if (direct) return direct;

  // Fuzzy match: try without trailing param segments (handles /endpoint vs /endpoint/:id)
  for (const [routeKey, route] of routeLookup) {
    const [rMethod, rPath] = routeKey.split(':');
    if (rMethod !== call.method) continue;
    const normalTarget = normalizeForMatch(targetPath);
    if (rPath === normalTarget) return route;
    // Check if one is a prefix of the other (handles nested routes)
    if (normalTarget.startsWith(rPath + '/') || rPath.startsWith(normalTarget + '/')) {
      return route;
    }
  }

  return null;
}

function buildServiceModelMap(
  traces: ServiceTrace[],
): Map<string, string[]> {
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

function resolveRouteModels(
  route: BackendRoute,
  serviceModelMap: Map<string, string[]>,
  allTraces: ServiceTrace[],
): string[] {
  const models = new Set<string>();

  for (const svcCall of route.serviceCalls) {
    const [svcProp, methodName] = svcCall.split('.');
    if (!methodName) continue;

    // Try exact match
    const exact = serviceModelMap.get(svcCall);
    if (exact) { exact.forEach(m => models.add(m)); continue; }

    // Try fuzzy: match service name (without 'Service' suffix) + method
    for (const trace of allTraces) {
      const shortSvc = trace.serviceName.replace(/Service$/i, '').toLowerCase();
      const shortProp = svcProp.replace(/Service$/i, '').toLowerCase();
      if (shortSvc === shortProp && trace.methodName === methodName) {
        trace.prismaModels.forEach(m => models.add(m));
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

export function buildGraph(input: PulseGraphInput): PulseHealth {
  const {
    uiElements, apiCalls, backendRoutes, prismaModels,
    serviceTraces, proxyRoutes, facades, globalPrefix,
  } = input;

  const breaks: Break[] = [];
  const routeLookup = buildRouteLookup(backendRoutes, globalPrefix);
  const serviceModelMap = buildServiceModelMap(serviceTraces);

  // Track which routes are consumed
  const consumedRoutes = new Set<string>();
  // Track which models are used
  const usedModels = new Set<string>();

  // === API → Backend matching ===
  for (const call of apiCalls) {
    // Skip auth/refresh proxy calls (they're internal Next.js routes)
    if (call.normalizedPath.startsWith('/api/auth/')) continue;

    const route = matchApiCallToRoute(call, routeLookup, proxyRoutes);
    if (route) {
      const key = `${route.httpMethod}:${normalizeForMatch(route.fullPath)}`;
      consumedRoutes.add(key);

      // Trace models used by this route
      const models = resolveRouteModels(route, serviceModelMap, serviceTraces);
      models.forEach(m => usedModels.add(m));
    } else {
      // Check if it's a known proxy route (handled by Next.js, not a break)
      if (call.isProxy) {
        const proxyExists = proxyRoutes.some(p =>
          normalizeForMatch(p.frontendPath) === normalizeForMatch(call.normalizedPath)
        );
        if (proxyExists) continue;
      }

      breaks.push({
        type: 'API_NO_ROUTE',
        severity: 'high',
        file: call.file,
        line: call.line,
        description: `${call.method} ${call.normalizedPath} has no matching backend route`,
        detail: `Pattern: ${call.callPattern}, endpoint: ${call.endpoint}`,
      });
    }
  }

  // === API Module Map: mark routes consumed via wrapper functions (lib/api/*.ts) ===
  // Method detection in API modules is unreliable (block scanning picks up neighboring functions),
  // so we match by path only — any HTTP method match counts as consumed.
  if (input.config) {
    const apiModuleMap = buildApiModuleMap(input.config);
    for (const [, { endpoint }] of apiModuleMap.entries()) {
      let targetPath = endpoint;
      // Handle proxy paths (/api/kyc/... -> /kyc/...)
      if (targetPath.startsWith('/api/')) {
        targetPath = targetPath.replace(/^\/api\//, '/');
      }
      const normalTarget = normalizeForMatch(targetPath);
      // Try all HTTP methods — method detection in object API modules is often wrong
      for (const [routeKey, route] of routeLookup) {
        const rPath = routeKey.substring(routeKey.indexOf(':') + 1);
        if (rPath === normalTarget || normalTarget.startsWith(rPath + '/') || rPath.startsWith(normalTarget + '/')) {
          consumedRoutes.add(routeKey);
          const models = resolveRouteModels(route, serviceModelMap, serviceTraces);
          models.forEach(m => usedModels.add(m));
        }
      }
    }
  }

  // === Backend routes not consumed ===
  for (const route of backendRoutes) {
    const key = `${route.httpMethod}:${normalizeForMatch(route.fullPath)}`;
    if (!consumedRoutes.has(key)) {
      // Skip public/webhook/internal/admin/worker routes — not meant for frontend consumption
      const internalPattern = /webhook|health|cron|internal|^\/diag(\/|$)|^\/ops\/|^\/api\/v1\/|^\/copilot\/|^\/audit$|^\/auth\/send-verification$|incoming$|^\/kloel\/audio\/|^\/kloel\/pdf\/|^\/kloel\/onboarding-legacy\/|^\/kloel\/agent\/.*\/(process|simulate)$|^\/autopilot\/process$|^\/kloel\/upload\/multiple$|^\/kloel\/upload-chat$|^\/audio\/synthesize$|^\/media\/video\/ping$|^\/whatsapp-api\/send\/|^\/kyc\/auto-check$|^\/kyc\/[^/]+\/approve$|^\/whatsapp-api\/cia\/conversations\//i;
      if (route.isPublic || internalPattern.test(route.fullPath)) continue;

      breaks.push({
        type: 'ROUTE_NO_CALLER',
        severity: 'low',
        file: route.file,
        line: route.line,
        description: `${route.httpMethod} ${route.fullPath} is not called by any frontend code`,
        detail: `Controller: ${route.methodName}`,
      });
    }
  }

  // === Orphaned Prisma models ===
  for (const model of prismaModels) {
    if (usedModels.has(model.accessorName)) continue;

    // Check if ANY service uses this model
    const usedInService = serviceTraces.some(t =>
      t.prismaModels.includes(model.accessorName)
    );
    if (usedInService) {
      usedModels.add(model.accessorName);
      continue;
    }

    // Skip common infrastructure models
    if (/^(Workspace|Agent|RefreshToken|PasswordResetToken|DeviceToken)$/.test(model.name)) continue;

    breaks.push({
      type: 'MODEL_ORPHAN',
      severity: 'medium',
      file: `backend/prisma/schema.prisma`,
      line: model.line,
      description: `Model ${model.name} has no service or controller accessing it`,
      detail: `Fields: ${model.fields.slice(0, 5).map(f => f.name).join(', ')}${model.fields.length > 5 ? '...' : ''}`,
    });
  }

  // === UI dead handlers ===
  for (const el of uiElements) {
    if (el.handlerType === 'dead' || el.handlerType === 'noop') {
      breaks.push({
        type: 'UI_DEAD_HANDLER',
        severity: el.handlerType === 'noop' ? 'high' : 'medium',
        file: el.file,
        line: el.line,
        description: `${el.type} "${el.label}" has ${el.handlerType} handler`,
        detail: `Handler: ${(el.handler || '').slice(0, 80)}`,
      });
    }
  }

  // === Facades ===
  for (const f of facades) {
    breaks.push({
      type: 'FACADE',
      severity: f.severity,
      file: f.file,
      line: f.line,
      description: `[${f.type}] ${f.description}`,
      detail: f.evidence,
    });
  }

  // === Proxy routes without upstream ===
  for (const proxy of proxyRoutes) {
    const backendKey = `${proxy.httpMethod}:${normalizeForMatch(proxy.backendPath)}`;
    if (!routeLookup.has(backendKey)) {
      // Try fuzzy
      let found = false;
      for (const [key] of routeLookup) {
        const [, rPath] = key.split(':');
        if (normalizeForMatch(proxy.backendPath).startsWith(rPath)) {
          found = true;
          break;
        }
      }
      if (!found) {
        breaks.push({
          type: 'PROXY_NO_UPSTREAM',
          severity: 'medium',
          file: proxy.file,
          line: proxy.line,
          description: `Proxy ${proxy.httpMethod} ${proxy.frontendPath} -> ${proxy.backendPath} has no backend route`,
          detail: '',
        });
      }
    }
  }

  // === Merge extended breaks from new parsers ===
  if (input.extendedBreaks) {
    breaks.push(...input.extendedBreaks);
  }

  // === Health Score ===
  // totalNodes represents the full codebase scope for scoring
  // Extended parsers scan many more artifacts, so we include their count
  const coreNodes = apiCalls.length + backendRoutes.length + prismaModels.length;
  const extendedNodes = (input.extendedBreaks?.length || 0) + coreNodes;
  const totalNodes = Math.max(coreNodes, extendedNodes);
  const critBreaks = breaks.filter(b => b.severity === 'critical').length;
  const highBreaks = breaks.filter(b => b.severity === 'high').length;
  const medBreaks = breaks.filter(b => b.severity === 'medium').length;
  const lowBreaks = breaks.filter(b => b.severity === 'low').length;
  // Weighted penalty: critical issues tank the score, low issues barely affect it
  const weightedPenalty = critBreaks * 3 + highBreaks * 1.5 + medBreaks * 0.5 + lowBreaks * 0.1;
  const penalty = totalNodes > 0
    ? (weightedPenalty / totalNodes) * 100
    : 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  // Stats
  const uiDeadHandlers = uiElements.filter(e => e.handlerType === 'dead' || e.handlerType === 'noop').length;
  const apiNoRoute = breaks.filter(b => b.type === 'API_NO_ROUTE').length;
  const backendEmpty = breaks.filter(b => b.type === 'ROUTE_EMPTY').length;
  const modelOrphans = breaks.filter(b => b.type === 'MODEL_ORPHAN').length;
  const facadeBreaks = breaks.filter(b => b.type === 'FACADE');
  const securityTypes = new Set(['ROUTE_NO_AUTH', 'HARDCODED_SECRET', 'SQL_INJECTION_RISK', 'CSRF_UNPROTECTED', 'XSS_DANGEROUS_HTML', 'EVAL_USAGE', 'COOKIE_NOT_HTTPONLY', 'SENSITIVE_DATA_IN_LOG', 'INTERNAL_ERROR_EXPOSED', 'MISSING_WORKSPACE_FILTER']);
  const dataSafetyTypes = new Set(['FINANCIAL_NO_TRANSACTION', 'DANGEROUS_DELETE', 'TOFIX_WITHOUT_PARSE', 'DIVISION_BY_ZERO_RISK', 'JSON_PARSE_UNSAFE', 'EMPTY_CATCH', 'FINANCIAL_ERROR_SWALLOWED']);
  const securityIssues = breaks.filter(b => securityTypes.has(b.type)).length;
  const dataSafetyIssues = breaks.filter(b => dataSafetyTypes.has(b.type)).length;
  const qualityIssues = breaks.filter(b => !securityTypes.has(b.type) && !dataSafetyTypes.has(b.type) && b.type !== 'API_NO_ROUTE' && b.type !== 'ROUTE_NO_CALLER' && b.type !== 'ROUTE_EMPTY' && b.type !== 'MODEL_ORPHAN' && b.type !== 'UI_DEAD_HANDLER' && b.type !== 'FACADE' && b.type !== 'PROXY_NO_UPSTREAM').length;

  return {
    score,
    totalNodes,
    breaks: breaks.sort((a, b) => {
      const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
    }),
    stats: {
      uiElements: uiElements.length,
      uiDeadHandlers,
      apiCalls: apiCalls.length,
      apiNoRoute,
      backendRoutes: backendRoutes.length,
      backendEmpty,
      prismaModels: prismaModels.length,
      modelOrphans,
      facades: facadeBreaks.length,
      facadesBySeverity: {
        high: facadeBreaks.filter(f => f.severity === 'high').length,
        medium: facadeBreaks.filter(f => f.severity === 'medium').length,
        low: facadeBreaks.filter(f => f.severity === 'low').length,
      },
      proxyRoutes: proxyRoutes.length,
      proxyNoUpstream: breaks.filter(b => b.type === 'PROXY_NO_UPSTREAM').length,
      securityIssues,
      dataSafetyIssues,
      qualityIssues,
    },
    timestamp: new Date().toISOString(),
  };
}
