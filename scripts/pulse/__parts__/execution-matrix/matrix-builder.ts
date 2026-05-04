import type {
  PulseExecutionMatrix,
  PulseExecutionMatrixBreakpoint,
  PulseExecutionMatrixPath,
  PulseExecutionMatrixPathSource,
  PulseExecutionMatrixPathStatus,
} from '../../types';
import type { BuildExecutionMatrixInput } from './grammar';
import {
  differsGrammar,
  matrixSourceGrammar,
  normalizeExecutionMode,
  sameGrammar,
  terminalStatusGrammar,
} from './grammar';
import { isElevatedRiskGrammar, riskOrderGrammar, zeroGrammar } from './evidence-checkers';
import { buildPathFromChain, buildSyntheticPath } from './path-builders';
import { buildPathFromScopeFile, buildPathFromStructuralNode } from './structural-path-builders';

export function summarize(paths: PulseExecutionMatrixPath[]): PulseExecutionMatrix['summary'] {
  const byStatus = Object.fromEntries(
    terminalStatusGrammar().map((status) => [
      status,
      paths.filter((path) => sameGrammar(path.status, status)).length,
    ]),
  ) as Record<PulseExecutionMatrixPathStatus, number>;
  const bySource = Object.fromEntries(
    matrixSourceGrammar().map((source) => [
      source,
      paths.filter((path) => sameGrammar(path.source, source)).length,
    ]),
  ) as Record<PulseExecutionMatrixPathSource, number>;
  const terminalPaths = paths.filter((path) =>
    terminalStatusGrammar().includes(path.status),
  ).length;
  const classifiablePaths = paths.filter((path) =>
    differsGrammar(path.status, 'not_executable'),
  ).length;
  const classifiedPaths = paths.filter((path) => differsGrammar(path.status, 'untested')).length;
  return {
    totalPaths: paths.length,
    bySource,
    byStatus,
    observedPass: byStatus.observed_pass,
    observedFail: byStatus.observed_fail,
    untested: byStatus.untested,
    blockedHumanRequired: byStatus.blocked_human_required,
    unreachable: byStatus.unreachable,
    inferredOnly: byStatus.inferred_only,
    notExecutable: byStatus.not_executable,
    terminalPaths,
    nonTerminalPaths: paths.length - terminalPaths,
    unknownPaths: paths.length - terminalPaths,
    criticalUnobservedPaths: paths.filter(
      (path) => isElevatedRiskGrammar(path.risk) && !terminalClassificationGrammar(path),
    ).length,
    impreciseBreakpoints: paths.filter(
      (path) => sameGrammar(path.status, 'observed_fail') && !hasPreciseBreakpoint(path.breakpoint),
    ).length,
    coveragePercent:
      classifiablePaths > 0
        ? Math.min(100, Math.round((classifiedPaths / classifiablePaths) * 100))
        : 100,
  };
}

function terminalClassificationGrammar(path: PulseExecutionMatrixPath): boolean {
  const observedTerminal = ['observed_pass', 'observed_fail'].includes(path.status);
  const breakpointTerminal = [
    'not_executable',
    'unreachable',
    'observation_only',
    'blocked_human_required',
    'inferred_only',
    'untested',
  ].includes(path.status);
  return observedTerminal || (breakpointTerminal && hasPreciseBreakpoint(path.breakpoint));
}

function hasPreciseBreakpoint(breakpoint: PulseExecutionMatrixBreakpoint | null): boolean {
  if (!breakpoint) {
    return false;
  }
  const hasLocation = Boolean(breakpoint.filePath || breakpoint.nodeId || breakpoint.routePattern);
  return hasLocation && breakpoint.reason.length > 0 && breakpoint.recovery.length > 0;
}

/** Build the canonical matrix that classifies every discovered executable path. */
export function buildExecutionMatrix(input: BuildExecutionMatrixInput): PulseExecutionMatrix {
  const paths: PulseExecutionMatrixPath[] = [];
  const coveredCapabilityIds = new Set<string>();
  const coveredFlowIds = new Set<string>();
  const coveredNodeIds = new Set<string>();
  const coveredFiles = new Set<string>();
  input.executionChains.chains.forEach((chain, index) => {
    const path = buildPathFromChain({
      chain,
      index,
      capabilities: input.capabilityState.capabilities,
      flows: input.flowProjection.flows,
      executionEvidence: input.executionEvidence,
      externalSignalState: input.externalSignalState,
    });
    paths.push(path);
    if (path.capabilityId) {
      coveredCapabilityIds.add(path.capabilityId);
    }
    if (path.flowId) {
      coveredFlowIds.add(path.flowId);
    }
    for (const step of path.chain) {
      coveredNodeIds.add(step.nodeId);
    }
    for (const filePath of path.filePaths) {
      coveredFiles.add(filePath);
    }
  });
  input.capabilityState.capabilities.forEach((capability, index) => {
    if (coveredCapabilityIds.has(capability.id)) {
      return;
    }
    paths.push(
      buildSyntheticPath({
        source: 'capability',
        index,
        capability,
        flow: null,
        executionEvidence: input.executionEvidence,
        externalSignalState: input.externalSignalState,
      }),
    );
    for (const nodeId of capability.nodeIds) {
      coveredNodeIds.add(nodeId);
    }
    for (const filePath of capability.filePaths) {
      coveredFiles.add(filePath);
    }
  });
  input.flowProjection.flows.forEach((flow, index) => {
    if (coveredFlowIds.has(flow.id)) {
      return;
    }
    const capability =
      input.capabilityState.capabilities.find((candidate) =>
        flow.capabilityIds.includes(candidate.id),
      ) ?? null;
    paths.push(
      buildSyntheticPath({
        source: 'flow',
        index,
        capability,
        flow,
        executionEvidence: input.executionEvidence,
        externalSignalState: input.externalSignalState,
      }),
    );
    for (const nodeId of [...flow.startNodeIds, ...flow.endNodeIds]) {
      coveredNodeIds.add(nodeId);
    }
  });
  input.structuralGraph.nodes.forEach((node, index) => {
    if (coveredNodeIds.has(node.id)) {
      return;
    }
    paths.push(
      buildPathFromStructuralNode({
        node,
        index,
        executionEvidence: input.executionEvidence,
        externalSignalState: input.externalSignalState,
      }),
    );
    if (node.file) {
      coveredFiles.add(node.file);
    }
  });
  input.scopeState.files.forEach((file, index) => {
    if (coveredFiles.has(file.path)) {
      return;
    }
    paths.push(buildPathFromScopeFile(file, index));
  });
  return {
    generatedAt: new Date().toISOString(),
    summary: summarize(paths),
    paths: paths.sort((left, right) => {
      const riskDelta = riskOrderGrammar(right.risk) - riskOrderGrammar(left.risk);
      if (differsGrammar(riskDelta, zeroGrammar())) return riskDelta;
      return left.pathId.localeCompare(right.pathId);
    }),
  };
}
