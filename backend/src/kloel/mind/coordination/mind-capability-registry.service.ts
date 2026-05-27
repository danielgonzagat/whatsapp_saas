/**
 * MindCapabilityRegistry — canonical name for the capability registry service
 * (ADR-0013 Wave M1).
 *
 * Legacy implementation: `backend/src/kloel/brain-capability-registry.service.ts`.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  BrainCapabilityRegistryService as MindCapabilityRegistry,
  /** @deprecated Use {@link MindCapabilityRegistry} instead. */
  BrainCapabilityRegistryService,
} from '../../brain-capability-registry.service';
