import type {
  PulseCapability,
  PulseExecutionChain,
  PulseExecutionMatrixBreakpoint,
  PulseExecutionMatrixPathStatus,
  PulseFlowProjectionItem,
} from '../../types';
import type { MatrixEvidence } from './grammar';
import { failedEvidenceRecoveryGrammar } from './evidence-checkers';
import { findChainStepByIndex } from './traversal';

export function buildBreakpoint(args: {
  chain: PulseExecutionChain | null;
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  status: PulseExecutionMatrixPathStatus;
  observedEvidence: MatrixEvidence[];
}): PulseExecutionMatrixBreakpoint | null {
  const failedEvidence = args.observedEvidence.find((entry) => entry.status === 'failed');
  if (failedEvidence) {
    const firstChainFailure = args.chain?.failurePoints[0] ?? null;
    const failedStep =
      args.chain && firstChainFailure
        ? findChainStepByIndex(args.chain, firstChainFailure.stepIndex)
        : null;
    return {
      stage: failedStep?.role ?? 'unknown',
      stepIndex: firstChainFailure?.stepIndex ?? 0,
      filePath: failedStep?.filesInvolved[0] ?? args.capability?.filePaths[0] ?? null,
      nodeId: failedStep?.nodeId ?? args.capability?.nodeIds[0] ?? null,
      routePattern: args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason: failedEvidence.summary,
      recovery: failedEvidenceRecoveryGrammar(firstChainFailure),
    };
  }
  const failurePoint = args.chain?.failurePoints[0] ?? null;
  if (failurePoint) {
    const failedStep = args.chain ? findChainStepByIndex(args.chain, failurePoint.stepIndex) : null;
    return {
      stage: failedStep?.role ?? 'unknown',
      stepIndex: failurePoint.stepIndex,
      filePath: failedStep?.filesInvolved[0] ?? null,
      nodeId: failedStep?.nodeId ?? null,
      routePattern: args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason: failurePoint.reason,
      recovery: failurePoint.recovery,
    };
  }
  if (args.status === 'unreachable') {
    return {
      stage: 'entrypoint',
      stepIndex: 0,
      filePath: args.capability?.filePaths[0] ?? null,
      nodeId: args.capability?.nodeIds[0] ?? null,
      routePattern: args.capability?.routePatterns[0] ?? args.flow?.routePatterns[0] ?? null,
      reason: 'No reachable interface/API entrypoint was found for this path.',
      recovery: 'Connect the path to an interface/API entrypoint or mark it not_executable.',
    };
  }
  if (args.status === 'not_executable') {
    return {
      stage: 'entrypoint',
      stepIndex: 0,
      filePath: args.capability?.filePaths[0] ?? null,
      nodeId: args.capability?.nodeIds[0] ?? null,
      routePattern: args.capability?.routePatterns[0] ?? args.flow?.routePatterns[0] ?? null,
      reason:
        'Path has no executable chain or route-backed entrypoint in the reconstructed matrix.',
      recovery:
        'Connect this capability/flow to an execution chain, route, scenario, or runtime probe before requiring observed pass/fail evidence.',
    };
  }
  if (args.status === 'observation_only' || args.status === 'blocked_human_required') {
    return {
      stage: args.chain?.entrypoint.role ?? 'entrypoint',
      stepIndex: 0,
      filePath: args.chain?.entrypoint.filesInvolved[0] ?? args.capability?.filePaths[0] ?? null,
      nodeId: args.chain?.entrypoint.nodeId ?? args.capability?.nodeIds[0] ?? null,
      routePattern: args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason:
        'Path maps to governed or protected execution and requires observation-only proof routing before pass/fail evidence can be claimed.',
      recovery:
        'Collect governed validation evidence without autonomous mutation, then attach the resulting observed artifact to this path.',
    };
  }
  if (args.status === 'inferred_only' || args.status === 'untested') {
    const machineProofDebt = args.observedEvidence.find(
      (entry) =>
        entry.source === 'actor' &&
        entry.status === 'missing' &&
        entry.summary.includes('PULSE machine work'),
    );
    const missingRuntimeEvidence = args.observedEvidence.every(
      (entry) => !entry.executed || entry.status === 'mapped' || entry.status === 'missing',
    );
    return {
      stage: args.chain?.entrypoint.role ?? 'entrypoint',
      stepIndex: 0,
      filePath: args.chain?.entrypoint.filesInvolved[0] ?? args.capability?.filePaths[0] ?? null,
      nodeId: args.chain?.entrypoint.nodeId ?? args.capability?.nodeIds[0] ?? null,
      routePattern: args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason: machineProofDebt
        ? machineProofDebt.summary
        : missingRuntimeEvidence
          ? 'Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.'
          : 'Path has partial evidence but still lacks the required observed terminal probe.',
      recovery: machineProofDebt
        ? 'Execute or classify the matching customer/soak scenario blueprint and attach terminal runtime evidence before promoting this path to observed.'
        : 'Run or attach a matching runtime, flow, actor, browser, or external probe before promoting this path to observed evidence.',
    };
  }
  return null;
}
