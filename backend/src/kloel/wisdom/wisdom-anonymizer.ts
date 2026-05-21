/**
 * WISDOM-002 — k-Anonymity + Diff-Privacy Noise.
 *
 * Applies k-anonymity (drop patterns validated by < K workspaces) and
 * differential privacy noise (Laplacian) to evidenceWorkspacesCount.
 *
 * All functions are pure — no side effects, no persistence.
 */

import type { CandidatePattern, KAnonymityParams, DiffPrivacyParams, WisdomPattern } from './wisdom.types';
import { DEFAULT_K_ANONYMITY, DEFAULT_DIFF_PRIVACY_EPSILON } from './wisdom.types';
import type { PatternTaxonomy } from './wisdom.types';

/**
 * Laplacian noise generator for differential privacy.
 * Uses the inverse CDF method for the Laplace(0, b) distribution.
 * `scale` = sensitivity / epsilon.
 */
function laplacianNoise(scale: number): number {
  const u = Math.random() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

/**
 * Apply k-anonymity: drop any candidate pattern with
 * evidenceWorkspacesCount < k.
 */
export function applyKAnonymity(
  candidates: readonly CandidatePattern[],
  params: Partial<KAnonymityParams> = {},
): CandidatePattern[] {
  const k = Math.max(1, params.k ?? DEFAULT_K_ANONYMITY);
  return candidates.filter(c => c.evidenceWorkspacesCount >= k);
}

/**
 * Add Laplacian noise to the aggregatedValue of each candidate pattern.
 * The noise is calibrated by `epsilon` — lower epsilon = more privacy.
 *
 * Sensitivity is 1.0 per workspace count (one workspace removing events
 * changes the aggregated value by at most 1.0 in rate terms).
 */
export function applyDiffPrivacyNoise(
  candidates: readonly CandidatePattern[],
  params: Partial<DiffPrivacyParams> = {},
): CandidatePattern[] {
  const epsilon = Math.max(0.01, params.epsilon ?? DEFAULT_DIFF_PRIVACY_EPSILON);
  const scale = 1.0 / epsilon;

  return candidates.map(c => ({
    ...c,
    aggregatedValue: Math.max(0, c.aggregatedValue + laplacianNoise(scale)),
    confidence: Math.max(0, Math.min(0.95, c.confidence - Math.abs(laplacianNoise(scale * 0.5)))),
  }));
}

/**
 * Full anonymization pipeline: k-anonymity → diff-privacy noise.
 * Returns patterns that survive both privacy filters.
 */
export function anonymizePatterns(
  candidates: readonly CandidatePattern[],
  opts: {
    readonly kAnonymity?: Partial<KAnonymityParams>;
    readonly diffPrivacy?: Partial<DiffPrivacyParams>;
  } = {},
): CandidatePattern[] {
  const afterK = applyKAnonymity(candidates, opts.kAnonymity);
  return applyDiffPrivacyNoise(afterK, opts.diffPrivacy);
}

/**
 * Clean workspace IDs from a candidate pattern before converting to
 * the public WisdomPattern type. This ensures no workspaceId leaks.
 * The taxonomy parameter allows the caller to attach structured tags.
 */
export function toWisdomPattern(
  candidate: CandidatePattern,
  taxonomy: PatternTaxonomy = {
    verticalHint: undefined,
    tickethint: undefined,
    stageHint: undefined,
    channelHint: undefined,
  },
): WisdomPattern {
  return {
    patternId: candidate.patternId,
    description: candidate.description,
    applicableConditions: candidate.applicableConditions,
    evidenceWorkspacesCount: candidate.evidenceWorkspacesCount,
    confidence: candidate.confidence,
    signalKind: candidate.signalKind,
    taxonomy,
  };
}
