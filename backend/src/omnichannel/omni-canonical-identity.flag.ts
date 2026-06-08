/**
 * Feature flag for routing the omnichannel contact resolver through the
 * canonical cross-channel identity resolver (census P2-5).
 *
 * {@link OmnichannelContactResolutionService.resolveFromMessage} currently
 * resolves an inbound message to a contact via
 * {@link ChannelIdentifierService.resolve}, whose lookup is a single
 * `(workspaceId, channel, value)` unique match: it finds-or-creates by the
 * exact channel identifier and never reconciles the SAME human across two
 * channels. The canonical {@link ContactIdentityResolverService.resolve}
 * implements the cross-channel match — given a phone / email / social handle it
 * links a new channel identifier to the EXISTING contact (verified-identifier
 * match) instead of minting a duplicate contact.
 *
 * When this flag is set to `'true'`, `resolveFromMessage` DELEGATES the
 * find-or-create to `ContactIdentityResolverService.resolve`, deriving the
 * cross-channel match key from the channel (WHATSAPP→phone, EMAIL→email,
 * INSTAGRAM→socialHandle; MESSENGER/TIKTOK have no cross-channel basis so they
 * fall through to the exact-identifier path inside the canonical resolver). The
 * canonical result (ids only) is then materialised back into the
 * {@link ResolvedContact} shape that every existing caller consumes, via
 * {@link ChannelIdentifierService.findContactByChannel}, preserving the public
 * return contract.
 *
 * DEFAULT OFF. When OFF, `resolveFromMessage` runs its EXISTING
 * `channelIdentifier.resolve(...)` path byte-for-byte unchanged — the single
 * env read short-circuits before the canonical resolver is touched, so there is
 * zero behavior change and zero added latency on the inbound critical path. The
 * flag-ON path also degrades gracefully: if the canonical resolver is not
 * injected (`@Optional` slot empty), the legacy path runs unchanged.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_TRANSPORT_CANONICAL_DELEGATE`, `KLOEL_INSTAGRAM_RESOLVER_UNIFY`).
 *
 * @see backend/src/omnichannel/contact-resolution.service.ts
 * @see backend/src/contacts/contact-identity-resolver.service.ts
 * @see backend/src/contacts/channel-identifier.service.ts
 */
export function isOmniCanonicalIdentityEnabled(): boolean {
  return process.env.KLOEL_OMNI_CANONICAL_IDENTITY === 'true';
}
