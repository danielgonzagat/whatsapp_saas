import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ExecutionFriction } from './types';

interface FrictionDetectInput {
  readonly workspaceId: string;
  readonly targetAction: string;
  readonly actionSize: 'tiny' | 'small' | 'medium' | 'large' | 'giant';
  readonly clarityScore: number;
  readonly hasPriorKnowledge: boolean;
  readonly hasExternalDependency: boolean;
  readonly paralellOptions: number;
  readonly recentAbandonmentCount: number;
}

@Injectable()
export class FrictionDetectorService {
  private readonly logger = new Logger(FrictionDetectorService.name);

  detect(input: FrictionDetectInput): ExecutionFriction {
    const signals = this.gatherSignals(input);
    const frictionType = this.classifyFrictionType(input, signals);
    const frictionScore = this.computeScore(input, frictionType);
    const recommendation = this.buildRecommendation(frictionType, frictionScore);

    this.logger.debug(
      `Friction detected: ${frictionType} (score=${frictionScore.toFixed(2)}) for action "${input.targetAction.slice(0, 40)}"`,
    );

    return {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      targetAction: input.targetAction,
      frictionType,
      frictionScore: Math.round(frictionScore * 1000) / 1000,
      detectedSignals: signals,
      recommendation,
      detectedAt: new Date().toISOString(),
    };
  }

  private gatherSignals(input: FrictionDetectInput): string[] {
    const signals: string[] = [];

    if (input.actionSize === 'large' || input.actionSize === 'giant') {
      signals.push('large_or_giant_action');
    }
    if (input.clarityScore < 0.4) {
      signals.push('low_clarity_score');
    }
    if (input.clarityScore >= 0.6 && input.recentAbandonmentCount > 0) {
      signals.push('high_clarity_but_no_action');
    }
    if (!input.hasPriorKnowledge) {
      signals.push('no_prior_knowledge');
    }
    if (input.hasExternalDependency) {
      signals.push('has_external_dependency');
    }
    if (input.paralellOptions > 3) {
      signals.push('many_parallel_options');
    }
    if (input.paralellOptions > 1 && input.actionSize !== 'tiny') {
      signals.push('action_not_atomic');
    }
    if (input.recentAbandonmentCount >= 3) {
      signals.push('high_abandonment_count');
    }
    if (input.recentAbandonmentCount > 0 && input.actionSize !== 'giant') {
      signals.push('recent_abandonment_history');
    }
    if (input.actionSize !== 'tiny' && input.recentAbandonmentCount === 0 && input.clarityScore < 0.3) {
      signals.push('unclear_outcome');
    }

    return signals;
  }

  private classifyFrictionType(input: FrictionDetectInput, signals: readonly string[]): ExecutionFriction['frictionType'] {
    const signalSet = new Set(signals);

    if (signalSet.has('has_external_dependency')) {
      if (signalSet.has('large_or_giant_action') || signalSet.has('low_clarity_score')) {
        return 'external_blocker';
      }
      if (input.clarityScore >= 0.5) {
        return 'external_blocker';
      }
    }

    if (signalSet.has('large_or_giant_action') && signalSet.has('low_clarity_score')) {
      return 'overwhelm';
    }

    if (signalSet.has('low_clarity_score') && signalSet.has('no_prior_knowledge')) {
      if (signalSet.has('large_or_giant_action')) {
        return 'unknown_first_step';
      }
      if (input.actionSize !== 'tiny') {
        return 'ambiguity';
      }
    }

    if (signalSet.has('high_clarity_but_no_action') && signalSet.has('recent_abandonment_history')) {
      return 'perfectionism';
    }

    if (signalSet.has('many_parallel_options') && signalSet.has('action_not_atomic')) {
      if (input.recentAbandonmentCount >= 1) {
        return 'scope_creep';
      }
    }

    if (signalSet.has('low_clarity_score') && input.actionSize !== 'tiny') {
      if (signalSet.has('high_abandonment_count')) {
        return 'overwhelm';
      }
      return 'ambiguity';
    }

    if (signalSet.has('large_or_giant_action') || signalSet.has('high_abandonment_count')) {
      return 'overwhelm';
    }

    if (signalSet.has('no_prior_knowledge')) {
      return 'unknown_first_step';
    }

    return 'ambiguity';
  }

  private computeScore(input: FrictionDetectInput, type: ExecutionFriction['frictionType']): number {
    let score = 0;

    switch (input.actionSize) {
      case 'tiny': score += 0.05; break;
      case 'small': score += 0.2; break;
      case 'medium': score += 0.4; break;
      case 'large': score += 0.7; break;
      case 'giant': score += 0.9; break;
    }

    score += (1 - input.clarityScore) * 0.5;

    if (!input.hasPriorKnowledge) score += 0.2;
    if (input.hasExternalDependency) score += 0.15;
    if (input.paralellOptions > 3) score += 0.2;
    if (input.recentAbandonmentCount >= 5) score += 0.3;
    else if (input.recentAbandonmentCount >= 3) score += 0.2;
    else if (input.recentAbandonmentCount >= 1) score += 0.1;

    if (type === 'external_blocker') score = Math.min(score * 1.1, 1);
    if (type === 'perfectionism') score = Math.min(score * 0.9, 1);

    return Math.round(Math.min(Math.max(score, 0), 1) * 1000) / 1000;
  }

  private buildRecommendation(type: ExecutionFriction['frictionType'], score: number): string {
    const urgency = score >= 0.7 ? 'stop_and_decompose_first' : 'reduce_and_proceed';

    switch (type) {
      case 'overwhelm':
        return urgency === 'stop_and_decompose_first'
          ? 'Decompose into actions of 15 minutes or less before proceeding'
          : 'Reduce scope to a single next step';
      case 'ambiguity':
        return 'Offer a partial execution version that preserves core value';
      case 'unknown_first_step':
        return 'Suggest a tiny, atomic first action with a clear completion signal';
      case 'perfectionism':
        return 'Acknowledge the high standard, then offer a small safe-to-fail version';
      case 'scope_creep':
        return 'Narrow to one atomic deliverable with explicit boundaries';
      case 'external_blocker':
        return 'Identify the smallest action possible without the blocked resource';
    }
  }
}
