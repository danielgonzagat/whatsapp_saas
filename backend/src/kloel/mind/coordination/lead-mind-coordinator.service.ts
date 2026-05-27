/**
 * LeadMindCoordinator — canonical name for the per-lead cognitive coordinator
 * (ADR-0013 Wave M1).
 *
 * Legacy implementation: `backend/src/kloel/kloel-lead-brain.service.ts`.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  KloelLeadBrainService as LeadMindCoordinator,
  /** @deprecated Use {@link LeadMindCoordinator} instead. */
  KloelLeadBrainService,
} from '../../kloel-lead-brain.service';
