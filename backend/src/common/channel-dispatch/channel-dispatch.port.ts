/**
 * ChannelDispatchPort — canonical dispatch contract for all outbound channels.
 *
 * Every channel-send MUST follow this contract. Per-channel adapter
 * implementations remain free but the port is the single entry point
 * for higher-order services (brain, autopilot, flow engine, billing,
 * campaigns, admin-chat, public-api).
 *
 * Architectural Semantic Canonicalization — Wave 21.
 */

// ─── Channel kind discriminator ──────────────────────────────

export enum ChannelKind {
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  MESSENGER = 'messenger',
  FACEBOOK = 'facebook',
  EMAIL = 'email',
  EMAIL_TRANSACTIONAL = 'email_transactional',
  TIKTOK = 'tiktok',
  INTERNAL_PARTNERSHIP = 'internal-partnership',
  INTERNAL_ADMIN = 'internal-admin',
}

/**
 * Canonical lowercase channel-name union, derived from {@link ChannelKind}.
 *
 * This is the ONE source of truth for the string form of a channel. Other
 * historical aliases (`kloel/channel-transport.types#ChannelName`,
 * `kloel/channel/types#ChannelKind`, `inbox/omnichannel.helpers#OmniChannel`)
 * are being collapsed onto this type — see ADR-0012 OmniCore Wave W1 §
 * Canonicalization. Use `ChannelKind` (the enum) inside dispatch code and this
 * `CanonicalChannelName` only where a raw string discriminator is required
 * (HTTP/JSON boundaries, persisted `channel` columns).
 */
export type CanonicalChannelName = `${ChannelKind}`;

/**
 * The outbound-capable subset of {@link ChannelKind} — the channels a caller
 * can actually `dispatch` a message to. Internal-admin is a copilot surface,
 * not a channel-send (R5 of SEND_MESSAGE_CANONICAL.md).
 */
export type OutboundChannelKind = Exclude<ChannelKind, ChannelKind.INTERNAL_ADMIN>;

// ─── Channel-specific input shapes (discriminated union) ────

export interface WhatsAppSendInput {
  channelKind: ChannelKind.WHATSAPP;
  workspaceId: string;
  to: string;
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  quotedMessageId?: string;
  externalId?: string;
  complianceMode?: 'reactive' | 'proactive';
  forceDirect?: boolean;
}

interface InstagramSendInput {
  channelKind: ChannelKind.INSTAGRAM;
  workspaceId: string;
  igAccountId: string;
  recipientId: string;
  text: string;
  accessToken: string;
}

interface MessengerSendInput {
  channelKind: ChannelKind.MESSENGER;
  workspaceId: string;
  pageId: string;
  recipientId: string;
  text: string;
  pageAccessToken: string;
  mediaUrl?: string;
  mediaType?: string;
}

interface FacebookSendInput {
  channelKind: ChannelKind.FACEBOOK;
  workspaceId: string;
  pageId: string;
  recipientPsid: string;
  text: string;
  pageAccessToken: string;
}

export interface EmailSendInput {
  channelKind: ChannelKind.EMAIL;
  workspaceId: string;
  toEmail: string;
  subject?: string;
  html?: string;
  proactive?: boolean;
}

/**
 * Transactional email outbound input. Unlike {@link EmailSendInput} (which
 * routes through the workspace's CONNECTED mailbox — Gmail/Microsoft/IMAP),
 * this kind routes through the platform's transactional sender
 * (`AuthEmailService.sendEmail` → Resend/SendGrid/env-SMTP from
 * `noreply@kloel.com`). It is the canonical path for campaign / system mail
 * that must preserve the EXACT provider + sender identity, independent of
 * whether the workspace has connected a personal mailbox.
 *
 * The shape mirrors `EmailSendInput` but uses a distinct discriminant
 * (`ChannelKind.EMAIL_TRANSACTIONAL`) so the registry routes it to the
 * transactional adapter without colliding with the connected-mailbox adapter.
 */
export interface EmailTransactionalSendInput {
  channelKind: ChannelKind.EMAIL_TRANSACTIONAL;
  workspaceId: string;
  toEmail: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

/**
 * TikTok outbound input. TikTok Business Messaging has NO programmatic
 * outbound-send API today (inbound webhook only), so the adapter resolves
 * this to an honest blocked result. The shape is defined now so the canonical
 * union is complete and a future Ads/DM API adapter is a drop-in swap.
 */
export interface TikTokSendInput {
  channelKind: ChannelKind.TIKTOK;
  workspaceId: string;
  to: string;
  message: string;
}

export interface InternalPartnershipSendInput {
  channelKind: ChannelKind.INTERNAL_PARTNERSHIP;
  partnerId: string;
  content: string;
  senderId: string;
  senderName: string;
}

interface InternalAdminSendInput {
  channelKind: ChannelKind.INTERNAL_ADMIN;
  adminUserId: string;
  adminRole: string;
  sessionId: string | null;
  content: string;
}

export type ChannelSendInput =
  | WhatsAppSendInput
  | InstagramSendInput
  | MessengerSendInput
  | FacebookSendInput
  | EmailSendInput
  | EmailTransactionalSendInput
  | TikTokSendInput
  | InternalPartnershipSendInput
  | InternalAdminSendInput;

// ─── Common result ─────────────────────────────────────────

export interface ChannelSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  blocked?: boolean;
  blockedReason?: string;
  queued?: boolean;
  delivery?: 'direct' | 'queued';
  externalId?: string;
  provider?: string;
}

// ─── Port interface ────────────────────────────────────────

/**
 * Canonical dispatch port.
 *
 * Every channel adapter implements this contract.
 * Higher-order services call `send(input)` with a
 * discriminated ChannelSendInput; the registry resolves
 * the correct adapter by `input.channelKind`.
 */
export interface ChannelDispatchPort {
  readonly channelKind: ChannelKind;

  /** Send a message through the channel. */
  send(input: ChannelSendInput): Promise<ChannelSendResult>;

  /**
   * Canonical alias of {@link send} (Wave 21 unification — task d). Optional so
   * existing adapters that only define `send` keep compiling; the registry
   * exposes a `sendMessage` that falls back to `send` when an adapter has not
   * yet defined this alias. New adapters SHOULD implement it as a thin
   * delegation to `send`.
   */
  sendMessage?(input: ChannelSendInput): Promise<ChannelSendResult>;

  /** Check whether the channel adapter is configured and ready. */
  isConfigured?(): boolean;

  /** Get the channel's current capability (available / blocked / required setup). */
  capability?(workspaceId: string): Promise<ChannelCapability>;
}

// ─── Channel capability shape ──────────────────────────────

export interface ChannelCapability {
  channel: ChannelKind;
  sendAvailable: boolean;
  sendBlockedReason: string | null;
  requiredSetup: string[];
}
