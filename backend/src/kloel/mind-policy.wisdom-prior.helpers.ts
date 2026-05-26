import type { MindBelief } from './mind.types';
import type { WisdomPattern } from './wisdom/wisdom.types';
import type { WisdomRelevanceFilter } from './wisdom/wisdom-relevance-filter.service';
import type { WisdomPatternStore } from './wisdom/wisdom-pattern-store.service';
// WISDOM — CIA Gap 9: cross-workspace pattern prior scaling
const WISDOM_SCALE_FACTOR = 0.5;
const WISDOM_PRIOR_TARGET = 1.0;
/**
 * Apply wisdom patterns as Beta prior nudges (CIA Gap 9).
 *
 * Formula — for each matching wisdom pattern with confidence c:
 *   wisdomWeight = WISDOM_SCALE_FACTOR × c  (= 0.5 × c)
 *   For each option whose predicate or context aligns with the pattern's
 *   signalKind:
 *     effectiveN  = max(1, belief.samples)
 *     priorTarget = 1.0  (pattern suggests positive outcome)
 *     nudgedMean  = (mean × effectiveN + wisdomWeight × priorTarget)
 *                 / (effectiveN + wisdomWeight)
 *
 * The scale factor ensures wisdom never dominates workspace-specific signal.
 * Wrapped in try/catch — failures log but never block the decision.
 */
export function applyWisdomPriors(input: {
  mixedBeliefs: Array<{ belief: MindBelief; mixedMean: number; usedPrior: boolean; priorWeight: number }>;
  channel: string | undefined;
  decisionType: string;
  inputOptions: Array<{ action: string }>;
  workspaceId: string;
  wisdomFilter?: WisdomRelevanceFilter;
  wisdomStore?: WisdomPatternStore;
  logger?: {
    debug?: (msg: { operation: string; status: string; workspaceId: string; decisionType: string; matchingPatterns: number; maxConfidence: number; wisdomWeight: number; nudgedOptions: number }) => void;
    warn?: (msg: { operation: string; status: string; workspaceId: string; decisionType: string; error: string }) => void;
  };
}): Array<{ belief: MindBelief; mixedMean: number; usedPrior: boolean; priorWeight: number; wisdomNudged: boolean }> {
  const result = input.mixedBeliefs.map((m) => ({ ...m, wisdomNudged: false }));

  if (!input.wisdomFilter || !input.wisdomStore) {
    return result;
  }

  const patterns = input.wisdomStore.getPatterns();
  if (patterns.length === 0) {
    return result;
  }

  try {
    const relevant = input.wisdomFilter.filter(patterns, input.workspaceId, {
      ...(input.channel !== undefined && { channel: input.channel }),
      decisionType: input.decisionType,
    });

    if (relevant.length === 0) {
      return result;
    }

    // Aggregate wisdom weight: max confidence among matching patterns, scaled.
    const maxConfidence = Math.max(...relevant.map((p) => p.confidence));
    const wisdomWeight = WISDOM_SCALE_FACTOR * maxConfidence;
    const priorTarget = WISDOM_PRIOR_TARGET;

    for (let i = 0; i < result.length; i++) {
      const entry = result[i]!;
      const option = input.inputOptions[i];

      // Determine alignment: does the option's predicate/context keywords
      // overlap with any matching pattern's signalKind?
      const aligned = wisdomAlignsWithOption(relevant, option);
      if (!aligned) {
        continue;
      }

      const effectiveN = Math.max(1, entry.belief.samples ?? 0);
      const localMean = entry.mixedMean;
      entry.mixedMean =
        (localMean * effectiveN + wisdomWeight * priorTarget) /
        (effectiveN + wisdomWeight);
      entry.wisdomNudged = true;
    }

    input.logger?.debug?.({
      operation: 'mind_policy.wisdom_prior',
      status: 'ok',
      workspaceId: input.workspaceId,
      decisionType: input.decisionType,
      matchingPatterns: relevant.length,
      maxConfidence,
      wisdomWeight,
      nudgedOptions: result.filter((r) => r.wisdomNudged).length,
    });
  } catch (err: unknown) {
    input.logger?.warn?.({
      operation: 'mind_policy.wisdom_prior',
      status: 'error',
      workspaceId: input.workspaceId,
      decisionType: input.decisionType,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }

  return result;
}
/**
 * Check whether a wisdom pattern set aligns with a decision option.
 * Returns true if any pattern's signalKind keyword appears in the
 * option's predicate or context.
 */
function wisdomAlignsWithOption(
  patterns: readonly WisdomPattern[],
  option?: { action: string; predicate?: string; context?: Record<string, unknown> },
): boolean {
  if (!option) return false;

  const searchText = [
    option.predicate ?? '',
    option.action ?? '',
    ...Object.values(option.context ?? {}).map(String),
  ]
    .join(' ')
    .toLowerCase();

  return patterns.some((p) => {
    // Extract the core concept from signalKind: e.g., 'reply_rate' → 'reply'
    const concept = p.signalKind.replace(/_rate|_volume|_efficiency|_distribution|_concentration|_activity$/, '');
    return concept.length > 0 && searchText.includes(concept);
  });
}
