import type {
  PulseCapability,
  PulseExecutionChain,
  PulseExecutionMatrixBreakpoint,
  PulseExecutionMatrixEvidenceRequirement,
  PulseExecutionMatrixObservedEvidence,
  PulseExecutionMatrixPathStatus,
  PulseFlowProjectionItem,
  PulseTruthMode,
} from '../../types';
import {
  differsGrammar,
  failedEvidenceRecoveryGrammar,
  hasItemsGrammar,
  isFailureGrammar,
  sameGrammar,
} from './grammar';

type MatrixEvidence = PulseExecutionMatrixObservedEvidence;

function findChainStepByIndex(
  chain: PulseExecutionChain,
  stepIndex: number,
): PulseExecutionChain['steps'][number] | null {
  const primarySteps = [chain.entrypoint, ...chain.steps];
  return primarySteps[stepIndex] ?? collectChainStepsInternal(chain)[stepIndex] ?? null;
}

function collectChainStepsInternal(chain: PulseExecutionChain): PulseExecutionChain['steps'] {
  return [
    chain.entrypoint,
    ...chain.steps,
    ...chain.conditionalBranches.flatMap((branch) => branch.steps),
  ];
}

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

export function classifyTraversalGrammar(args: {
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  chain: PulseExecutionChain | null;
  observedEvidence: MatrixEvidence[];
  requiredEvidence: PulseExecutionMatrixEvidenceRequirement[];
  hasExecutableEntrypoint: boolean;
}): PulseExecutionMatrixPathStatus {
  if (args.chain && hasItemsGrammar(args.chain.failurePoints)) {
    return args.observedEvidence.some((entry) => isFailureGrammar(entry.status))
      ? 'observed_fail'
      : 'inferred_only';
  }
  if (args.observedEvidence.some((entry) => isFailureGrammar(entry.status))) {
    return 'observed_fail';
  }
  const executedPass = args.observedEvidence.some(
    (entry) => entry.executed && entry.status === 'passed',
  );
  const requiredRuntimeLike = args.requiredEvidence.some(
    (entry) => entry.required && differsGrammar(entry.kind, 'static'),
  );
  if (executedPass && !args.observedEvidence.some((entry) => entry.status === 'failed')) {
    return 'observed_pass';
  }
  if (
    sameGrammar(args.capability?.executionMode, 'human_required') ||
    sameGrammar(args.capability?.executionMode, 'observation_only') ||
    args.capability?.protectedByGovernance
  ) {
    return 'observation_only';
  }
  if (!args.chain && !args.hasExecutableEntrypoint) {
    return 'not_executable';
  }
  if (
    !requiredRuntimeLike &&
    sameGrammar(args.capability?.status, 'real') &&
    sameGrammar(args.capability.truthMode, 'observed')
  ) {
    return 'observed_pass';
  }
  if (
    sameGrammar(args.chain?.truthMode, 'inferred') ||
    sameGrammar(args.capability?.truthMode, 'inferred') ||
    sameGrammar(args.flow?.truthMode, 'inferred')
  ) {
    return 'inferred_only';
  }
  return 'untested';
}

export function buildValidationCommand(
  routePatterns: string[],
  pathId: string,
  filePath?: string | null,
): string {
  const route = routePatterns[0];
  if (route) {
    return `node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path ${pathId} route ${route}`;
  }
  if (filePath) {
    return `node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path ${pathId} file ${filePath}`;
  }
  return `node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path ${pathId}`;
}

export function deriveTruthMode(
  status: PulseExecutionMatrixPathStatus,
  evidence: MatrixEvidence[],
): PulseTruthMode {
  if (status === 'observed_pass' || status === 'observed_fail') {
    return 'observed';
  }
  if (evidence.some((entry) => entry.source === 'static' || entry.status === 'mapped')) {
    return 'inferred';
  }
  return 'aspirational';
}

export function chainKey(chain: PulseExecutionChain): string {
  return collectChainSteps(chain)
    .map((step) => step.nodeId)
    .join('|');
}

export function collectChainSteps(chain: PulseExecutionChain): PulseExecutionChain['steps'] {
  return collectChainStepsInternal(chain);
}
