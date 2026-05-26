/**
 * MindAutonomyCoordinator — canonical name for the autonomy proposal service
 * (ADR-0013 Wave M1).
 *
 * Legacy implementation: `backend/src/kloel/brain-autonomy.service.ts`.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  BrainAutonomyService as MindAutonomyCoordinator,
  /** @deprecated Use {@link MindAutonomyCoordinator} instead. */
  BrainAutonomyService,
  type BrainAutonomyProposal,
} from '../../brain-autonomy.service';
