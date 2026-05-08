import { Injectable } from '@nestjs/common';

export interface ReplayCandidate {
  action: string;
  beliefMean: number;
  beliefVariance: number;
}

export interface ReplayInput {
  workspaceId: string;
  decisionType: string;
  candidates: ReplayCandidate[];
  baseline?: string;
  epsilon?: number;
  utilitySuccess?: number;
  utilityFail?: number;
}

export interface ReplayStep {
  action: string;
  beliefMean: number;
  beliefVariance: number;
  pragmatic: number;
  epistemic: number;
  efe: number;
  formula: string;
}

export interface ReplayResult {
  chosen: string;
  steps: ReplayStep[];
  baselineAction: string;
}

export interface ReplayScenarioInput {
  workspaceId: string;
  decisions: ReplayInput[];
}

export interface ReplayScenarioOutcome {
  decisionType: string;
  chosen: string;
  baseline: string;
}

export interface ReplayReport {
  workspaceId: string;
  totalDecisions: number;
  baselineMatches: number;
  baselineMatchRate: number;
  outcomes: ReplayScenarioOutcome[];
}

function computeEFE(
  beliefMean: number,
  beliefVariance: number,
  epsilon: number,
  utilitySuccess: number,
  utilityFail: number,
): { pragmatic: number; epistemic: number; efe: number; formula: string } {
  const pessimisticSuccess = Math.max(0, beliefMean);
  const pragmatic = pessimisticSuccess * utilitySuccess + (1 - pessimisticSuccess) * utilityFail;
  const epistemic = epsilon * beliefVariance;
  const efe = -(pragmatic + epistemic);
  const formula = [
    'EFE=-(P+E)',
    `P=${beliefMean.toFixed(4)}*${utilitySuccess}+${(1 - beliefMean).toFixed(4)}*${utilityFail}=${pragmatic.toFixed(4)}`,
    `E=${epsilon}*${beliefVariance.toFixed(4)}=${epistemic.toFixed(4)}`,
    `EFE=${efe.toFixed(4)}`,
  ].join(' ');

  return { pragmatic, epistemic, efe, formula };
}

@Injectable()
export class MindReplayService {
  replayDecision(input: ReplayInput): ReplayResult {
    const epsilon = input.epsilon ?? 0.5;
    const utilitySuccess = input.utilitySuccess ?? 1;
    const utilityFail = input.utilityFail ?? -0.2;

    const steps: ReplayStep[] = input.candidates.map((candidate) => {
      const stats = computeEFE(
        candidate.beliefMean,
        candidate.beliefVariance,
        epsilon,
        utilitySuccess,
        utilityFail,
      );
      return {
        action: candidate.action,
        beliefMean: candidate.beliefMean,
        beliefVariance: candidate.beliefVariance,
        pragmatic: stats.pragmatic,
        epistemic: stats.epistemic,
        efe: stats.efe,
        formula: stats.formula,
      };
    });

    if (steps.length === 0) {
      return {
        chosen: 'pass',
        steps,
        baselineAction: input.baseline ?? 'pass',
      };
    }

    steps.sort((left, right) => left.efe - right.efe);
    const winner = steps[0];
    const baselineAction = input.baseline ?? steps[steps.length - 1]?.action ?? 'pass';

    return {
      chosen: winner.action,
      steps,
      baselineAction,
    };
  }

  replayScenario(scenario: ReplayScenarioInput): ReplayReport {
    const outcomes: ReplayScenarioOutcome[] = scenario.decisions.map((decision) => {
      const result = this.replayDecision(decision);
      return {
        decisionType: decision.decisionType,
        chosen: result.chosen,
        baseline: result.baselineAction,
      };
    });

    const baselineMatches = outcomes.filter(
      (outcome) => outcome.chosen === outcome.baseline,
    ).length;

    return {
      workspaceId: scenario.workspaceId,
      totalDecisions: outcomes.length,
      baselineMatches,
      baselineMatchRate: outcomes.length > 0 ? baselineMatches / outcomes.length : 0,
      outcomes,
    };
  }

  compareLift(input: {
    mindMean: number;
    baselineMean: number;
    mindSamples: number;
    baselineSamples: number;
  }): number {
    const { mindMean, baselineMean } = input;

    if (baselineMean === 0) {
      return 0;
    }

    return (mindMean - baselineMean) / baselineMean;
  }
}
