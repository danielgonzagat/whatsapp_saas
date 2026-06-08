/**
 * Feature flag for the EMAIL message-class routing facade (design item:
 * EMAIL routing decision — bucket C).
 *
 * Email has TWO genuinely different outbound mechanisms, each already wired as
 * its own canonical {@link ChannelDispatchPort} adapter behind the
 * {@link ChannelDispatchRegistry}:
 *
 *   • CONNECTED-MAILBOX send — {@link EmailDispatchAdapter}
 *     (`ChannelKind.EMAIL`) routes through the workspace's connected mailbox
 *     (Gmail / Microsoft / IMAP-SMTP). 1:1 / transactional / reply mail that
 *     must come FROM the workspace's own address.
 *
 *   • CAMPAIGN / PLATFORM send — {@link TransactionalEmailDispatchAdapter}
 *     (`ChannelKind.EMAIL_TRANSACTIONAL`) routes through the platform
 *     transactional sender (`EmailService.sendEmail` → Resend / SendGrid /
 *     env-SMTP from `noreply@kloel.com`). Bulk / system mail with a stable
 *     provider + sender identity, independent of any mailbox connection.
 *
 * These two paths CANNOT be merged without changing delivery behavior (sender
 * identity + provider differ), so the canonical resolution is to KEEP both
 * adapters and route BY MESSAGE CLASS to the correct one. See
 * `docs/architecture/EMAIL_ROUTING.md` for the full policy.
 *
 * When this flag is `'true'`, the pure {@link resolveEmailChannelKind} routing
 * facade is ACTIVE: callers that opt in get a single
 * `(messageClass, ...) → ChannelSendInput` front door that picks the correct
 * existing adapter. When OFF (default), the facade resolves to a blocked
 * result, so no live send path is altered. The facade has NO existing callers,
 * so flag-OFF is byte-identical to today regardless.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_TRANSPORT_CANONICAL_DELEGATE`, `KLOEL_MINDMEMORY_DUALWRITE`).
 *
 * @see backend/src/marketing/channels/email/email-routing.ts
 * @see backend/src/marketing/channels/email/email-dispatch.adapter.ts
 * @see backend/src/marketing/channels/email/transactional-email-dispatch.adapter.ts
 * @see docs/architecture/EMAIL_ROUTING.md
 */
export function isEmailRoutingFacadeEnabled(): boolean {
  return process.env.KLOEL_EMAIL_ROUTING_FACADE === 'true';
}
