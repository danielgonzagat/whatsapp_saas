/**
 * @deprecated Use {@link ./mind/coordination/lead-mind-coordinator.service.ts LeadMindCoordinator}.
 * ADR-0013 Wave M1 alias window (4 weeks).
 *
 * Canonical implementation moved to:
 *   backend/src/kloel/mind/coordination/lead-mind-coordinator.service.ts
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/lead-mind-coordinator.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  LeadMindCoordinator,
  /** @deprecated Use {@link LeadMindCoordinator} instead. */
  KloelLeadBrainService,
  NON_DIGIT_RE,
  safeStr,
  asUnknownRecord,
  detectBuyIntent,
} from './mind/coordination/lead-mind-coordinator.service';
export type { ChatMessage } from './mind/coordination/lead-mind-coordinator.service';
