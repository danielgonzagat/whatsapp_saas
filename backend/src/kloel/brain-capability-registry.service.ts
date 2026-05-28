/**
 * @deprecated Use {@link ./mind/coordination/mind-capability-registry.service.ts MindCapabilityRegistry}.
 * ADR-0013 Wave M1 legacy alias — canonical implementation now lives at
 * `kloel/mind/coordination/mind-capability-registry.service.ts`. This shim
 * stays for the 4-week alias window so existing imports keep resolving.
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/mind-capability-registry.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  MindCapabilityRegistry,
  /** @deprecated Use {@link MindCapabilityRegistry} instead. */
  BrainCapabilityRegistryService,
  type BrainCapabilityDefinition,
  type BrainCapabilityDomain,
} from './mind/coordination/mind-capability-registry.service';
