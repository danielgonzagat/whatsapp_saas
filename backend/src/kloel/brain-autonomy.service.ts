/**
 * @deprecated Use {@link ./mind/coordination/mind-autonomy-coordinator.service.ts MindAutonomyCoordinator}.
 * ADR-0013 Wave M1 legacy alias — canonical implementation now lives at
 * `kloel/mind/coordination/mind-autonomy-coordinator.service.ts`. This shim
 * stays for the 4-week alias window so existing imports keep resolving.
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/mind-autonomy-coordinator.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  MindAutonomyCoordinator,
  /** @deprecated Use {@link MindAutonomyCoordinator} instead. */
  BrainAutonomyService,
  type BrainAutonomyProposal,
} from './mind/coordination/mind-autonomy-coordinator.service';
