import type {
  PulseCapability,
  PulseExecutionChain,
  PulseExecutionEvidence,
  PulseExecutionMatrixPath,
  PulseExternalSignalState,
  PulseFlowProjectionItem,
} from '../../types';
import {
  fallbackConfidenceGrammar,
  flowCriticalityGrammar,
  isCriticalCapability,
  unique,
  unitConfidenceGrammar,
} from './evidence-checkers';
import { buildRequiredEvidence, collectObservedEvidence } from './evidence-collector';
import {
  buildValidationCommand,
  chainKey,
  classifyTraversalGrammar,
  collectChainSteps,
  deriveTruthMode,
} from './traversal';
import { buildBreakpoint } from './breakpoint-builder';
import { normalizeExecutionMode } from './grammar';

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
        candidate.capabilityIds.some((capId) => capId === capability?.id) ||
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
