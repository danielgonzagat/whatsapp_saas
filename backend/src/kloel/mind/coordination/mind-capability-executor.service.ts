/**
 * MindCapabilityExecutor — canonical name for the capability execution service
 * (ADR-0013 Wave M1).
 *
 * Legacy implementation: `backend/src/kloel/brain-capability-executor.service.ts`.
 * Used by: unified-agent.service, kloel-thinker.service, kloel-thinker.helpers,
 * unified-agent.cognitive-state.helpers.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  BrainCapabilityExecutorService as MindCapabilityExecutor,
  /** @deprecated Use {@link MindCapabilityExecutor} instead. */
  BrainCapabilityExecutorService,
  type CapabilityResult,
} from '../../brain-capability-executor.service';
