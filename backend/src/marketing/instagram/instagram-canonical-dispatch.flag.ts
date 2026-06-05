/**
 * Feature flag for the Instagram DM dispatch canonicalization (census P2-3).
 *
 * The Instagram marketing surface sends a direct message through
 * {@link InstagramMarketingService.sendDirectMessage}, which resolves the
 * per-workspace Meta connection and then calls
 * {@link InstagramService.sendMessage}(`igAccountId`, `recipientId`, `text`,
 * `accessToken`) DIRECTLY — bypassing the canonical cross-channel dispatch
 * front door ({@link ChannelMessageDispatchService} over the pure
 * {@link ChannelDispatchRegistry} + {@link InstagramDispatchAdapter}) that the
 * rest of OmniCore routes through (guards / metering / capability shell).
 *
 * When this flag is set to `'true'`, `sendDirectMessage` keeps its existing
 * validation + Meta-connection resolution shell, then DELEGATES the actual
 * provider call to
 * {@link ChannelMessageDispatchService.dispatch}(workspaceId, 'instagram', …),
 * mapping the canonical `ChannelSendResult` back to the service's existing
 * `{ messageId, metaResponse }` return shape. This collapses the second
 * parallel Instagram send path onto the single canonical dispatch registry.
 *
 * DEFAULT OFF. When OFF, `sendDirectMessage` runs its EXISTING
 * `instagramService.sendMessage(...)` path byte-for-byte unchanged — the single
 * env read short-circuits before any canonical service is touched, so there is
 * zero added latency and zero behavior change on the outbound critical path.
 *
 * Graceful fallback even when ON: if the canonical service is not injected
 * (`@Optional` slot empty) or the canonical build/dispatch throws (DI/build
 * failure), the existing raw path runs unchanged.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_TRANSPORT_CANONICAL_DELEGATE`, `KLOEL_DECISION_LEDGER_DUALWRITE`).
 *
 * @see backend/src/marketing/instagram/instagram-marketing.service.ts
 * @see backend/src/marketing/channel-message-dispatch.service.ts
 * @see backend/src/kloel/channel-transport-canonical-delegate.flag.ts
 */
export function isInstagramCanonicalDispatchEnabled(): boolean {
  return process.env.KLOEL_INSTAGRAM_CANONICAL_DISPATCH === 'true';
}
