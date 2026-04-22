import type {
  PulseExecutionChain,
  PulseExecutionChainSet,
  PulseExecutionChainStep,
  PulseStructuralEdge,
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseTruthMode,
} from './types';

interface BuildExecutionChainsInput {
  structuralGraph: PulseStructuralGraph;
}

function findPathsBetweenRoles(
  graph: PulseStructuralGraph,
  startRoles: Set<string>,
  endRoles: Set<string>,
  maxDepth: number = 10,
): Array<PulseStructuralNode[]> {
  const paths: Array<PulseStructuralNode[]> = [];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const edgesByFrom = new Map<string, PulseStructuralEdge[]>();

  for (const edge of graph.edges) {
    if (!edgesByFrom.has(edge.from)) {
      edgesByFrom.set(edge.from, []);
    }
    edgesByFrom.get(edge.from)!.push(edge);
  }

  const visited = new Set<string>();
  const queue: Array<{
    nodeId: string;
    path: PulseStructuralNode[];
    depth: number;
  }> = [];

  const startNodes = graph.nodes.filter((n) => startRoles.has(n.role));
  for (const startNode of startNodes) {
    queue.push({ nodeId: startNode.id, path: [startNode], depth: 0 });
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const { nodeId, path, depth } = current;
    const nodeKey = `${nodeId}@${path.length}`;

    if (visited.has(nodeKey) || depth >= maxDepth) {
      continue;
    }
    visited.add(nodeKey);

    const currentNode = nodeById.get(nodeId);
    if (!currentNode) {
      continue;
    }

    if (endRoles.has(currentNode.role) && path.length > 1) {
      paths.push([...path]);
    }

    const edges = edgesByFrom.get(nodeId) || [];
    for (const edge of edges) {
      const nextNode = nodeById.get(edge.to);
      if (nextNode && !path.some((n) => n.id === nextNode.id)) {
        queue.push({
          nodeId: edge.to,
          path: [...path, nextNode],
          depth: depth + 1,
        });
      }
    }
  }

  return paths;
}

function buildChainFromPath(
  path: PulseStructuralNode[],
  index: number,
  graph: PulseStructuralGraph,
): PulseExecutionChain {
  const steps: PulseExecutionChainStep[] = path.map((node, i) => ({
    id: `${node.id}:step${i}`,
    role: mapRoleToChainRole(node.role),
    nodeId: node.id,
    description: node.label || node.kind,
    truthMode: node.truthMode,
    filesInvolved: node.file ? [node.file] : [],
    modelsInvolved: extractModelsFromMetadata(node.metadata as any),
    providersInvolved: extractProvidersFromMetadata(node.metadata as any),
  }));

  const sideEffects = extractSideEffects(path, graph);
  const completeness = calculateChainCompleteness(steps);
  const failurePoints = identifyFailurePoints(steps);

  const truthMode: PulseTruthMode = steps.every((s) => s.truthMode === 'observed')
    ? 'observed'
    : steps.some((s) => s.truthMode === 'observed')
      ? 'inferred'
      : 'aspirational';

  return {
    id: `chain:${index}:${steps.map((s) => s.nodeId).join('-')}`,
    description: buildChainDescription(steps),
    entrypoint: steps[0],
    steps: steps.slice(1),
    conditionalBranches: [],
    requiredState: extractRequiredState(steps),
    sideEffects,
    completeness,
    failurePoints,
    completionProof: {
      indicator: steps[steps.length - 1]?.description || 'completion',
      verification: `final step: ${steps[steps.length - 1]?.nodeId}`,
      truthMode,
    },
    truthMode,
    confidence: {
      score: completeness.score,
      evidenceBasis: [`path_length:${steps.length}`, `completeness:${completeness.score}`],
      truthMode,
    },
  };
}

function mapRoleToChainRole(role: string): any {
  const mapping: Record<string, any> = {
    interface: 'interface',
    ui_element: 'trigger',
    api_call: 'client_api',
    proxy_route: 'controller',
    backend_route: 'controller',
    orchestration: 'orchestration',
    service_trace: 'service',
    persistence_model: 'persistence',
    side_effect: 'side_effect',
    queue: 'queue',
    worker: 'worker',
  };
  return mapping[role] || 'orchestration';
}

function extractModelsFromMetadata(metadata: Record<string, any> | undefined): string[] {
  if (!metadata) {
    return [];
  }
  const models = metadata.prismaModels || [];
  return Array.isArray(models) ? models : [];
}

function extractProvidersFromMetadata(metadata: Record<string, any> | undefined): string[] {
  if (!metadata) {
    return [];
  }
  const providers: string[] = [];
  if (metadata.externalCalls && Array.isArray(metadata.externalCalls)) {
    providers.push(...metadata.externalCalls);
  }
  if (metadata.providersInvolved && Array.isArray(metadata.providersInvolved)) {
    providers.push(...metadata.providersInvolved);
  }
  return providers;
}

function extractSideEffects(
  path: PulseStructuralNode[],
  graph: PulseStructuralGraph,
): Array<{
  type:
    | 'network_call'
    | 'queue_dispatch'
    | 'event_emit'
    | 'message_send'
    | 'file_write'
    | 'external_api';
  description: string;
  stepIndex: number;
}> {
  const sideEffects: Array<any> = [];

  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    const meta = (node.metadata as any) || {};

    if (node.role === 'side_effect') {
      sideEffects.push({
        type: 'external_api',
        description: node.label || node.kind,
        stepIndex: i,
      });
    }

    if (meta.externalCalls && Array.isArray(meta.externalCalls)) {
      for (const call of meta.externalCalls) {
        sideEffects.push({
          type: 'network_call',
          description: call,
          stepIndex: i,
        });
      }
    }

    if (meta.queueDispatch) {
      sideEffects.push({
        type: 'queue_dispatch',
        description: meta.queueDispatch,
        stepIndex: i,
      });
    }
  }

  return sideEffects;
}

function calculateChainCompleteness(steps: PulseExecutionChainStep[]): {
  expectedSteps: number;
  foundSteps: number;
  score: number;
} {
  const expected = [
    'trigger',
    'interface',
    'client_api',
    'controller',
    'orchestration',
    'service',
    'persistence',
  ];
  const found = steps.map((s) => s.role).filter((role) => expected.includes(role as string));

  const uniqueFound = new Set(found).size;
  const expectedCount = Math.min(expected.length, steps.length);

  return {
    expectedSteps: expectedCount,
    foundSteps: uniqueFound,
    score: expectedCount > 0 ? uniqueFound / expectedCount : 0,
  };
}

function identifyFailurePoints(steps: PulseExecutionChainStep[]): Array<{
  stepIndex: number;
  reason: string;
  recovery: string;
}> {
  const failures: Array<any> = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.truthMode === 'aspirational') {
      failures.push({
        stepIndex: i,
        reason: `Step not implemented: ${step.description}`,
        recovery: `Implement ${step.role} at ${step.nodeId}`,
      });
    }

    if (i > 0) {
      const prevStep = steps[i - 1];
      if (
        prevStep.role === 'controller' &&
        step.role === 'service' &&
        !prevStep.description.includes(step.description)
      ) {
        failures.push({
          stepIndex: i,
          reason: `Gap between controller and service`,
          recovery: `Verify service call wiring`,
        });
      }
    }
  }

  return failures;
}

function extractRequiredState(steps: PulseExecutionChainStep[]): string[] {
  const state: string[] = [];
  for (const step of steps) {
    if (step.role === 'trigger') {
      state.push('user_logged_in');
    }
    if (step.modelsInvolved.includes('User')) {
      state.push('user_context_available');
    }
    if (step.modelsInvolved.includes('Workspace')) {
      state.push('workspace_context_available');
    }
  }
  // Deduplicate using Map
  const dedupeMap = new Map<string, boolean>();
  for (const item of state) {
    dedupeMap.set(item, true);
  }
  return Array.from(dedupeMap.keys());
}

function buildChainDescription(steps: PulseExecutionChainStep[]): string {
  const roleSequence = steps.map((s) => s.role).join(' → ');
  return `Execution chain: ${roleSequence}`;
}

export function buildExecutionChains(input: BuildExecutionChainsInput): PulseExecutionChainSet {
  const { structuralGraph } = input;

  // Common chain patterns
  const uiToDatabase = findPathsBetweenRoles(
    structuralGraph,
    new Set(['ui_element', 'interface']),
    new Set(['persistence_model']),
  );

  const apiToService = findPathsBetweenRoles(
    structuralGraph,
    new Set(['api_call', 'proxy_route']),
    new Set(['service_trace']),
  );

  const controllerToEvent = findPathsBetweenRoles(
    structuralGraph,
    new Set(['backend_route']),
    new Set(['side_effect', 'queue']),
  );

  const allPaths = [...uiToDatabase, ...apiToService, ...controllerToEvent];

  // Deduplicate paths
  const dedupeMap = new Map<string, PulseStructuralNode[]>();
  for (const p of allPaths) {
    const key = p.map((n) => n.id).join(':');
    dedupeMap.set(key, p);
  }
  const uniquePaths = Array.from(dedupeMap.values());

  const chains = uniquePaths.map((path, i) => buildChainFromPath(path, i, structuralGraph));

  const completeChains = chains.filter((c) => c.completeness.score >= 0.8).length;
  const partialChains = chains.filter(
    (c) => c.completeness.score >= 0.5 && c.completeness.score < 0.8,
  ).length;
  const simulatedChains = chains.filter((c) => c.truthMode === 'aspirational').length;

  return {
    chains: chains.sort((a, b) => b.completeness.score - a.completeness.score),
    summary: {
      totalChains: chains.length,
      completeChains,
      partialChains,
      simulatedChains,
      overallCompleteness:
        chains.length > 0
          ? chains.reduce((sum, c) => sum + c.completeness.score, 0) / chains.length
          : 0,
    },
  };
}
