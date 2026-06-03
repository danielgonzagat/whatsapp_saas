/**
 * Feature flag: route ALL outbound WhatsApp sends through the canonical
 * compliant dispatcher (`WhatsappMessageDispatcherService`) instead of the
 * raw provider send.
 *
 * Mission P0-B — closes the WhatsApp outbound COMPLIANCE/BILLING leak:
 * today the kloel `WhatsAppChannelTransport` and the campaigns bulk blast
 * call the provider's `sendMessage` / `sendTextMessage` directly, bypassing
 * plan-limit enforcement (`ensureSubscriptionActive`), opt-in enforcement
 * (`ensureOptInAllowed`), queue routing and billing metering
 * (`trackMessageSend`) that the dispatcher enforces.
 *
 * Idiom: bare `process.env.X === 'true'` read, mirroring the existing
 * `ENFORCE_OPTIN === 'true'` gate in the dispatcher and the repo-wide
 * convention. **DEFAULT OFF** — when unset (or any value other than the
 * exact string `'true'`), the legacy direct-send path is preserved
 * byte-for-byte.
 *
 * The env var is read live on every call so operators (and tests) can flip
 * it without a process restart. This is a single synchronous boolean read —
 * it adds no awaits to the flag-off path.
 *
 * @returns true only when KLOEL_COMPLIANT_WHATSAPP_SEND is exactly 'true'.
 */
export function isCompliantWhatsappSendEnabled(): boolean {
  return process.env.KLOEL_COMPLIANT_WHATSAPP_SEND === 'true';
}
