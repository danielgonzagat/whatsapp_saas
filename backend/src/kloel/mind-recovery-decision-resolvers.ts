/**
 * @deprecated File moved to `kloel/mind/policy/mind-recovery-decision-resolvers.ts`
 * during ADR-0013 Wave M1. This re-export keeps the legacy path live
 * during the 4-week alias window.
 *
 * @cluster Mind/Policy
 */
export {
  resolveCartRecoveryDecision,
  resolveFollowupTimingDecision,
  type MindBanditChooser,
  type MindPolicyChooser,
  type PolicyDecisionResult,
} from './mind/policy/mind-recovery-decision-resolvers';
