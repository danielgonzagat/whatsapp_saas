/**
 * Feature flag for the Instagram CONTROLLER DM-send canonicalization (census P2).
 *
 * {@link InstagramController.sendMessage} (`POST /meta/instagram/messages/send`)
 * resolves the per-workspace Instagram connection and then calls
 * {@link InstagramService.sendMessage}(`igAccountId`, `recipientId`, `text`,
 * `accessToken`) DIRECTLY — bypassing the canonical cross-channel dispatch front
 * door ({@link ChannelMessageDispatchService} over the pure
 * {@link ChannelDispatchRegistry} + {@link InstagramDispatchAdapter}) that the
 * rest of OmniCore routes through.
 *
 * When this flag is set to exactly `'true'` AND the canonical service is
 * injected, `sendMessage` keeps its existing connection-resolution shell, then
 * DELEGATES the actual provider call to
 * {@link ChannelMessageDispatchService.dispatch}(workspaceId, 'instagram', …),
 * passing the already-resolved `igAccountId` + `accessToken` as explicit
 * credential overrides so the canonical path uses the EXACT same credentials
 * this controller resolved (no double Meta-connection resolution, no behavior
 * drift). The canonical `ChannelSendResult` is mapped back to the existing raw
 * Graph response shape `{ message_id }`.
 *
 * DEFAULT OFF. When OFF — or when the canonical service is not injected
 * (`@Optional` slot empty) or the canonical dispatch reports a blocked/failed
 * result — `sendMessage` runs its EXISTING
 * `instagramService.sendMessage(...)` path byte-for-byte unchanged. The single
 * env read short-circuits before any canonical service is touched, so there is
 * zero added latency and zero behavior change on the outbound critical path.
 *
 * Mirrors the sibling marketing-surface flag
 * {@link isInstagramCanonicalDispatchEnabled} and the repo's established
 * `process.env.X === 'true'` flag idiom.
 *
 * @see backend/src/marketing/channels/instagram/instagram.controller.ts
 * @see backend/src/marketing/channel-message-dispatch.service.ts
 * @see backend/src/marketing/instagram/instagram-canonical-dispatch.flag.ts
 */
export function isInstagramControllerCanonicalDispatchEnabled(): boolean {
  return process.env.KLOEL_INSTAGRAM_CONTROLLER_CANONICAL_DISPATCH === 'true';
}
