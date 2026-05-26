/**
 * MindRuntime — canonical name for the cognitive runtime orchestrator
 * (ADR-0013 Wave M1).
 *
 * Legacy implementation: `backend/src/kloel/brain-runtime.service.ts`.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  BrainRuntimeService as MindRuntime,
  /** @deprecated Use {@link MindRuntime} instead. */
  BrainRuntimeService,
} from '../../brain-runtime.service';
