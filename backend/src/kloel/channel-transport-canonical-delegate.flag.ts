/**
 * Feature flag for the OmniCore dispatch-registry collapse (census P1-1).
 *
 * The Kloel agent/inbox/webhook outbound layer goes through the guarded
 * {@link ChannelTransportRegistry.send} (CONTRACT-A:
 * `{ success, messageId?, error?, blocked, blockedReason? }`). The canonical
 * cross-channel send front door is
 * {@link ChannelMessageDispatchService.sendMessage} over the pure
 * {@link ChannelDispatchRegistry} (CONTRACT-B: `blocked` OPTIONAL + extra
 * fields). These were TWO parallel provider-call paths.
 *
 * When this flag is set to `'true'`, the transport registry KEEPS its full
 * MindGuards + isConfigured + capability/audit shell but DELEGATES the actual
 * provider call (for the Meta/WhatsApp channels) to the canonical
 * `ChannelMessageDispatchService.sendMessage(ChannelSendInput)`, then maps the
 * CONTRACT-B result back to CONTRACT-A. This collapses the two parallel send
 * paths onto the single canonical dispatch registry.
 *
 * DEFAULT OFF. When OFF the transport registry runs its EXISTING
 * `provider.send(...)` path byte-for-byte unchanged — the single env read
 * short-circuits before any canonical service is touched, so there is zero
 * added latency and zero behavior change on the outbound critical path.
 *
 * Email is intentionally EXCLUDED from delegation even when ON: the canonical
 * `EmailDispatchAdapter` is a connected-mailbox (Gmail / Microsoft / IMAP-SMTP)
 * send, which is a DIFFERENT delivery mechanism than the transport layer's
 * `EmailCampaignService` (Resend / SendGrid / env-SMTP) path. Delegating email
 * would change behavior, so email always stays on the current path.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_DECISION_LEDGER_DUALWRITE`, `KLOEL_MINDMEMORY_DUALWRITE`).
 *
 * @see backend/src/kloel/channel-transport.registry.ts
 * @see backend/src/marketing/channel-message-dispatch.service.ts
 * @see backend/src/marketing/channel-message-dispatch.helpers.ts
 */
export function isTransportCanonicalDelegateEnabled(): boolean {
  return process.env.KLOEL_TRANSPORT_CANONICAL_DELEGATE === 'true';
}
