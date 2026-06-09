/**
 * Feature flag for the TikTok inbox DM-send canonicalization (census P2).
 *
 * {@link TikTokInboxController.sendMessage} (`POST /marketing/tiktok/send`)
 * delegates directly to {@link TikTokInboxService.sendMessage}, which returns an
 * honest `{ ok: false, reason: 'channel_pending' }` shape — TikTok Business
 * Messaging has NO programmatic outbound-send API (inbound webhook only).
 *
 * When this flag is set to exactly `'true'` AND the canonical service is
 * injected, the controller routes the send through the canonical cross-channel
 * dispatch front door
 * {@link ChannelMessageDispatchService.dispatch}(workspaceId, 'tiktok', …),
 * which resolves via the pure {@link ChannelDispatchRegistry} to
 * {@link TikTokDispatchAdapter}. That adapter returns the HONEST blocked result
 * (`{ success: false, blocked: true, blockedReason:
 * 'channel_tiktok_outbound_unsupported' }`) — NO API is invented, the platform
 * limitation is surfaced through the canonical registry path instead of the
 * ad-hoc service shape.
 *
 * DEFAULT OFF. When OFF — or when the canonical service is not injected
 * (`@Optional` slot empty) or the canonical dispatch throws — `sendMessage`
 * runs its EXISTING `tiktokInbox.sendMessage(...)` honest-pending path
 * byte-for-byte unchanged. The single env read short-circuits before any
 * canonical service is touched, so there is zero behavior change by default.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom.
 *
 * @see backend/src/marketing/tiktok-inbox.controller.ts
 * @see backend/src/marketing/channels/tiktok/tiktok-dispatch.adapter.ts
 * @see backend/src/marketing/channel-message-dispatch.service.ts
 */
export function isTikTokInboxCanonicalDispatchEnabled(): boolean {
  return process.env.KLOEL_TIKTOK_INBOX_CANONICAL_DISPATCH === 'true';
}
