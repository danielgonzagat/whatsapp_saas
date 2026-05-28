/**
 * Pure helpers for MindPolicy global-prior mixing and autopilot outcome
 * confirmation.
 *
 * These functions are extracted from `mind-policy.service.ts` so the
 * Bayesian-style cold-start mixing math and the time-window classification
 * for delayed `message.received` outcomes can be unit-tested without a
 * Prisma harness. The service keeps the I/O (DB reads, global prior fetch,
 * update writes); these helpers own only the math/branching contract.
 *
 * Behavior contract — preserve exact semantics (mind-policy.confirm-autopilot
 * specs assert against the literal output strings and skip rules):
 *
 *   1. {@link computeGlobalPriorMix} mirrors the inlined formula:
 *        globalNWeight = min(globalN, coldStartThreshold - localN)
 *        mixedMean     = (localN * localMean + globalNWeight * globalMean) /
 *                        (localN + globalNWeight)
 *        priorWeight   = globalNWeight / (localN + globalNWeight)
 *
 *   2. {@link shouldSkipGlobalPriorMix} returns true when the caller must
 *      use the local belief unchanged: workspace opted out, no channel,
 *      no global prior service available, or local samples already past
 *      the cold-start threshold.
 *
 *   3. {@link classifyAutopilotConfirmation} returns 'skip' when the row
 *      already carries an outcomeConfidence label, 'confirmed' when the
 *      resolvedAt falls inside the response window, and 'unanswered'
 *      otherwise. resolvedAt === null is treated as outside the window.
 */

/** Cold-start threshold used by the global-prior mixing pass. */
export const MIND_POLICY_COLD_START_THRESHOLD = 30;

/**
 * Inputs accepted by {@link shouldSkipGlobalPriorMix}. Mirrors the
 * runtime predicate at the head of `MindPolicyService.mixWithGlobalPrior`.
 */
export interface GlobalPriorSkipInput {
  workspaceOptedOut: boolean;
  channel: string | undefined;
  hasGlobalPrior: boolean;
  beliefSamples: number;
  coldStartThreshold?: number;
}

/**
 * Returns true when the caller must NOT mix the local belief with the
 * cross-workspace global prior. Encodes the same disjunction the service
 * runs inline: workspace opt-out, missing channel, missing global-prior
 * provider, or local samples already at/above the cold-start threshold.
 */
export function shouldSkipGlobalPriorMix(input: GlobalPriorSkipInput): boolean {
  const threshold = input.coldStartThreshold ?? MIND_POLICY_COLD_START_THRESHOLD;
  return (
    input.workspaceOptedOut ||
    !input.channel ||
    !input.hasGlobalPrior ||
    input.beliefSamples >= threshold
  );
}

/** Inputs for {@link computeGlobalPriorMix}. */
export interface GlobalPriorMixInput {
  localN: number;
  localMean: number;
  globalN: number;
  globalMean: number;
  coldStartThreshold?: number;
}

/** Result of {@link computeGlobalPriorMix}. */
export interface GlobalPriorMixResult {
  mixedMean: number;
  priorWeight: number;
}

/**
 * Bayesian-style cold-start mixing: weights the global prior more heavily
 * when the local belief has few samples. The global weight is capped at
 * `coldStartThreshold - localN` so it never exceeds the gap between local
 * samples and the threshold. When the divisor is zero (no local samples
 * and no remaining gap) the function falls back to the local mean with
 * zero prior weight to preserve the runtime invariant that callers can
 * safely consume the result.
 */
export function computeGlobalPriorMix(input: GlobalPriorMixInput): GlobalPriorMixResult {
  const threshold = input.coldStartThreshold ?? MIND_POLICY_COLD_START_THRESHOLD;
  const globalNWeight = Math.min(input.globalN, threshold - input.localN);
  const denom = input.localN + globalNWeight;
  if (denom <= 0) {
    return { mixedMean: input.localMean, priorWeight: 0 };
  }
  const mixedMean = (input.localN * input.localMean + globalNWeight * input.globalMean) / denom;
  const priorWeight = globalNWeight / denom;
  return { mixedMean, priorWeight };
}

/** Inputs for {@link classifyAutopilotConfirmation}. */
export interface AutopilotConfirmationInput {
  existingConfidence: unknown;
  resolvedAt: Date | null | undefined;
  windowCutoff: Date;
}

/** Decision returned by {@link classifyAutopilotConfirmation}. */
export type AutopilotConfirmationDecision = 'skip' | 'confirmed' | 'unanswered';

/**
 * Classify a delayed `message.received` outcome row for the
 * `confirmAutopilotOutcome` pass:
 *   - 'skip'       when the row already carries any outcomeConfidence label
 *                  (matches `ctx.outcomeConfidence !== undefined && !== null`)
 *   - 'confirmed'  when resolvedAt is a real date inside the window
 *   - 'unanswered' otherwise (missing resolvedAt or outside the window)
 *
 * Pure — no DB writes, no logging. The caller still owns the Prisma update
 * and the confirmed/unanswered counters.
 */
export function classifyAutopilotConfirmation(
  input: AutopilotConfirmationInput,
): AutopilotConfirmationDecision {
  if (input.existingConfidence !== undefined && input.existingConfidence !== null) {
    return 'skip';
  }
  const isWithinWindow = input.resolvedAt != null && input.resolvedAt >= input.windowCutoff;
  return isWithinWindow ? 'confirmed' : 'unanswered';
}
