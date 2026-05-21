/**
 * WISDOM-003 — Validation by N Workspaces.
 *
 * Only patterns confirmed by ≥ N workspaces are kept.
 * Pure function — no side effects, no persistence.
 *
 * This is distinct from k-anonymity: k-anonymity drops patterns
 * based on minimum workspace count for privacy; N-validation drops
 * patterns based on confirmation count for signal quality.
 */

import type { CandidatePattern, NValidationParams } from './wisdom.types';
import { DEFAULT_N_VALIDATION } from './wisdom.types';

/**
 * Filter candidate patterns to only those confirmed by ≥ N workspaces.
 * A pattern is "confirmed" when evidenceWorkspacesCount >= n.
 *
 * Returns the filtered array. If no patterns survive, returns empty.
 */
export function validateByNWorkspaces(
  candidates: readonly CandidatePattern[],
  params: Partial<NValidationParams> = {},
): CandidatePattern[] {
  const n = Math.max(1, params.n ?? DEFAULT_N_VALIDATION);
  return candidates.filter(c => c.evidenceWorkspacesCount >= n);
}

/**
 * More granular validation: returns three buckets:
 *   - confirmed: patterns with ≥ N workspaces
 *   - candidates: patterns with ≥ 2 but < N workspaces
 *   - rejected: patterns with < 2 workspaces
 */
export function classifyByNWorkspaces(
  candidates: readonly CandidatePattern[],
  n: number = DEFAULT_N_VALIDATION,
): {
  readonly confirmed: readonly CandidatePattern[];
  readonly candidate: readonly CandidatePattern[];
  readonly rejected: readonly CandidatePattern[];
} {
  const effectiveN = Math.max(2, n);

  const confirmed: CandidatePattern[] = [];
  const candidate: CandidatePattern[] = [];
  const rejected: CandidatePattern[] = [];

  for (const c of candidates) {
    if (c.evidenceWorkspacesCount >= effectiveN) {
      confirmed.push(c);
    } else if (c.evidenceWorkspacesCount >= 2) {
      candidate.push(c);
    } else {
      rejected.push(c);
    }
  }

  return { confirmed, candidate, rejected };
}
