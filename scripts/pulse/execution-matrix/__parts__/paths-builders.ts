import type {
  PulseCapability,
  PulseExecutionChain,
  PulseExecutionEvidence,
  PulseExecutionMatrixPath,
  PulseExecutionMatrixPathStatus,
  PulseExternalSignalState,
  PulseFlowProjectionItem,
  PulseStructuralNode,
} from '../../types';
import { deriveUnitValue, deriveZeroValue } from '../../dynamic-reality-kernel';
import {
  artifactGrammar,
  buildRequiredEvidence,
  collectObservedEvidence,
  fallbackConfidenceGrammar,
  flowCriticalityGrammar,
  hasItemsGrammar,
  isCriticalCapability,
  matchRouteGrammar,
  nodeConfidenceGrammar,
  normalizeExecutionMode,
  sameGrammar,
  structuralNodeRecoveryGrammar,
  unitConfidenceGrammar,
  unique,
} from './grammar';
import {
  buildBreakpoint,
  buildValidationCommand,
  chainKey,
  classifyTraversalGrammar,
  collectChainSteps,
  deriveTruthMode,
} from './paths-core';

type StructuralGraphKind = PulseStructuralNode['kind'];
type MatrixChainRole = PulseExecutionMatrixPath['chain'][number]['role'];

export function buildPathFromChain(args: {
  chain: PulseExecutionChain;
  index: number;
  capabilities: PulseCapability[];
  flows: PulseFlowProjectionItem[];
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}): PulseExecutionMatrixPath {
  const chainSteps = collectChainSteps(args.chain);
  const chainNodeIds = chainSteps.map((step) => step.nodeId);
  const chainFiles = unique(chainSteps.flatMap((step) => step.filesInvolved));
  const capability =
    args.capabilities.find((candidate) =>
      candidate.nodeIds.some((nodeId) => chainNodeIds.includes(nodeId)),
    ) ?? null;
  const flow =
    args.flows.find(
      (candidate) =>
        candidate.capabilityIds.some((capabilityId) => capabilityId === capability?.id) ||
        candidate.startNodeIds.some((nodeId) => chainNodeIds.includes(nodeId)) ||
        candidate.endNodeIds.some((nodeId) => chainNodeIds.includes(nodeId)),
    ) ?? null;
  const routePatterns = unique([
    ...(capability?.routePatterns ?? []),
    ...(flow?.routePatterns ?? []),
  ]);
  const requiredEvidence = buildRequiredEvidence({ capability, flow, routePatterns });
  const observedEvidence = collectObservedEvidence({
    capability,
    flow,
    routePatterns,
    executionEvidence: args.executionEvidence,
    externalSignalState: args.externalSignalState,
  });
  const risk: PulseExecutionMatrixPath['risk'] = capability?.runtimeCritical ? 'high' : 'medium';
  const status = classifyTraversalGrammar({
    capability,
    flow,
    chain: args.chain,
    observedEvidence,
    requiredEvidence,
    hasExecutableEntrypoint: true,
  });
  const breakpoint = buildBreakpoint({
    chain: args.chain,
    capability,
    flow,
    status,
    observedEvidence,
  });
  const pathId = `matrix:path:${args.index}:${chainKey(args.chain)}`;
  return {
    pathId,
    capabilityId: capability?.id ?? null,
    flowId: flow?.id ?? null,
    source: 'execution_chain',
    entrypoint: {
      nodeId: args.chain.entrypoint.nodeId,
      filePath: args.chain.entrypoint.filesInvolved[0] ?? null,
      routePattern: routePatterns[0] ?? null,
      description: args.chain.entrypoint.description,
    },
    chain: chainSteps.map((step) => ({
      role: step.role,
      nodeId: step.nodeId,
      filePath: step.filesInvolved[0] ?? null,
      description: step.description,
      truthMode: step.truthMode,
    })),
    status,
    truthMode: deriveTruthMode(status, observedEvidence),
    productStatus: flow?.status ?? capability?.status ?? null,
    breakpoint,
    requiredEvidence,
    observedEvidence,
    validationCommand: buildValidationCommand(routePatterns, pathId, chainFiles[0] ?? null),
    risk,
    executionMode: normalizeExecutionMode(capability?.executionMode, risk),
    confidence: unitConfidenceGrammar(args.chain.confidence.score),
    filePaths: unique([...(capability?.filePaths ?? []), ...chainFiles]),
    routePatterns,
  };
}

export function buildSyntheticPath(args: {
  source: 'capability' | 'flow';
  index: number;
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}): PulseExecutionMatrixPath {
  const routePatterns = unique([
    ...(args.capability?.routePatterns ?? []),
    ...(args.flow?.routePatterns ?? []),
  ]);
  const requiredEvidence = buildRequiredEvidence({
    capability: args.capability,
    flow: args.flow,
    routePatterns,
  });
  const observedEvidence = collectObservedEvidence({
    capability: args.capability,
    flow: args.flow,
    routePatterns,
    executionEvidence: args.executionEvidence,
    externalSignalState: args.externalSignalState,
  });
  const risk: PulseExecutionMatrixPath['risk'] =
    isCriticalCapability(args.capability) || flowCriticalityGrammar(args.flow) ? 'high' : 'medium';
  const status = classifyTraversalGrammar({
    capability: args.capability,
    flow: args.flow,
    chain: null,
    observedEvidence,
    requiredEvidence,
    hasExecutableEntrypoint: Boolean(
      routePatterns.length > 0 || args.capability?.nodeIds.length || args.flow?.startNodeIds.length,
    ),
  });
  const breakpoint = buildBreakpoint({
    chain: null,
    capability: args.capability,
    flow: args.flow,
    status,
    observedEvidence,
  });
  const idSource = args.capability?.id ?? args.flow?.id ?? String(args.index);
  const pathId = `matrix:${args.source}:${idSource}`;
  return {
    pathId,
    capabilityId: args.capability?.id ?? null,
    flowId: args.flow?.id ?? null,
    source: args.source,
    entrypoint: {
      nodeId: args.capability?.nodeIds[0] ?? args.flow?.startNodeIds[0] ?? null,
      filePath: args.capability?.filePaths[0] ?? null,
      routePattern: routePatterns[0] ?? null,
      description: args.capability?.name ?? args.flow?.name ?? idSource,
    },
    chain: [],
    status,
    truthMode: deriveTruthMode(status, observedEvidence),
    productStatus: args.flow?.status ?? args.capability?.status ?? null,
    breakpoint,
    requiredEvidence,
    observedEvidence,
    validationCommand: buildValidationCommand(
      routePatterns,
      pathId,
      args.capability?.filePaths[0] ?? null,
    ),
    risk,
    executionMode: normalizeExecutionMode(args.capability?.executionMode, risk),
    confidence: fallbackConfidenceGrammar(args.capability, args.flow),
    filePaths: unique(args.capability?.filePaths ?? []),
    routePatterns,
  };
}

function isRouteTextGrammar(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/');
}

export function structuralRoleGrammar(
  node: PulseStructuralNode,
): PulseExecutionMatrixPath['chain'][number]['role'] {
  const roleByKind: Partial<Record<StructuralGraphKind, MatrixChainRole>> = {
    ui_element: 'trigger',
    api_call: 'client_api',
    backend_route: 'controller',
    proxy_route: 'controller',
    service_trace: 'service',
    persistence_model: 'persistence',
    side_effect_signal: 'side_effect',
  };
  const fallbackRole = sameGrammar(node.role, 'interface') ? 'interface' : 'orchestration';
  return roleByKind[node.kind] ?? fallbackRole;
}

function routePatternsFromNode(node: PulseStructuralNode): string[] {
  const values = [
    node.metadata.route,
    node.metadata.routePattern,
    node.metadata.endpoint,
    node.metadata.path,
  ];
  return unique(
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => isRouteTextGrammar(value)),
  );
}

export function buildPathFromStructuralNode(args: {
  node: PulseStructuralNode;
  index: number;
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}): PulseExecutionMatrixPath {
  const routePatterns = routePatternsFromNode(args.node);
  const observedEvidence = collectObservedEvidence({
    capability: null,
    flow: null,
    routePatterns,
    executionEvidence: args.executionEvidence,
    externalSignalState: args.externalSignalState,
  });
  const risk: PulseExecutionMatrixPath['risk'] =
    args.node.runtimeCritical || args.node.userFacing ? 'high' : 'medium';
  const status: PulseExecutionMatrixPathStatus = observedEvidence.some(
    (entry) => entry.status === 'failed',
  )
    ? 'observed_fail'
    : observedEvidence.some((entry) => entry.executed && entry.status === 'passed')
      ? 'observed_pass'
      : args.node.protectedByGovernance
        ? 'observation_only'
        : routePatterns.length > 0 || args.node.role === 'interface'
          ? 'inferred_only'
          : 'not_executable';
  const pathId = `matrix:node:${args.index}:${args.node.id}`;
  const breakpoint =
    status === 'observed_fail'
      ? {
          stage: structuralRoleGrammar(args.node),
          stepIndex: 0,
          filePath: args.node.file || null,
          nodeId: args.node.id,
          routePattern: routePatterns[0] ?? null,
          reason:
            observedEvidence.find((entry) => entry.status === 'failed')?.summary ??
            'Structural node has observed failing evidence.',
          recovery: 'Inspect the node evidence and regenerate PULSE_EXECUTION_MATRIX.json.',
        }
      : status === 'inferred_only' || status === 'not_executable' || status === 'observation_only'
        ? {
            stage: structuralRoleGrammar(args.node),
            stepIndex: 0,
            filePath: args.node.file || null,
            nodeId: args.node.id,
            routePattern: routePatterns[0] ?? null,
            reason:
              status === 'observation_only'
                ? 'Structural node maps to protected governance or observation-only execution; autonomous pass/fail probing is not permitted.'
                : routePatterns.length > 0
                  ? 'Structural node has a route-like entrypoint but no matching observed runtime, browser, flow, actor, or external evidence.'
                  : 'Structural node has no route-like entrypoint, so it cannot be promoted by an HTTP probe without additional parser mapping.',
            recovery: structuralNodeRecoveryGrammar(status, routePatterns),
          }
        : null;
  return {
    pathId,
    capabilityId: null,
    flowId: null,
    source: 'structural_node',
    entrypoint: {
      nodeId: args.node.id,
      filePath: args.node.file || null,
      routePattern: routePatterns[0] ?? null,
      description: args.node.label || args.node.kind,
    },
    chain: [
      {
        role: structuralRoleGrammar(args.node),
        nodeId: args.node.id,
        filePath: args.node.file || null,
        description: args.node.label || args.node.kind,
        truthMode: args.node.truthMode,
      },
    ],
    status,
    truthMode: deriveTruthMode(status, observedEvidence),
    productStatus: null,
    breakpoint,
    requiredEvidence: [
      {
        kind: 'static',
        required: Boolean(deriveUnitValue()),
        reason: 'Every structural graph node must be represented in the execution matrix.',
      },
      {
        kind: routePatterns.length > 0 ? 'integration' : 'static',
        required: routePatterns.length > 0,
        reason:
          routePatterns.length > 0
            ? 'Route-like structural nodes need an executable probe.'
            : 'Non-route structural nodes are classified as static traversal targets.',
      },
    ],
    observedEvidence:
      observedEvidence.length > 0
        ? observedEvidence
        : [
            {
              source: 'static',
              artifactPath: artifactGrammar('static'),
              executed: true,
              status: 'mapped',
              summary: 'Structural node is represented in the execution matrix.',
            },
          ],
    validationCommand: buildValidationCommand(routePatterns, pathId, args.node.file || null),
    risk,
    executionMode: normalizeExecutionMode(
      args.node.protectedByGovernance ? 'observation_only' : 'ai_safe',
      risk,
    ),
    confidence: nodeConfidenceGrammar(args.node.truthMode),
    filePaths: unique([args.node.file]),
    routePatterns,
  };
}
