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
  INTERNAL_PARTNERSHIP = 'internal-partnership',
  INTERNAL_ADMIN = 'internal-admin',
}

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

export interface InstagramSendInput {
  channelKind: ChannelKind.INSTAGRAM;
  workspaceId: string;
  igAccountId: string;
  recipientId: string;
  text: string;
  accessToken: string;
}

export interface MessengerSendInput {
  channelKind: ChannelKind.MESSENGER;
  workspaceId: string;
  pageId: string;
  recipientId: string;
  text: string;
  pageAccessToken: string;
  mediaUrl?: string;
  mediaType?: string;
}

export interface FacebookSendInput {
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

export interface InternalPartnershipSendInput {
  channelKind: ChannelKind.INTERNAL_PARTNERSHIP;
  partnerId: string;
  content: string;
  senderId: string;
  senderName: string;
}

export interface InternalAdminSendInput {
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
