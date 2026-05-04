import type {
  PulseCapability,
  PulseExecutionChain,
  PulseExecutionMatrixEvidenceRequirement,
  PulseExecutionMatrixPathStatus,
  PulseFlowProjectionItem,
  PulseTruthMode,
} from '../../types';
import type { MatrixEvidence } from './grammar';
import { hasItemsGrammar, sameGrammar } from './grammar';
import { isFailureGrammar } from './evidence-checkers';

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
    (entry) => entry.required && ['integration', 'e2e', 'runtime'].includes(entry.kind),
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
  return [
    chain.entrypoint,
    ...chain.steps,
    ...chain.conditionalBranches.flatMap((branch) => branch.steps),
  ];
}

export function findChainStepByIndex(
  chain: PulseExecutionChain,
  stepIndex: number,
): PulseExecutionChain['steps'][number] | null {
  const primarySteps = [chain.entrypoint, ...chain.steps];
  return primarySteps[stepIndex] ?? collectChainSteps(chain)[stepIndex] ?? null;
}
