import { evaluateEconomicObjective } from './economic-objective';
import { mean, twoProportionZScore } from './mind-policy.helpers';
import type {
  MindActionCandidate,
  MindJson,
  MindPolicyCalcStep,
  MindPolicyDecision,
  MindPolicyOption,
} from './mind.types';

export interface MindPolicyHarnessResult {
  baselineMean: number;
  lift: number;
  mindMean: number;
  n: number;
  pZScore: number;
}

export interface MindPolicyInput {
  baseline?: string;
  baselineActionQuiet?: string;
  channel?: string;
  context: MindJson;
  decisionType: string;
  epsilon?: number;
  fallbackMinSamples?: number;
  options: MindPolicyOption[];
  outcomeKey?: string;
  subject: string;
  utilityFail?: number;
  utilitySuccess?: number;
  workspaceId: string;
}

export function resolveBaselineAction(input: {
  baseline?: string;
  baselineActionQuiet?: string;
  fallback?: string;
  options?: Array<{ action: string }>;
}): string {
  return (
    input.baselineActionQuiet ??
    input.baseline ??
    input.fallback ??
    input.options?.[input.options.length - 1]?.action ??
    'pass'
  );
}

export function shouldUseBaselineFallback(
  harnessResult: MindPolicyHarnessResult,
  minSamples: number,
): boolean {
  return harnessResult.lift < 0 && harnessResult.pZScore <= -1.96 && harnessResult.n >= minSamples;
}

export function buildFallbackDecision(input: {
  baselineAction: string;
  epsilon: number;
  harnessResult: MindPolicyHarnessResult;
  policy: MindPolicyInput;
  utilityFail: number;
  utilitySuccess: number;
}): MindPolicyDecision {
  const { baselineAction, epsilon, harnessResult, policy, utilityFail, utilitySuccess } = input;
  return {
    workspaceId: policy.workspaceId,
    subject: policy.subject,
    decisionType: policy.decisionType,
    context: policy.context,
    baseline: baselineAction,
    baselineAction,
    calcSteps: [],
    candidates: [],
    chosen: baselineAction,
    epsilon,
    fallbackActive: true,
    fallbackReason: [
      `lift=${harnessResult.lift.toFixed(3)}`,
      `z=${harnessResult.pZScore.toFixed(2)}`,
      `n=${harnessResult.n}`,
      `mindMean=${harnessResult.mindMean.toFixed(3)}`,
      `baselineMean=${harnessResult.baselineMean.toFixed(3)}`,
    ].join(' '),
    ...(policy.outcomeKey !== undefined ? { outcomeKey: policy.outcomeKey } : {}),
    reasonInternal: `FALLBACK: MIND underperforming baseline (lift=${harnessResult.lift.toFixed(3)} < 0)`,
    utilityFail,
    utilitySuccess,
    usedGlobalPrior: false,
    priorWeight: 0,
  };
}

export function buildPolicyArtifacts(input: {
  beliefs: Array<{ mean: number; variance: number }>;
  epsilon: number;
  options: MindPolicyOption[];
  policy: MindPolicyInput;
  utilityFail: number;
  utilitySuccess: number;
}): { candidates: MindActionCandidate[]; calcSteps: MindPolicyCalcStep[] } {
  const candidates: MindActionCandidate[] = [];
  const calcSteps: MindPolicyCalcStep[] = [];

  input.options.forEach((option, index) => {
    const belief = input.beliefs[index];
    if (!belief) {return;}
    const pessimisticSuccess = Math.max(0, belief.mean);
    const pragmatic =
      pessimisticSuccess * input.utilitySuccess + (1 - pessimisticSuccess) * input.utilityFail;
    const epistemic = input.epsilon * belief.variance;
    const baseEfe = -(pragmatic + epistemic);
    const economicObjective = evaluateEconomicObjective({
      action: option.action,
      beliefMean: belief.mean,
      context: option.context,
      decisionType: input.policy.decisionType,
    });
    const efe = baseEfe - economicObjective.score;

    candidates.push({
      action: option.action,
      baseEfe,
      beliefMean: belief.mean,
      beliefVariance: belief.variance,
      economicObjective,
      economicScore: economicObjective.score,
      pragmatic,
      epistemic,
      efe,
      uncertaintyAtChoice: belief.variance,
    });

    calcSteps.push({
      action: option.action,
      baseEfe,
      beliefMean: belief.mean,
      beliefVariance: belief.variance,
      economicScore: economicObjective.score,
      pragmatic,
      epistemic,
      efe,
      formula: [
        'EFE=-(P+E)-economicScore',
        `P=${belief.mean.toFixed(4)}*${input.utilitySuccess}+${(1 - belief.mean).toFixed(4)}*${input.utilityFail}=${pragmatic.toFixed(4)}`,
        `E=${input.epsilon}*${belief.variance.toFixed(4)}=${epistemic.toFixed(4)}`,
        `baseEFE=${baseEfe.toFixed(4)}`,
        `economicScore=${economicObjective.score.toFixed(4)}`,
        `EFE=${efe.toFixed(4)}`,
      ].join(' '),
    });
  });

  candidates.sort((left, right) => left.efe - right.efe);
  return { candidates, calcSteps };
}

export function buildPolicyDecision(input: {
  artifacts: { candidates: MindActionCandidate[]; calcSteps: MindPolicyCalcStep[] };
  baselineAction: string;
  epsilon: number;
  policy: MindPolicyInput;
  utilityFail: number;
  utilitySuccess: number;
}): MindPolicyDecision {
  const winner = input.artifacts.candidates[0];
  if (!winner) {
    return {
      workspaceId: input.policy.workspaceId,
      subject: input.policy.subject,
      decisionType: input.policy.decisionType,
      context: input.policy.context,
      baseline: input.baselineAction,
      baselineAction: input.baselineAction,
      calcSteps: input.artifacts.calcSteps,
      candidates: [],
      chosen: input.baselineAction,
      epsilon: input.epsilon,
      fallbackActive: true,
      fallbackReason: 'no_action_candidates',
      ...(input.policy.outcomeKey !== undefined ? { outcomeKey: input.policy.outcomeKey } : {}),
      reasonInternal: 'FALLBACK: no action candidates available for MIND policy decision',
      utilityFail: input.utilityFail,
      utilitySuccess: input.utilitySuccess,
      usedGlobalPrior: false,
      priorWeight: 0,
    };
  }
  return {
    workspaceId: input.policy.workspaceId,
    subject: input.policy.subject,
    decisionType: input.policy.decisionType,
    context: input.policy.context,
    baseline: input.baselineAction,
    baselineAction: input.baselineAction,
    calcSteps: input.artifacts.calcSteps,
    candidates: input.artifacts.candidates,
    chosen: winner.action,
    epsilon: input.epsilon,
    fallbackActive: false,
    fallbackReason: null,
    ...(input.policy.outcomeKey !== undefined ? { outcomeKey: input.policy.outcomeKey } : {}),
    reasonInternal: `efe=${winner.efe.toFixed(3)} economic=${(winner.economicScore ?? 0).toFixed(3)} pragmatic=${winner.pragmatic.toFixed(3)} epistemic=${winner.epistemic.toFixed(3)} variance=${winner.uncertaintyAtChoice.toFixed(3)}`,
    utilityFail: input.utilityFail,
    utilitySuccess: input.utilitySuccess,
    usedGlobalPrior: false,
    priorWeight: 0,
  };
}

export function summarizePolicyHarness(
  rows: Array<{ baselineOutcome: number | null; outcome: number | null }>,
): MindPolicyHarnessResult {
  const outcomes = rows
    .map((row) => row.outcome)
    .filter((value): value is number => typeof value === 'number');
  const baselineOutcomes = rows
    .map((row) => row.baselineOutcome)
    .filter((value): value is number => typeof value === 'number');
  const mindMean = mean(outcomes);
  const baselineMean = mean(baselineOutcomes);
  const lift = baselineMean > 0 ? (mindMean - baselineMean) / baselineMean : 0;
  const pZScore =
    baselineOutcomes.length > 30
      ? twoProportionZScore(mindMean, baselineMean, outcomes.length, baselineOutcomes.length)
      : 0;

  return { n: rows.length, mindMean, baselineMean, lift, pZScore };
}
