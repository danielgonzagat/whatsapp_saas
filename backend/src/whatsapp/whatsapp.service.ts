/**
 * @deprecated Use 'backend/src/marketing/channels/whatsapp/whatsapp.service' directly.
 *   Per ADR-0012 OmniCore Wave W3 — canonical WhatsApp service relocated to the
 *   marketing/channels/whatsapp domain alongside its providers, session, dispatcher
 *   and reconciler peers. Re-export retained until ADR-0012 Wave W4 cleanup window
 *   closes.
 *   See docs/architecture/DEPRECATION_MAP.md and ADR-0012.
 */
export { WhatsappService } from '../marketing/channels/whatsapp/whatsapp.service';
