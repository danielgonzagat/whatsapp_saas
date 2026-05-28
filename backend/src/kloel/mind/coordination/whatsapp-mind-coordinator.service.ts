/**
 * WhatsAppMindCoordinator — canonical name for the per-channel WhatsApp
 * cognitive coordinator (ADR-0013 Wave M1).
 *
 * Legacy implementation: `backend/src/kloel/whatsapp-brain.service.ts`.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  WhatsAppBrainService as WhatsAppMindCoordinator,
  /** @deprecated Use {@link WhatsAppMindCoordinator} instead. */
  WhatsAppBrainService,
} from '../../whatsapp-brain.service';
