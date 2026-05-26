/**
 * MindEventSpine — canonical name for the event spine bus
 * (ADR-0013 Wave M1). This is the central nervous system that re-emits raw
 * CRUD events (`product.created`, `plan.created`, `channel.message.received`,
 * etc.) as canonical `mind.*` events.
 *
 * Legacy implementation: `backend/src/kloel/brain-event-spine.service.ts`.
 * Cross-domain callers: products, plans, admin/pipeline, omnichannel,
 * unified-agent-actions-messaging, and ~17 more kloel internals.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  BrainEventSpineService as MindEventSpine,
  /** @deprecated Use {@link MindEventSpine} instead. */
  BrainEventSpineService,
} from '../../brain-event-spine.service';
