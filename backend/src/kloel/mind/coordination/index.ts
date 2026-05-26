/**
 * Mind/Coordination — coordination layer of the unified Kloel Mind.
 *
 * Barrel of canonical coordinator services:
 *   - MindAutonomyCoordinator (autonomy proposal)
 *   - MindCapabilityExecutor (capability execution)
 *   - MindCapabilityRegistry (capability registry)
 *   - MindCommercialGraph (commercial knowledge graph)
 *   - MindEventSpine (cognitive spine event bus, re-emits as mind.*)
 *   - MindRuntime (runtime orchestrator)
 *   - WhatsAppMindCoordinator (per-channel coordinator)
 *   - LeadMindCoordinator (per-lead coordinator)
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export { MindAutonomyCoordinator, type BrainAutonomyProposal } from './mind-autonomy-coordinator.service';
export { MindCapabilityExecutor, type CapabilityResult } from './mind-capability-executor.service';
export { MindCapabilityRegistry } from './mind-capability-registry.service';
export { MindCommercialGraph } from './mind-commercial-graph.service';
export { MindEventSpine } from './mind-event-spine.service';
export { MindRuntime } from './mind-runtime.service';
export { WhatsAppMindCoordinator } from './whatsapp-mind-coordinator.service';
export { LeadMindCoordinator } from './lead-mind-coordinator.service';
