import type { Break } from '../../types.manifest';
import type { PulseHealth } from '../../types.health';
import {
  normalizeForMatch,
  routeKeyFor,
  inferCallRunsInsideFrontendRuntime,
  inferRouteHasExternalCaller,
  inferModelUsageEvidence,
  isUselessHandlerType,
  isNoopHandlerType,
  countBySourceKind,
  countByDynamicEvent,
  countAuthRiskIssues,
  countStateRiskIssues,
  calculateDynamicScore,
  resolveSeverityRankOrder,
  resolveBreakSeverityLabels,
  graphFinding,
  buildAuthEvidenceTokens,
  buildStateEvidenceTokens,
} from './graph-part1-core';
import {
  buildRouteLookup,
  matchApiCallToRoute,
  buildServiceModelMap,
  resolveRouteModels,
  type PulseGraphInput,
} from './graph-part2-routing';
import { buildApiModuleMap } from '../../parsers/api-parser';
import { deriveZeroValue } from '../../dynamic-reality-kernel/catalog-arithmetic';

export function buildGraph(input: PulseGraphInput): PulseHealth {
  const {
    uiElements,
    apiCalls,
    backendRoutes,
    prismaModels,
    serviceTraces,
    proxyRoutes,
    facades,
    globalPrefix,
  } = input;

  let breaks: Break[] = [];
  const routeLookup = buildRouteLookup(backendRoutes, globalPrefix);
  const serviceModelMap = buildServiceModelMap(serviceTraces);
  const authEvidenceTokens = buildAuthEvidenceTokens(backendRoutes);
  const stateEvidenceTokens = buildStateEvidenceTokens(prismaModels, serviceTraces);

  const consumedRoutes = new Set<string>();
  const consumedServiceCalls = new Set<string>();
  const usedModels = new Set<string>();

  for (const call of apiCalls) {
    if (inferCallRunsInsideFrontendRuntime(call, proxyRoutes)) {
      continue;
    }

    const route = matchApiCallToRoute(call, routeLookup, proxyRoutes);
    if (route) {
      const key = routeKeyFor(route);
      consumedRoutes.add(key);
      route.serviceCalls.forEach((serviceCall) => consumedServiceCalls.add(serviceCall));

      const models = resolveRouteModels(route, serviceModelMap, serviceTraces);
      models.forEach((m) => usedModels.add(m));
    } else {
      if (call.isProxy) {
        const proxyExists = proxyRoutes.some(
          (p) => normalizeForMatch(p.frontendPath) === normalizeForMatch(call.normalizedPath),
        );
        if (proxyExists) {
          continue;
        }
      }

      breaks = [
        ...breaks,
        graphFinding({
          kind: 'route_target_unmatched',
          severity: 'high',
          file: call.file,
          line: call.line,
          description: `${call.method} ${call.normalizedPath} has no matching backend route`,
          detail: `Pattern: ${call.callPattern}, endpoint: ${call.endpoint}`,
          surface: 'api-connectivity',
        }),
      ];
    }
  }

  if (input.config) {
    const apiModuleMap = buildApiModuleMap(input.config);
    for (const [, { endpoint }] of apiModuleMap.entries()) {
      let targetPath = endpoint;
      if (targetPath.startsWith('/api/')) {
        targetPath = targetPath.replace(/^\/api\//, '/');
      }
      const normalTarget = normalizeForMatch(targetPath);
      for (const [routeKey, route] of routeLookup) {
        const rPath = routeKey.substring(routeKey.indexOf(':') + 1);
        if (
          rPath === normalTarget ||
          normalTarget.startsWith(rPath + '/') ||
          rPath.startsWith(normalTarget + '/')
        ) {
          consumedRoutes.add(routeKey);
          route.serviceCalls.forEach((serviceCall) => consumedServiceCalls.add(serviceCall));
          const models = resolveRouteModels(route, serviceModelMap, serviceTraces);
          models.forEach((m) => usedModels.add(m));
        }
      }
    }
  }

  for (const route of backendRoutes) {
    const key = routeKeyFor(route);
    if (!consumedRoutes.has(key)) {
      if (inferRouteHasExternalCaller(route)) {
        continue;
      }

      breaks = [
        ...breaks,
        graphFinding({
          kind: 'route_caller_unobserved',
          severity: 'low',
          file: route.file,
          line: route.line,
          description: `${route.httpMethod} ${route.fullPath} is not called by frontend code`,
          detail: `Controller: ${route.methodName}`,
          surface: 'route-connectivity',
        }),
      ];
    }
  }

  for (const model of prismaModels) {
    if (usedModels.has(model.accessorName)) {
      continue;
    }

    if (inferModelUsageEvidence({ model, serviceTraces, consumedServiceCalls })) {
      usedModels.add(model.accessorName);
      continue;
    }

    breaks = [
      ...breaks,
      graphFinding({
        kind: 'state_model_access_unobserved',
        severity: 'medium',
        file: 'backend/prisma/schema.prisma',
        line: model.line,
        description: `Model ${model.name} has no service or controller accessing it`,
        detail: `Fields: ${model.fields
          .slice(0, 5)
          .map((f) => f.name)
          .join(', ')}${model.fields.length > 5 ? '...' : ''}`,
        surface: 'state-access',
      }),
    ];
  }

  for (const el of uiElements) {
    if (isUselessHandlerType(el.handlerType)) {
      breaks = [
        ...breaks,
        graphFinding({
          kind: 'ui_handler_effect_unobserved',
          severity: isNoopHandlerType(el.handlerType) ? 'high' : 'medium',
          file: el.file,
          line: el.line,
          description: `${el.type} "${el.label}" has ${el.handlerType} handler`,
          detail: `Handler: ${(el.handler || '').slice(0, 80)}`,
          surface: 'ui-interaction',
        }),
      ];
    }
  }

  for (const f of facades) {
    breaks = [
      ...breaks,
      graphFinding({
        kind: 'facade_evidence',
        severity: f.severity,
        file: f.file,
        line: f.line,
        description: `[${f.type}] ${f.description}`,
        detail: f.evidence,
        surface: 'capability-materialization',
      }),
    ];
  }

  for (const proxy of proxyRoutes) {
    const backendKey = `${proxy.httpMethod}:${normalizeForMatch(proxy.backendPath)}`;
    if (!routeLookup.has(backendKey)) {
      let found = false;
      for (const [key] of routeLookup) {
        const [, rPath] = key.split(':');
        if (normalizeForMatch(proxy.backendPath).startsWith(rPath)) {
          found = true;
          break;
        }
      }
      if (!found) {
        breaks = [
          ...breaks,
          graphFinding({
            kind: 'proxy_upstream_unmatched',
            severity: 'medium',
            file: proxy.file,
            line: proxy.line,
            description: `Proxy ${proxy.httpMethod} ${proxy.frontendPath} -> ${proxy.backendPath} has no backend route`,
            detail: '',
            surface: 'proxy-connectivity',
          }),
        ];
      }
    }
  }

  if (input.extendedBreaks) {
    breaks = [...breaks, ...input.extendedBreaks];
  }

  const coreNodes = apiCalls.length + backendRoutes.length + prismaModels.length;
  const extendedNodes = (input.extendedBreaks?.length || deriveZeroValue()) + coreNodes;
  const totalNodes = Math.max(coreNodes, extendedNodes);
  const score = calculateDynamicScore(totalNodes, breaks);

  const uiDeadHandlers = uiElements.filter((e) => isUselessHandlerType(e.handlerType)).length;
  const apiNoRoute = countBySourceKind(breaks, 'route_target_unmatched');
  const backendEmpty = countByDynamicEvent(breaks, /\bempty\b/i);
  const modelOrphans = countBySourceKind(breaks, 'state_model_access_unobserved');
  const facadeBreaks = breaks.filter(
    (item) => item.source === 'graph:confirmed_static:facade_evidence',
  );
  const securityIssues = countAuthRiskIssues(breaks, authEvidenceTokens);
  const dataSafetyIssues = countStateRiskIssues(breaks, stateEvidenceTokens, authEvidenceTokens);
  const graphOwnedIssues =
    apiNoRoute +
    countBySourceKind(breaks, 'route_caller_unobserved') +
    backendEmpty +
    modelOrphans +
    countBySourceKind(breaks, 'ui_handler_effect_unobserved') +
    facadeBreaks.length +
    countBySourceKind(breaks, 'proxy_upstream_unmatched');
  const unavailableChecks = countByDynamicEvent(breaks, /\bunavailable\b/i);
  const unknownSurfaces = countByDynamicEvent(breaks, /\bunknown surface\b/i);
  const qualityIssues = Math.max(
    deriveZeroValue(),
    breaks.length -
      securityIssues -
      dataSafetyIssues -
      graphOwnedIssues -
      unavailableChecks -
      unknownSurfaces,
  );

  return {
    score,
    totalNodes,
    breaks: breaks.sort((a, b) => {
      const severityRank = resolveSeverityRankOrder();
      const maxRank = severityRank.size;
      return (severityRank.get(a.severity) ?? maxRank) - (severityRank.get(b.severity) ?? maxRank);
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
      facadesBySeverity: (() => {
        const sl = resolveBreakSeverityLabels();
        return {
          high: facadeBreaks.filter((f) => sl.has(f.severity) && f.severity === 'high').length,
          medium: facadeBreaks.filter((f) => sl.has(f.severity) && f.severity === 'medium').length,
          low: facadeBreaks.filter((f) => sl.has(f.severity) && f.severity === 'low').length,
        };
      })(),
      proxyRoutes: proxyRoutes.length,
      proxyNoUpstream: countBySourceKind(breaks, 'proxy_upstream_unmatched'),
      securityIssues,
      dataSafetyIssues,
      qualityIssues,
      unavailableChecks,
      unknownSurfaces,
    },
    timestamp: new Date().toISOString(),
  };
}
