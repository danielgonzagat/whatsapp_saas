import * as fs from 'fs';
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
import { buildObservationFootprint, footprintMatchesFamilies } from './execution-observation';
import { deriveStructuralFamilies } from './structural-family';

interface BuildStructuralGraphInput {
  rootDir: string;
  coreData: CoreParserData;
  scopeState: PulseScopeState;
  resolvedManifest: PulseResolvedManifest;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}

const SIDE_EFFECT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'network_call', pattern: /\b(fetch|axios|HttpService|httpService)\b/ },
  { label: 'queue_dispatch', pattern: /\b(queue\.add|bull|bullmq)\b/i },
  { label: 'event_emit', pattern: /\b(emit|publish|dispatchEvent)\b/ },
  { label: 'message_send', pattern: /\b(send(Message|Email|Sms)?|reply|notify)\b/ },
  { label: 'file_write', pattern: /\b(writeFile|appendFile|createWriteStream)\b/ },
];

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

function readFile(rootDir: string, filePath: string): string {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return '';
  }
}

function buildSideEffectSignals(
  rootDir: string,
  files: string[],
  scopeByPath: Map<string, PulseScopeState['files'][number]>,
  truthMode: PulseTruthMode,
): PulseStructuralNode[] {
  const nodes: PulseStructuralNode[] = [];

  for (const filePath of unique(files).filter(Boolean)) {
    const relativePath = normalizePath(filePath);
    const content = readFile(rootDir, relativePath);
    if (!content) {
      continue;
    }

    for (const signal of SIDE_EFFECT_PATTERNS) {
      if (!signal.pattern.test(content)) {
        continue;
      }
      const file = scopeByPath.get(relativePath) || null;
      nodes.push({
        id: `side-effect:${compactWords(relativePath)}:${signal.label}`,
        kind: 'side_effect_signal',
        role: 'side_effect',
        truthMode,
        adapter: 'side-effect-signal',
        label: `${signal.label} in ${path.basename(relativePath)}`,
        file: relativePath,
        line: 1,
        userFacing: Boolean(file?.userFacing),
        runtimeCritical: Boolean(file?.runtimeCritical),
        protectedByGovernance: Boolean(file?.protectedByGovernance),
        metadata: {
          signal: signal.label,
          filePath: relativePath,
        },
      });
    }
  }

  return nodes;
}

function nodeFamilies(node: PulseStructuralNode): string[] {
  const apiCalls = Array.isArray(node.metadata.apiCalls)
    ? (node.metadata.apiCalls as string[])
    : [];
  const serviceCalls = Array.isArray(node.metadata.serviceCalls)
    ? (node.metadata.serviceCalls as string[])
    : [];
  const prismaModels = Array.isArray(node.metadata.prismaModels)
    ? (node.metadata.prismaModels as string[])
    : [];

  return deriveStructuralFamilies([
    node.file,
    node.label,
    String(node.metadata.normalizedPath || ''),
    String(node.metadata.endpoint || ''),
    String(node.metadata.frontendPath || ''),
    String(node.metadata.backendPath || ''),
    String(node.metadata.fullPath || ''),
    String(node.metadata.modelName || ''),
    String(node.metadata.serviceName || ''),
    String(node.metadata.methodName || ''),
    ...apiCalls,
    ...serviceCalls,
    ...prismaModels,
  ]);
}

function shouldSeedObservedNode(
  node: PulseStructuralNode,
  footprint: ReturnType<typeof buildObservationFootprint>,
): boolean {
  if (footprint.routeFamilies.length === 0 && footprint.moduleFamilies.length === 0) {
    return false;
  }

  if (!['interface', 'orchestration', 'simulation'].includes(node.role) && node.kind !== 'facade') {
    return false;
  }

  return footprintMatchesFamilies(nodeFamilies(node), footprint);
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
    const proxyNode = proxyByFrontendPath.get(normalizedPath);
    if (proxyNode) {
      edges.push(buildEdge(apiNode.id, proxyNode.id, 'proxies_to', truthMode, 'proxy-bridge'));
    }

    const routeNode = routeByPath.get(normalizedPath);
    if (routeNode) {
      edges.push(buildEdge(apiNode.id, routeNode.id, 'routes_to', truthMode, 'api-route-match'));
    }
  }

  for (const proxyNode of proxyNodes) {
    const backendPath = normalizeRoute(String(proxyNode.metadata.backendPath || ''));
    const routeNode = routeByPath.get(backendPath);
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

  const observationFootprint = buildObservationFootprint(
    input.resolvedManifest,
    input.executionEvidence,
  );
  const incomingByNode = new Map<string, PulseStructuralEdge[]>();
  for (const edge of edges) {
    if (!incomingByNode.has(edge.to)) {
      incomingByNode.set(edge.to, []);
    }
    incomingByNode.get(edge.to)!.push(edge);
  }

  const backwardObservableKinds = new Set<PulseStructuralEdge['kind']>([
    'calls',
    'proxies_to',
    'routes_to',
  ]);
  const observedNodeIds = new Set(
    nodes
      .filter((node) => shouldSeedObservedNode(node, observationFootprint))
      .map((node) => node.id),
  );
  const observedEdgeIds = new Set<string>();
  const observationQueue = [...observedNodeIds];

  while (observationQueue.length > 0) {
    const currentNodeId = observationQueue.shift()!;

    for (const edge of outwardByNode.get(currentNodeId) || []) {
      observedEdgeIds.add(edge.id);
      if (!observedNodeIds.has(edge.to)) {
        observedNodeIds.add(edge.to);
        observationQueue.push(edge.to);
      }
    }

    for (const edge of incomingByNode.get(currentNodeId) || []) {
      if (!backwardObservableKinds.has(edge.kind)) {
        continue;
      }
      observedEdgeIds.add(edge.id);
      if (!observedNodeIds.has(edge.from)) {
        observedNodeIds.add(edge.from);
        observationQueue.push(edge.from);
      }
    }
  }

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
    nodes: nodes
      .map((node) =>
        observedNodeIds.has(node.id)
          ? {
              ...node,
              truthMode: 'observed' as const,
            }
          : node,
      )
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges
      .map((edge) =>
        observedEdgeIds.has(edge.id)
          ? {
              ...edge,
              truthMode: 'observed' as const,
            }
          : edge,
      )
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}
