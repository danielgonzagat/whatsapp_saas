/**
 * Feature flag for the Meta-connection resolver unification (census `channel-meta`,
 * MIGRATION_PLAYBOOK §channel-meta Stage 1).
 *
 * Several Instagram marketing reads resolve the per-workspace Meta connection by
 * issuing a raw workspace-scoped meta connection lookup for the Instagram channel
 * and then decrypting the token inline via the bespoke
 * {@link resolveInstagramConnection} helper — bypassing the canonical credential
 * resolver {@link MetaWhatsAppService.resolveConnection} that
 * `MetaWhatsAppService` and `ChannelMessageDispatchService` already use as the
 * single decrypt-once / expiry-once surface.
 *
 * When this flag is set to `'true'`, the two reads whose consumed fields
 * (`accessToken` + `instagramAccountId`) derive IDENTICALLY in both resolvers —
 * {@link InstagramMarketingService.publishPost} and
 * {@link InstagramMarketingService.getInsights} — route their credential read
 * through `resolveConnection(workspaceId, 'instagram')` instead of the raw
 * prisma query + inline decrypt. The `accessToken` derivation
 * (`decryptMetaToken(row.accessToken) || env.META_ACCESS_TOKEN`, trimmed) and
 * the `instagramAccountId` derivation (`row.instagramAccountId || null`) are
 * byte-equivalent between the two resolvers, so the flag-ON path is
 * behavior-preserving for these two callers — only the resolver ownership moves.
 *
 * The DM-send and conversation-list paths are intentionally NOT routed here:
 * they consume `pageAccessToken`, whose legacy derivation falls back to the
 * user access token (and trims) when the page token is empty, a semantic that
 * `resolveConnection` does NOT reproduce. Re-pointing those would alter
 * token-selection behavior, so they stay on the legacy helper (documented in
 * MIGRATION_PLAYBOOK §channel-meta as deferred / partial).
 *
 * DEFAULT OFF. When OFF, both callers run their EXISTING raw
 * workspace-scoped meta connection lookup + `resolveInstagramConnection(...)`
 * path byte-for-byte unchanged — the single env read short-circuits before any
 * canonical resolver is touched, so there is zero behavior change. The flag-ON
 * path also degrades gracefully: if the canonical resolver is not injected
 * (`@Optional` slot empty), the legacy path runs unchanged.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_INSTAGRAM_CANONICAL_DISPATCH`, `KLOEL_TRANSPORT_CANONICAL_DELEGATE`).
 *
 * @see backend/src/marketing/instagram/instagram-marketing.service.ts
 * @see backend/src/meta/meta-whatsapp.service.ts
 * @see backend/src/meta/meta-whatsapp.service.helpers.ts
 */
export function isInstagramResolverUnifyEnabled(): boolean {
  return process.env.KLOEL_INSTAGRAM_RESOLVER_UNIFY === 'true';
}
