/** Build graph. */
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

  const breaks: Break[] = [];
  const routeLookup = buildRouteLookup(backendRoutes, globalPrefix);
  const serviceModelMap = buildServiceModelMap(serviceTraces);
  const authEvidenceTokens = buildAuthEvidenceTokens(backendRoutes);
  const stateEvidenceTokens = buildStateEvidenceTokens(prismaModels, serviceTraces);

  // Track which routes are consumed
  const consumedRoutes = new Set<string>();
  const consumedServiceCalls = new Set<string>();
  // Track which models are used
  const usedModels = new Set<string>();

  // === API → Backend matching ===
  for (const call of apiCalls) {
    if (inferCallRunsInsideFrontendRuntime(call, proxyRoutes)) {
      continue;
    }

    const route = matchApiCallToRoute(call, routeLookup, proxyRoutes);
    if (route) {
      const key = routeKeyFor(route);
      consumedRoutes.add(key);
      route.serviceCalls.forEach((serviceCall) => consumedServiceCalls.add(serviceCall));

      // Trace models used by this route
      const models = resolveRouteModels(route, serviceModelMap, serviceTraces);
      models.forEach((m) => usedModels.add(m));
    } else {
      // Check if it's a known proxy route (handled by Next.js, not a break)
      if (call.isProxy) {
        const proxyExists = proxyRoutes.some(
          (p) => normalizeForMatch(p.frontendPath) === normalizeForMatch(call.normalizedPath),
        );
        if (proxyExists) {
          continue;
        }
      }

      breaks.push(
        graphFinding({
          kind: 'route_target_unmatched',
          severity: 'high',
          file: call.file,
          line: call.line,
          description: `${call.method} ${call.normalizedPath} has no matching backend route`,
          detail: `Pattern: ${call.callPattern}, endpoint: ${call.endpoint}`,
          surface: 'api-connectivity',
        }),
      );
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

  // === Backend routes not consumed ===
  for (const route of backendRoutes) {
    const key = routeKeyFor(route);
    if (!consumedRoutes.has(key)) {
      if (inferRouteHasExternalCaller(route)) {
        continue;
      }

      breaks.push(
        graphFinding({
          kind: 'route_caller_unobserved',
          severity: 'low',
          file: route.file,
          line: route.line,
          description: `${route.httpMethod} ${route.fullPath} is not called by frontend code`,
          detail: `Controller: ${route.methodName}`,
          surface: 'route-connectivity',
        }),
      );
    }
  }

  // === Orphaned Prisma models ===
  for (const model of prismaModels) {
    if (usedModels.has(model.accessorName)) {
      continue;
    }

    if (inferModelUsageEvidence({ model, serviceTraces, consumedServiceCalls })) {
      usedModels.add(model.accessorName);
      continue;
    }

    breaks.push(
      graphFinding({
        kind: 'state_model_access_unobserved',
        severity: 'medium',
        file: `backend/prisma/schema.prisma`,
        line: model.line,
        description: `Model ${model.name} has no service or controller accessing it`,
        detail: `Fields: ${model.fields
          .slice(0, 5)
          .map((f) => f.name)
          .join(', ')}${model.fields.length > 5 ? '...' : ''}`,
        surface: 'state-access',
      }),
    );
  }

  // === UI dead handlers ===
  for (const el of uiElements) {
    if (el.handlerType === 'dead' || el.handlerType === 'noop') {
      breaks.push(
        graphFinding({
          kind: 'ui_handler_effect_unobserved',
          severity: el.handlerType === 'noop' ? 'high' : 'medium',
          file: el.file,
          line: el.line,
          description: `${el.type} "${el.label}" has ${el.handlerType} handler`,
          detail: `Handler: ${(el.handler || '').slice(0, 80)}`,
          surface: 'ui-interaction',
        }),
      );
    }
  }

  // === Facades ===
  for (const f of facades) {
    breaks.push(
      graphFinding({
        kind: 'facade_evidence',
        severity: f.severity,
        file: f.file,
        line: f.line,
        description: `[${f.type}] ${f.description}`,
        detail: f.evidence,
        surface: 'capability-materialization',
      }),
    );
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
        breaks.push(
          graphFinding({
            kind: 'proxy_upstream_unmatched',
            severity: 'medium',
            file: proxy.file,
            line: proxy.line,
            description: `Proxy ${proxy.httpMethod} ${proxy.frontendPath} -> ${proxy.backendPath} has no backend route`,
            detail: '',
            surface: 'proxy-connectivity',
          }),
        );
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
  const score = calculateDynamicScore(totalNodes, breaks);

  // Stats
  const uiDeadHandlers = uiElements.filter(
    (e) => e.handlerType === 'dead' || e.handlerType === 'noop',
  ).length;
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
    0,
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
        high: facadeBreaks.filter((f) => f.severity === 'high').length,
        medium: facadeBreaks.filter((f) => f.severity === 'medium').length,
        low: facadeBreaks.filter((f) => f.severity === 'low').length,
      },
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

