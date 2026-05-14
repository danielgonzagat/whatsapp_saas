import { Injectable } from '@nestjs/common';
import type { FeedbackKind, UserFeedbackCorrection } from './types';
import { makeIncidentId } from './types';

/**
 * INCENT-007 — UserFeedbackCorrection.
 *
 * Processa correções do usuário sobre recomendações.
 * Quando o usuário diz "não era isso", o organismo aprende.
 * Cada correção gera um sinal de aprendizado que alimenta
 * o modelo de recomendação.
 *
 * Feedback kinds: corrected, declined, modified, alternative_chosen, inaccurate.
 */
@Injectable()
export class UserFeedbackCorrectionService {
  private seq = 0;

  public record(input: FeedbackInput): UserFeedbackCorrection {
    this.seq += 1;
    const learnedSignal = this.extractSignal(input);

    const appliedToModel = this.shouldApplyToModel(input);

    return {
      id: makeIncidentId('fb', this.seq),
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      feedbackKind: input.kind,
      originalRecommendation: input.originalRecommendation,
      userCorrection: input.userNote ?? '',
      learnedSignal,
      appliedToModel,
      correctedAt: new Date().toISOString(),
    };
  }

  public recordBatch(
    inputs: readonly FeedbackInput[],
  ): readonly UserFeedbackCorrection[] {
    return inputs.map((inp) => this.record(inp));
  }

  public correctionsByKind(
    corrections: readonly UserFeedbackCorrection[],
    kind: FeedbackKind,
  ): readonly UserFeedbackCorrection[] {
    return corrections.filter((c) => c.feedbackKind === kind);
  }

  public correctionRate(
    corrections: readonly UserFeedbackCorrection[],
    totalRecommendations: number,
  ): number {
    if (totalRecommendations === 0) return 0;
    return corrections.length / totalRecommendations;
  }

  public mostCorrected(
    corrections: readonly UserFeedbackCorrection[],
    topN: number = 5,
  ): readonly string[] {
    const freq = new Map<string, number>();
    for (const c of corrections) {
      freq.set(
        c.recommendationId,
        (freq.get(c.recommendationId) ?? 0) + 1,
      );
    }
    return [...freq.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([id]) => id);
  }

  public accuracyRate(
    corrections: readonly UserFeedbackCorrection[],
  ): number {
    if (corrections.length === 0) return 1;
    const inaccurate = corrections.filter(
      (c) => c.feedbackKind === 'inaccurate',
    ).length;
    return Number(
      ((corrections.length - inaccurate) / corrections.length).toFixed(4),
    );
  }

  private extractSignal(input: FeedbackInput): string {
    const signals: Record<FeedbackKind, string> = {
      corrected: `User corrected recommendation: ${input.userNote ?? 'no note'}`,
      declined: `User declined recommendation entirely`,
      modified: `User modified recommendation: ${input.userNote ?? 'no note'}`,
      alternative_chosen: `User chose alternative over recommendation: ${input.userNote ?? 'no note'}`,
      inaccurate: `User flagged recommendation as inaccurate: ${input.userNote ?? 'no note'}`,
    };
    return signals[input.kind] ?? `Feedback: ${input.kind}`;
  }

  private shouldApplyToModel(input: FeedbackInput): boolean {
    if (input.kind === 'corrected' || input.kind === 'modified') return true;
    if (input.kind === 'inaccurate' && input.userNote) return true;
    return false;
  }
}

export interface FeedbackInput {
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly kind: FeedbackKind;
  readonly originalRecommendation: string;
  readonly userNote?: string;
}
