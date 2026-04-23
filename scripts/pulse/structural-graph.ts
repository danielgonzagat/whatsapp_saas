import * as path from 'path';
import type { CoreParserData } from './functional-map-types';
import type {
  PulseExecutionEvidence,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralEdge,
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseStructuralRole,
  PulseTruthMode,
} from './types';
import { buildSideEffectSignals } from './structural-side-effects';
import { markObservedStructuralGraph } from './structural-observation';

interface BuildStructuralGraphInput {
  rootDir: string;
  coreData: CoreParserData;
  scopeState: PulseScopeState;
  resolvedManifest: PulseResolvedManifest;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function compactWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildMethodRouteKey(
  method: string | null | undefined,
  routePath: string | null | undefined,
) {
  const normalizedMethod = String(method || '')
    .trim()
    .toUpperCase();
  const normalizedPath = normalizeRoute(String(routePath || ''));
  if (!normalizedMethod || !normalizedPath) {
    return null;
  }
  return `${normalizedMethod} ${normalizedPath}`;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function normalizeRoute(value: string): string {
  return (
    String(value || '')
      .trim()
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/'
  );
}

function buildNode(
  id: string,
  kind: PulseStructuralNode['kind'],
  role: PulseStructuralRole,
  truthMode: PulseTruthMode,
  label: string,
  file: string,
  line: number,
  adapter: string,
  scopeByPath: Map<string, PulseScopeState['files'][number]>,
  metadata: Record<string, string | number | boolean | string[] | null>,
): PulseStructuralNode {
  const scopeFile = scopeByPath.get(file) || null;
  return {
    id,
    kind,
    role,
    truthMode,
    adapter,
    label,
    file,
    line,
    userFacing: Boolean(scopeFile?.userFacing),
    runtimeCritical: Boolean(scopeFile?.runtimeCritical),
    protectedByGovernance: Boolean(scopeFile?.protectedByGovernance),
    metadata,
  };
}

function buildEdge(
  from: string,
  to: string,
  kind: PulseStructuralEdge['kind'],
  truthMode: PulseTruthMode,
  evidence: string,
): PulseStructuralEdge {
  return {
    id: `${kind}:${from}->${to}`,
    from,
    to,
    kind,
    truthMode,
    evidence,
  };
}

/** Build the universal structural graph from the current parser data. */
export function buildStructuralGraph(input: BuildStructuralGraphInput): PulseStructuralGraph {
  const truthMode: PulseTruthMode = 'inferred';
  const scopeByPath = new Map(input.scopeState.files.map((file) => [file.path, file] as const));
  const nodes: PulseStructuralNode[] = [];
  const edges: PulseStructuralEdge[] = [];

  const uiNodes = input.coreData.uiElements.map((element) =>
    buildNode(
      `ui:${compactWords(element.file)}:${element.line}:${compactWords(element.handler || element.label || 'interaction')}`,
      'ui_element',
      'interface',
      truthMode,
      element.label || element.handler || 'UI interaction',
      normalizePath(element.file),
      element.line,
      'ui-element',
      scopeByPath,
      {
        handler: element.handler,
        handlerType: element.handlerType,
        apiCalls: unique(element.apiCalls),
      },
    ),
  );
  nodes.push(...uiNodes);

  const apiNodes = input.coreData.apiCalls.map((apiCall) =>
    buildNode(
      `api:${compactWords(apiCall.file)}:${apiCall.line}:${apiCall.method}:${compactWords(apiCall.normalizedPath)}`,
      'api_call',
      'interface',
      truthMode,
      `${apiCall.method.toUpperCase()} ${normalizeRoute(apiCall.normalizedPath)}`,
      normalizePath(apiCall.file),
      apiCall.line,
      'api-call',
      scopeByPath,
      {
        httpMethod: apiCall.method.toUpperCase(),
        endpoint: normalizeRoute(apiCall.endpoint),
        normalizedPath: normalizeRoute(apiCall.normalizedPath),
        isProxy: apiCall.isProxy,
      },
    ),
  );
  nodes.push(...apiNodes);

  const proxyNodes = input.coreData.proxyRoutes.map((proxyRoute) =>
    buildNode(
      `proxy:${compactWords(proxyRoute.file)}:${proxyRoute.line}:${proxyRoute.httpMethod}:${compactWords(proxyRoute.frontendPath)}`,
      'proxy_route',
      'orchestration',
      truthMode,
      `${proxyRoute.httpMethod.toUpperCase()} ${normalizeRoute(proxyRoute.frontendPath)}`,
      normalizePath(proxyRoute.file),
      proxyRoute.line,
      'proxy-route',
      scopeByPath,
      {
        httpMethod: proxyRoute.httpMethod.toUpperCase(),
        frontendPath: normalizeRoute(proxyRoute.frontendPath),
        backendPath: normalizeRoute(proxyRoute.backendPath),
      },
    ),
  );
  nodes.push(...proxyNodes);

  const routeNodes = input.coreData.backendRoutes.map((backendRoute) =>
    buildNode(
      `route:${compactWords(backendRoute.file)}:${backendRoute.line}:${backendRoute.httpMethod}:${compactWords(backendRoute.fullPath)}`,
      'backend_route',
      'orchestration',
      truthMode,
      `${backendRoute.httpMethod.toUpperCase()} ${normalizeRoute(backendRoute.fullPath)}`,
      normalizePath(backendRoute.file),
      backendRoute.line,
      'backend-route',
      scopeByPath,
      {
        httpMethod: backendRoute.httpMethod.toUpperCase(),
        fullPath: normalizeRoute(backendRoute.fullPath),
        controllerPath: backendRoute.controllerPath,
        methodName: backendRoute.methodName,
        guards: unique(backendRoute.guards),
        serviceCalls: unique(backendRoute.serviceCalls),
      },
    ),
  );
  nodes.push(...routeNodes);

  const serviceNodes = input.coreData.serviceTraces.map((trace) =>
    buildNode(
      `service:${compactWords(trace.file)}:${trace.line}:${compactWords(trace.serviceName)}:${compactWords(trace.methodName)}`,
      'service_trace',
      'orchestration',
      truthMode,
      `${trace.serviceName}.${trace.methodName}`,
      normalizePath(trace.file),
      trace.line,
      'service-trace',
      scopeByPath,
      {
        serviceName: trace.serviceName,
        methodName: trace.methodName,
        prismaModels: unique(trace.prismaModels),
      },
    ),
  );
  nodes.push(...serviceNodes);

  const persistenceNodes = input.coreData.prismaModels.map((model) =>
    buildNode(
      `persistence:${compactWords(model.name)}`,
      'persistence_model',
      'persistence',
      'inferred',
      model.name,
      'backend/prisma/schema.prisma',
      model.line,
      'prisma-model',
      scopeByPath,
      {
        modelName: model.name,
        accessorName: model.accessorName,
      },
    ),
  );
  nodes.push(...persistenceNodes);

  const facadeNodes = input.coreData.facades.map((facade) =>
    buildNode(
      `facade:${compactWords(facade.file)}:${facade.line}:${facade.type}`,
      'facade',
      'simulation',
      'inferred',
      facade.description,
      normalizePath(facade.file),
      facade.line,
      'facade-detector',
      scopeByPath,
      {
        facadeType: facade.type,
        severity: facade.severity,
        evidence: facade.evidence,
      },
    ),
  );
  nodes.push(...facadeNodes);

  nodes.push(
    ...buildSideEffectSignals(
      input.rootDir,
      [
        ...input.coreData.backendRoutes.map((item) => normalizePath(item.file)),
        ...input.coreData.serviceTraces.map((item) => normalizePath(item.file)),
        ...input.coreData.proxyRoutes.map((item) => normalizePath(item.file)),
      ],
      scopeByPath,
      truthMode,
    ),
  );

  const apiByPath = new Map(
    apiNodes.map((node) => [String(node.metadata.normalizedPath || ''), node] as const),
  );
  const proxyByFrontendPath = new Map(
    proxyNodes.map((node) => [String(node.metadata.frontendPath || ''), node] as const),
  );
  const routeByMethodPath = new Map(
    routeNodes
      .map((node) => {
        const key = buildMethodRouteKey(
          String(node.metadata.httpMethod || ''),
          String(node.metadata.fullPath || ''),
        );
        return key ? ([key, node] as const) : null;
      })
      .filter((value): value is readonly [string, (typeof routeNodes)[number]] => Boolean(value)),
  );
  const routeByPath = new Map(
    routeNodes.map((node) => [String(node.metadata.fullPath || ''), node] as const),
  );
  const serviceBySignature = new Map(
    serviceNodes.flatMap((node) => {
      const serviceName = String(node.metadata.serviceName || '');
      const methodName = String(node.metadata.methodName || '');
      return [
        [`${serviceName}.${methodName}`.toLowerCase(), node] as const,
        [serviceName.toLowerCase(), node] as const,
      ];
    }),
  );
  const serviceByFileMethod = new Map<string, PulseStructuralNode[]>();
  for (const node of serviceNodes) {
    const methodName = String(node.metadata.methodName || '');
    const key = `${node.file}:${methodName}`.toLowerCase();
    const current = serviceByFileMethod.get(key) || [];
    current.push(node);
    serviceByFileMethod.set(key, current);
  }
  const persistenceByModel = new Map(
    persistenceNodes.map(
      (node) => [String(node.metadata.modelName || '').toLowerCase(), node] as const,
    ),
  );

  for (const uiNode of uiNodes) {
    const apiCalls = Array.isArray(uiNode.metadata.apiCalls)
      ? (uiNode.metadata.apiCalls as string[])
      : [];
    for (const apiCall of apiCalls) {
      const normalized = normalizeRoute(apiCall);
      const target = apiByPath.get(normalized);
      if (target) {
        edges.push(buildEdge(uiNode.id, target.id, 'calls', truthMode, 'ui-api-link'));
      }
    }
  }

  for (const apiNode of apiNodes) {
    const normalizedPath = normalizeRoute(String(apiNode.metadata.normalizedPath || ''));
    const httpMethod = String(apiNode.metadata.httpMethod || '').toUpperCase();
    const proxyNode = proxyByFrontendPath.get(normalizedPath);
    if (proxyNode) {
      edges.push(buildEdge(apiNode.id, proxyNode.id, 'proxies_to', truthMode, 'proxy-bridge'));
    }

    const routeNode =
      routeByMethodPath.get(buildMethodRouteKey(httpMethod, normalizedPath) || '') ||
      routeByPath.get(normalizedPath);
    if (routeNode) {
      edges.push(buildEdge(apiNode.id, routeNode.id, 'routes_to', truthMode, 'api-route-match'));
    }
  }

  for (const proxyNode of proxyNodes) {
    const backendPath = normalizeRoute(String(proxyNode.metadata.backendPath || ''));
    const httpMethod = String(proxyNode.metadata.httpMethod || '').toUpperCase();
    const routeNode =
      routeByMethodPath.get(buildMethodRouteKey(httpMethod, backendPath) || '') ||
      routeByPath.get(backendPath);
    if (routeNode) {
      edges.push(
        buildEdge(proxyNode.id, routeNode.id, 'routes_to', truthMode, 'proxy-route-match'),
      );
    }
  }

  for (const routeNode of routeNodes) {
    const serviceCalls = Array.isArray(routeNode.metadata.serviceCalls)
      ? (routeNode.metadata.serviceCalls as string[])
      : [];
    const routeMethodName = String(routeNode.metadata.methodName || '');
    const sameMethodTraces = serviceByFileMethod.get(
      `${routeNode.file}:${routeMethodName}`.toLowerCase(),
    );
    for (const sameMethodTrace of sameMethodTraces || []) {
      edges.push(
        buildEdge(
          routeNode.id,
          sameMethodTrace.id,
          'orchestrates',
          truthMode,
          'route-same-method-trace',
        ),
      );
    }
    for (const serviceCall of serviceCalls) {
      const target =
        serviceBySignature.get(serviceCall.toLowerCase()) ||
        serviceBySignature.get(serviceCall.split('.').shift()?.toLowerCase() || '');
      if (target) {
        edges.push(
          buildEdge(routeNode.id, target.id, 'orchestrates', truthMode, 'route-service-call'),
        );
      }
    }
  }

  for (const serviceNode of serviceNodes) {
    const prismaModels = Array.isArray(serviceNode.metadata.prismaModels)
      ? (serviceNode.metadata.prismaModels as string[])
      : [];
    for (const modelName of prismaModels) {
      const persistenceNode = persistenceByModel.get(String(modelName).toLowerCase());
      if (persistenceNode) {
        edges.push(
          buildEdge(
            serviceNode.id,
            persistenceNode.id,
            'persists',
            'inferred',
            'service-prisma-model',
          ),
        );
      }
    }

    const sideEffects = nodes.filter(
      (node) => node.role === 'side_effect' && node.file === serviceNode.file,
    );
    for (const sideEffectNode of sideEffects) {
      edges.push(
        buildEdge(
          serviceNode.id,
          sideEffectNode.id,
          'emits',
          truthMode,
          'service-side-effect-signal',
        ),
      );
    }
  }

  for (const routeNode of routeNodes) {
    const sideEffects = nodes.filter(
      (node) => node.role === 'side_effect' && node.file === routeNode.file,
    );
    for (const sideEffectNode of sideEffects) {
      edges.push(
        buildEdge(routeNode.id, sideEffectNode.id, 'emits', truthMode, 'route-side-effect-signal'),
      );
    }
  }

  for (const facadeNode of facadeNodes) {
    const relatedNodes = nodes.filter(
      (node) =>
        node.file === facadeNode.file && node.id !== facadeNode.id && node.role !== 'simulation',
    );
    for (const relatedNode of relatedNodes) {
      edges.push(
        buildEdge(facadeNode.id, relatedNode.id, 'simulates', 'observed', 'facade-overlap'),
      );
    }
  }

  const interfaceNodeIds = new Set(
    nodes.filter((node) => node.role === 'interface').map((node) => node.id),
  );
  const outwardByNode = new Map<string, PulseStructuralEdge[]>();
  for (const edge of edges) {
    if (!outwardByNode.has(edge.from)) {
      outwardByNode.set(edge.from, []);
    }
    outwardByNode.get(edge.from)!.push(edge);
  }

  let completeChains = 0;
  let partialChains = 0;
  let simulatedChains = 0;
  for (const interfaceNodeId of interfaceNodeIds) {
    const visited = new Set<string>([interfaceNodeId]);
    const queue = [interfaceNodeId];
    let foundPersistence = false;
    let foundSideEffect = false;
    let foundSimulation = false;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const nextEdges = outwardByNode.get(current) || [];
      for (const edge of nextEdges) {
        const targetNode = nodes.find((node) => node.id === edge.to);
        if (!targetNode) {
          continue;
        }
        if (targetNode.role === 'persistence') {
          foundPersistence = true;
        }
        if (targetNode.role === 'side_effect') {
          foundSideEffect = true;
        }
        if (targetNode.role === 'simulation') {
          foundSimulation = true;
        }
        if (!visited.has(targetNode.id)) {
          visited.add(targetNode.id);
          queue.push(targetNode.id);
        }
      }
    }

    if (foundSimulation && !foundPersistence && !foundSideEffect) {
      simulatedChains += 1;
    } else if (foundPersistence || foundSideEffect) {
      completeChains += 1;
    } else {
      partialChains += 1;
    }
  }

  const observedGraph = markObservedStructuralGraph({
    nodes,
    edges,
    resolvedManifest: input.resolvedManifest,
    executionEvidence: input.executionEvidence,
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      roleCounts: {
        interface: nodes.filter((node) => node.role === 'interface').length,
        orchestration: nodes.filter((node) => node.role === 'orchestration').length,
        persistence: nodes.filter((node) => node.role === 'persistence').length,
        side_effect: nodes.filter((node) => node.role === 'side_effect').length,
        simulation: nodes.filter((node) => node.role === 'simulation').length,
      },
      interfaceChains: interfaceNodeIds.size,
      completeChains,
      partialChains,
      simulatedChains,
    },
    nodes: observedGraph.nodes,
    edges: observedGraph.edges,
  };
}
