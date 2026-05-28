/**
 * @deprecated Use {@link ./mind/coordination/whatsapp-mind-coordinator.service.ts WhatsAppMindCoordinator}.
 * ADR-0013 Wave M1 alias window (4 weeks). Also: per ADR-0012 OmniCore,
 * the WhatsApp channel is being absorbed into marketing/channels/whatsapp/;
 * the per-channel cognitive coordinator stays under Mind regardless.
 *
 * Canonical implementation moved to:
 *   backend/src/kloel/mind/coordination/whatsapp-mind-coordinator.service.ts
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/whatsapp-mind-coordinator.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
export {
  WhatsAppMindCoordinator,
  /** @deprecated Use {@link WhatsAppMindCoordinator} instead. */
  WhatsAppBrainService,
} from './mind/coordination/whatsapp-mind-coordinator.service';
