/**
 * Pure helpers extracted from `MindPolicyService` (Claude wave 108).
 *
 * These helpers own the **non-I/O** branches of the service so the runtime
 * methods keep only the orchestration / Prisma side of the contract. Each
 * function below is referenced exactly once from the service after wave 108
 * — the goal of the split is testability and decomposition of the previously
 * ~490 LOC service, not call-site deduplication.
 *
 * Behavior contract — preserve exact semantics already asserted by:
 *
 *   - `mind-policy.service.spec.ts` (choose / fallback / epsilon plumbing)
 *   - `mind-policy.resolve-outcome.spec.ts` (resolveOutcome paths)
 *   - `mind-policy.confirm-autopilot.spec.ts` (delayed outcome window)
 *   - `mind-policy.global-prior.helpers.spec.ts` (mixWithGlobalPrior math)
 *
 * Rules:
 *   1. Pure — no DB writes, no logging, no `Date.now()` unless the original
 *      inlined call already used it (see {@link extractChooseDefaults}).
 *   2. Same input → same output: all branches are deterministic.
 *   3. Type-only imports from `mind.types` and Prisma so the helpers stay
 *      cheap to import from spec files.
 */

import type {
  MindActionCandidate,
  MindBelief,
  MindPolicyCalcStep,
  MindPolicyDecision,
} from '../../mind.types';
import type { MindPolicyHarnessResult, MindPolicyInput } from './mind-policy-calculation';
import { buildPolicyDecision, resolveBaselineAction } from './mind-policy-calculation';
import type { ResolvedPolicyRow } from './mind-policy.helpers';

/**
 * Shape of the `buildPolicyArtifacts` output. The calculation module returns
 * this anonymously so we name it locally for use across helper signatures.
 */
export interface MindPolicyArtifacts {
  candidates: MindActionCandidate[];
  calcSteps: MindPolicyCalcStep[];
}

/** Default success utility applied when {@link MindPolicyInput.utilitySuccess} is omitted. */
export const MIND_POLICY_DEFAULT_UTILITY_SUCCESS = 1;
/** Default failure utility applied when {@link MindPolicyInput.utilityFail} is omitted. */
export const MIND_POLICY_DEFAULT_UTILITY_FAIL = -0.2;
/** Default exploration weight applied when {@link MindPolicyInput.epsilon} is omitted. */
export const MIND_POLICY_DEFAULT_EPSILON = 0.5;
/** Default minimum harness samples before a baseline fallback can fire. */
export const MIND_POLICY_DEFAULT_FALLBACK_MIN_SAMPLES = 30;

/**
 * Resolved configuration used by `MindPolicyService.choose`. Mirrors the
 * four `??` defaulting lines at the head of the runtime method so the spec
 * suite can verify the precedence rules without instantiating the service.
 */
export interface MindPolicyChooseDefaults {
  utilitySuccess: number;
  utilityFail: number;
  epsilon: number;
  minSamples: number;
}

/**
 * Resolve the four `choose()` defaults in one shot. Preserves the original
 * precedence (caller-supplied value beats default) and the original constants
 * (1 / -0.2 / 0.5 / 30). Pure.
 */
export function extractChooseDefaults(input: MindPolicyInput): MindPolicyChooseDefaults {
  return {
    utilitySuccess: input.utilitySuccess ?? MIND_POLICY_DEFAULT_UTILITY_SUCCESS,
    utilityFail: input.utilityFail ?? MIND_POLICY_DEFAULT_UTILITY_FAIL,
    epsilon: input.epsilon ?? MIND_POLICY_DEFAULT_EPSILON,
    minSamples: input.fallbackMinSamples ?? MIND_POLICY_DEFAULT_FALLBACK_MIN_SAMPLES,
  };
}

/**
 * Build the `resolveBaselineAction` payload from a {@link MindPolicyInput}
 * plus the fallback action lifted from the worst policy artifact. The
 * `?? undefined` spread pattern mirrors the verbose conditional spread used
 * inline by the service so optional properties stay genuinely optional
 * (TypeScript's `exactOptionalPropertyTypes` enforcement).
 */
export function buildBaselineActionInput(
  input: Pick<MindPolicyInput, 'baseline' | 'baselineActionQuiet'>,
  fallbackAction: string | undefined,
): Parameters<typeof resolveBaselineAction>[0] {
  return {
    ...(input.baseline !== undefined ? { baseline: input.baseline } : {}),
    ...(input.baselineActionQuiet !== undefined
      ? { baselineActionQuiet: input.baselineActionQuiet }
      : {}),
    ...(fallbackAction !== undefined ? { fallback: fallbackAction } : {}),
  };
}

/** Inputs for {@link assembleChooseDecision}. */
export interface AssembleChooseDecisionInput {
  artifacts: MindPolicyArtifacts;
  baselineAction: string;
  epsilon: number;
  policy: MindPolicyInput;
  utilityFail: number;
  utilitySuccess: number;
  usedGlobalPrior: boolean;
  maxPriorWeight: number;
}

/**
 * Combine {@link buildPolicyDecision} output with the `usedGlobalPrior` /
 * `priorWeight` markers tracked separately by the mix-with-global-prior pass.
 *
 * The runtime spreads the policy-decision builder result into a new object
 * and then assigns the two extra fields; this helper centralises that step
 * so the service body keeps a single straight-line call. Pure.
 */
export function assembleChooseDecision(input: AssembleChooseDecisionInput): MindPolicyDecision {
  return {
    ...buildPolicyDecision({
      artifacts: input.artifacts,
      baselineAction: input.baselineAction,
      epsilon: input.epsilon,
      policy: input.policy,
      utilityFail: input.utilityFail,
      utilitySuccess: input.utilitySuccess,
    }),
    usedGlobalPrior: input.usedGlobalPrior,
    priorWeight: input.maxPriorWeight,
  };
}

/**
 * Untouched belief entry produced by {@link buildMixedBeliefDefault}. Returned
 * from `mixWithGlobalPrior` whenever the global prior is unavailable, the
 * channel is missing, the workspace opted out, the belief already has enough
 * samples, or the global-prior store has no observation for the action.
 */
export interface MixedBeliefEntry {
  belief: MindBelief;
  mixedMean: number;
  usedPrior: boolean;
  priorWeight: number;
}

/**
 * Build the "no-mix" mixed-belief entry: the local belief mean is returned
 * untouched and the prior is marked as unused. Pure.
 */
export function buildMixedBeliefDefault(belief: MindBelief): MixedBeliefEntry {
  return {
    belief,
    mixedMean: belief.mean,
    usedPrior: false,
    priorWeight: 0,
  };
}

/**
 * Build the "mixed" mixed-belief entry from the cold-start mix output. Pure.
 */
export function buildMixedBeliefMixed(
  belief: MindBelief,
  mix: { mixedMean: number; priorWeight: number },
): MixedBeliefEntry {
  return {
    belief,
    mixedMean: mix.mixedMean,
    usedPrior: true,
    priorWeight: mix.priorWeight,
  };
}

/**
 * Project the rows fetched for resolution into the
 * {@link ResolvedPolicyRow} shape consumed by
 * `persistResolvedPolicyMemories`. The mapping always coalesces a missing
 * `outcomeKey` to `null` and stamps the supplied outcome on every row.
 *
 * Pure — the runtime uses this inside three different paths
 * (`resolveOutcome`, `resolveOpenForSubject`, `sweepExpiredOutcomes`), each
 * with the same projection.
 */
export function toResolvedPolicyRows(
  rows: ReadonlyArray<{
    id: string;
    workspaceId: string;
    subject: string;
    decisionType: string;
    context: unknown;
    chosen: string;
    baseline: string;
    outcomeKey: string | null | undefined;
  }>,
  outcome: number,
): ResolvedPolicyRow[] {
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    subject: row.subject,
    decisionType: row.decisionType,
    context: row.context,
    chosen: row.chosen,
    baseline: row.baseline,
    outcomeKey: row.outcomeKey ?? null,
    outcome,
  }));
}

/**
 * Type-narrowing predicate for the Prisma unique-constraint error code
 * (`P2002`). Mirrors the inline `err && typeof err === 'object' && err.code
 * === 'P2002'` shape used by `MindPolicyService.persist`. Pure.
 */
export function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 'P2002';
}

/** Inputs for {@link shouldFallbackToBaseline}. */
export interface ShouldFallbackInput {
  harnessResult: MindPolicyHarnessResult;
  minSamples: number;
  shouldUseBaselineFallback: (harness: MindPolicyHarnessResult, minSamples: number) => boolean;
}

/**
 * Convenience wrapper that calls the calculation module's
 * `shouldUseBaselineFallback` with the explicit min-samples threshold. Kept
 * as an indirection so the service body can be tested without re-importing
 * the calculation module in spec mocks. Pure.
 */
export function shouldFallbackToBaseline(input: ShouldFallbackInput): boolean {
  return input.shouldUseBaselineFallback(input.harnessResult, input.minSamples);
}

/** Inputs for {@link buildHarnessSince}. */
export interface HarnessSinceInput {
  sinceDays: number;
  now?: number;
}

/**
 * Compute the `since` cutoff date for `MindPolicyService.harness` lookups.
 * Defaults to `Date.now()` when no explicit reference timestamp is supplied,
 * matching the runtime behaviour.
 */
export function buildHarnessSince(input: HarnessSinceInput): Date {
  const reference = input.now ?? Date.now();
  return new Date(reference - input.sinceDays * 86400 * 1000);
}

/** Inputs for {@link buildSweepCutoff}. */
export interface SweepCutoffInput {
  maxAgeHours: number;
  now?: number;
}

/**
 * Compute the `createdAt` cutoff for `sweepExpiredOutcomes`. Matches the
 * inline expression `new Date(Date.now() - maxAgeHours * 3600 * 1000)`.
 */
export function buildSweepCutoff(input: SweepCutoffInput): Date {
  const reference = input.now ?? Date.now();
  return new Date(reference - input.maxAgeHours * 3600 * 1000);
}

/** Inputs for {@link buildConfirmWindowCutoff}. */
export interface ConfirmWindowCutoffInput {
  windowMinutes: number;
  now?: number;
}

/**
 * Compute the window-cutoff date for `confirmAutopilotOutcome`. Matches the
 * inline expression `new Date(now.getTime() - windowMinutes * 60 * 1000)`.
 */
export function buildConfirmWindowCutoff(input: ConfirmWindowCutoffInput): Date {
  const reference = input.now ?? Date.now();
  return new Date(reference - input.windowMinutes * 60 * 1000);
}

/** Default response window (minutes) used by `confirmAutopilotOutcome`. */
export const MIND_POLICY_DEFAULT_CONFIRM_WINDOW_MINUTES = 30;

/**
 * Resolve the confirm-autopilot window with the default 30-minute fallback.
 * Pure.
 */
export function resolveConfirmWindowMinutes(windowMinutes: number | undefined): number {
  return windowMinutes ?? MIND_POLICY_DEFAULT_CONFIRM_WINDOW_MINUTES;
}
