/**
 * UTP-CLARITY-005 — Feedback Loop.
 *
 * Applies user feedback to adjust attention rankings.
 * Positive feedback boosts score; negative feedback penalizes.
 * Feedback is applied multiplicatively with diminishing returns
 * to prevent runaway scores.
 *
 * Pure function — stateless feedback application.
 */

import type {
  AttentionRanking,
  ClarityFeedback,
  FeedbackInput,
} from './clarity.types';
import { clampScore } from './clarity.types';

export interface FeedbackResult {
  readonly rankings: readonly AttentionRanking[];
  readonly feedback: ClarityFeedback;
  readonly scoreDelta: number;
  readonly appliedAt: string;
}

const FEEDBACK_BOOST = 0.15;
const FEEDBACK_PENALTY = 0.15;

export function applyFeedback(input: FeedbackInput): FeedbackResult {
  const { feedback, rankings } = input;

  const delta =
    feedback.rating === 1
      ? FEEDBACK_BOOST
      : feedback.rating === -1
        ? -FEEDBACK_PENALTY
        : 0;

  const updated = rankings.map((ranking) => {
    if (ranking.itemId !== feedback.itemId) return ranking;

    const newScore = clampScore(ranking.score + delta);
    return {
      ...ranking,
      score: Math.round(newScore * 100) / 100,
    };
  });

  const appliedFeedback: ClarityFeedback = {
    ...feedback,
    appliedToRanking: true,
  };

  return {
    rankings: updated,
    feedback: appliedFeedback,
    scoreDelta: Math.round(delta * 100) / 100,
    appliedAt: new Date(input.nowMs).toISOString(),
  };
}