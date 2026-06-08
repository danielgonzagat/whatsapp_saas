/**
 * Email message-class routing facade (design item: EMAIL routing decision —
 * bucket C).
 *
 * Email has TWO genuinely different outbound mechanisms, each already wired as
 * its own canonical {@link ChannelDispatchPort} adapter behind the
 * {@link ChannelDispatchRegistry}:
 *
 *   • CONNECTED-MAILBOX send (`ChannelKind.EMAIL` → {@link EmailDispatchAdapter})
 *     — Gmail / Microsoft / IMAP-SMTP, FROM the workspace's own address.
 *   • CAMPAIGN / PLATFORM send (`ChannelKind.EMAIL_TRANSACTIONAL` →
 *     {@link TransactionalEmailDispatchAdapter}) — Resend / SendGrid / env-SMTP
 *     from the platform sender (`noreply@kloel.com`).
 *
 * They cannot be merged without changing delivery behavior, so the canonical
 * policy is to KEEP both adapters and route BY MESSAGE CLASS to the correct
 * one. This module is the single, PURE place that encodes that mapping. It does
 * NOT send anything — it just builds the correct discriminated
 * {@link ChannelSendInput} so the caller can hand it to the existing
 * `ChannelDispatchRegistry.send()` front door, which routes to the right
 * adapter unchanged.
 *
 * The facade is flag-gated by {@link isEmailRoutingFacadeEnabled}
 * (`KLOEL_EMAIL_ROUTING_FACADE`, default OFF). When OFF, {@link routeEmail}
 * returns an honest blocked result instead of an input, so no caller can route
 * a live send through it. With no existing callers, flag-OFF is byte-identical
 * to today; the flag exists so a future opt-in caller starts SAFE-by-default.
 *
 * ADDITIVE: pure module, no DI, no provider knowledge, no existing dispatch
 * path changed.
 *
 * @cluster Marketing/Channels/Email
 * @see backend/src/marketing/channels/email/email-routing-facade.flag.ts
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 * @see docs/architecture/EMAIL_ROUTING.md
 */
import {
  ChannelKind,
  type ChannelSendInput,
  type ChannelSendResult,
  type EmailSendInput,
  type EmailTransactionalSendInput,
} from '../../../common/channel-dispatch/channel-dispatch.port';
import { isEmailRoutingFacadeEnabled } from './email-routing-facade.flag';

/**
 * The message class that selects the email delivery mechanism.
 *
 *   • `transactional` — 1:1 / reply / relationship mail that must come FROM the
 *     workspace's connected mailbox (Gmail / Microsoft / IMAP-SMTP). Routes to
 *     {@link ChannelKind.EMAIL}.
 *   • `campaign` — bulk / system / platform mail that must preserve the EXACT
 *     platform provider + sender identity, independent of any mailbox
 *     connection. Routes to {@link ChannelKind.EMAIL_TRANSACTIONAL}.
 *
 * The two literals are deliberately spelled from the CALLER's intent ("what
 * kind of message is this"), not the underlying provider, so the routing is a
 * business decision the caller makes, not a provider leak.
 */
export type EmailMessageClass = 'transactional' | 'campaign';

/** Canonical mapping of a message class to its dispatch channel kind. */
export const EMAIL_CLASS_TO_CHANNEL_KIND: Readonly<Record<EmailMessageClass, ChannelKind>> = {
  transactional: ChannelKind.EMAIL,
  campaign: ChannelKind.EMAIL_TRANSACTIONAL,
};

/**
 * Universal email fields accepted by the facade. The two adapters differ in
 * which fields are required (the connected-mailbox path treats `subject`/`html`
 * as optional; the platform path requires both), so the facade enforces the
 * stricter contract for the `campaign` class and surfaces an honest blocked
 * result when a required field is missing — never a silent send with empty
 * subject/body.
 */
export interface EmailRouteRequest {
  workspaceId: string;
  toEmail: string;
  subject?: string;
  html?: string;
  /** Connected-mailbox proactive flag (ignored by the platform path). */
  proactive?: boolean;
  /** Platform-path custom headers (ignored by the connected-mailbox path). */
  headers?: Record<string, string>;
}

/**
 * Resolve the canonical {@link ChannelKind} for an email message class.
 *
 * Pure and flag-independent — this is the routing TABLE, always honest about
 * which adapter a class belongs to. {@link routeEmail} layers the flag gate +
 * field validation on top.
 */
export function resolveEmailChannelKind(messageClass: EmailMessageClass): ChannelKind {
  return EMAIL_CLASS_TO_CHANNEL_KIND[messageClass];
}

/**
 * Build the discriminated {@link ChannelSendInput} for the connected-mailbox
 * (`ChannelKind.EMAIL`) path. Mirrors the optional-field shape the
 * {@link EmailDispatchAdapter} already accepts — no new requirement.
 */
function buildConnectedMailboxInput(req: EmailRouteRequest): EmailSendInput {
  const input: EmailSendInput = {
    channelKind: ChannelKind.EMAIL,
    workspaceId: req.workspaceId,
    toEmail: req.toEmail,
  };
  if (req.subject !== undefined) {
    input.subject = req.subject;
  }
  if (req.html !== undefined) {
    input.html = req.html;
  }
  if (req.proactive !== undefined) {
    input.proactive = req.proactive;
  }
  return input;
}

/**
 * Build the discriminated {@link ChannelSendInput} for the platform / campaign
 * (`ChannelKind.EMAIL_TRANSACTIONAL`) path. The platform adapter REQUIRES
 * `subject` + `html`, so the caller must have supplied them (enforced by
 * {@link routeEmail} before this is reached).
 */
function buildPlatformInput(
  req: EmailRouteRequest,
  subject: string,
  html: string,
): EmailTransactionalSendInput {
  const input: EmailTransactionalSendInput = {
    channelKind: ChannelKind.EMAIL_TRANSACTIONAL,
    workspaceId: req.workspaceId,
    toEmail: req.toEmail,
    subject,
    html,
  };
  if (req.headers !== undefined) {
    input.headers = req.headers;
  }
  return input;
}

/**
 * Route an email by message class to the correct existing dispatch input.
 *
 * Returns either a built {@link ChannelSendInput} (which the caller hands to
 * `ChannelDispatchRegistry.send()`), or — when the facade is flag-disabled or a
 * required field is missing — an honest blocked {@link ChannelSendResult}. The
 * discriminated return lets the caller branch without exceptions:
 *
 * ```ts
 * const routed = routeEmail('campaign', req);
 * if ('channelKind' in routed) {
 *   return registry.send(routed);
 * }
 * return routed; // blocked result, propagate as-is
 * ```
 *
 * This NEVER sends — it only selects the channel kind + builds the input — so
 * it introduces zero new delivery behavior. The flag gate makes it inert by
 * default.
 */
export function routeEmail(
  messageClass: EmailMessageClass,
  req: EmailRouteRequest,
): ChannelSendInput | ChannelSendResult {
  if (!isEmailRoutingFacadeEnabled()) {
    return {
      success: false,
      provider: 'email',
      error: 'email_routing_facade_disabled',
      blocked: true,
      blockedReason: 'email_routing_facade_disabled',
    };
  }

  if (!req.toEmail) {
    return {
      success: false,
      provider: 'email',
      error: 'recipient_required',
      blocked: true,
      blockedReason: 'recipient_required',
    };
  }

  if (messageClass === 'campaign') {
    const subject = req.subject ?? '';
    const html = req.html ?? '';
    if (subject === '' || html === '') {
      return {
        success: false,
        provider: 'email_transactional',
        error: 'subject_and_html_required',
        blocked: true,
        blockedReason: 'subject_and_html_required',
      };
    }
    return buildPlatformInput(req, subject, html);
  }

  return buildConnectedMailboxInput(req);
}
