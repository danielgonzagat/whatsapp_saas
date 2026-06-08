/**
 * Pure payload-builders and arg-coercion helpers for
 * {@link ChannelMessageDispatchService}.
 *
 * Extracted verbatim from `channel-message-dispatch.service.ts` to keep the
 * service class focused on orchestration (channel resolution + registry
 * delegation) while the per-channel discriminated-input construction lives
 * here as side-effect-free functions. Behavior is identical — the service
 * still owns the only `metaWhatsApp.resolveConnection` call and passes the
 * already-resolved connection projection into the Meta builders below.
 *
 * @cluster Marketing/Channels/Dispatch
 * @see backend/src/marketing/channel-message-dispatch.service.ts
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 */
import {
  ChannelKind,
  type ChannelSendInput,
} from '../common/channel-dispatch/channel-dispatch.port';

/**
 * Channel selector accepted by {@link ChannelMessageDispatchService.dispatch}.
 * Accepts either the canonical {@link ChannelKind} enum value or its raw
 * string form so HTTP/JSON callers don't need to import the enum.
 */
export type DispatchChannel = ChannelKind | string;

/**
 * Options carried through to the resolved channel adapter. The optional
 * credential overrides (`igAccountId`, `pageId`, `accessToken`,
 * `pageAccessToken`) let a caller bypass automatic Meta-connection resolution
 * when it already holds a token; when omitted they are resolved per-workspace.
 */
export interface DispatchOptions {
  // WhatsApp media / threading
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  quotedMessageId?: string;
  externalId?: string;
  complianceMode?: 'reactive' | 'proactive';
  forceDirect?: boolean;
  // Email
  subject?: string;
  html?: string;
  proactive?: boolean;
  // Meta credential overrides (auto-resolved per workspace when omitted)
  igAccountId?: string;
  pageId?: string;
  accessToken?: string;
  pageAccessToken?: string;
}

/**
 * Minimal projection of the resolved Meta connection consumed by the Meta
 * channel builders below. Structurally compatible with
 * `MetaWhatsAppService.resolveConnection`'s `ResolvedMetaConnection` so the
 * service can pass its resolved value straight through.
 */
export interface ResolvedMetaConnectionLike {
  accessToken: string;
  pageId: string | null;
  pageAccessToken: string | null;
  instagramAccountId: string | null;
}

/** Map a loose channel selector onto the canonical ChannelKind, or null. */
export function normalizeChannel(channel: DispatchChannel): ChannelKind | null {
  const raw = String(channel).trim().toLowerCase();
  switch (raw) {
    case 'whatsapp':
    case 'wa':
      return ChannelKind.WHATSAPP;
    case 'instagram':
    case 'ig':
      return ChannelKind.INSTAGRAM;
    case 'messenger':
      return ChannelKind.MESSENGER;
    case 'facebook':
    case 'fb':
      return ChannelKind.FACEBOOK;
    case 'email':
    case 'mail':
      return ChannelKind.EMAIL;
    case 'email_transactional':
    case 'email-transactional':
      return ChannelKind.EMAIL_TRANSACTIONAL;
    default:
      return null;
  }
}

export function buildWhatsApp(
  workspaceId: string,
  to: string,
  message: string,
  opts: DispatchOptions,
): ChannelSendInput {
  const input: ChannelSendInput = {
    channelKind: ChannelKind.WHATSAPP,
    workspaceId,
    to,
    message,
  };
  if (opts.mediaUrl !== undefined) {
    input.mediaUrl = opts.mediaUrl;
  }
  if (opts.mediaType !== undefined) {
    input.mediaType = opts.mediaType;
  }
  if (opts.caption !== undefined) {
    input.caption = opts.caption;
  }
  if (opts.quotedMessageId !== undefined) {
    input.quotedMessageId = opts.quotedMessageId;
  }
  if (opts.externalId !== undefined) {
    input.externalId = opts.externalId;
  }
  if (opts.complianceMode !== undefined) {
    input.complianceMode = opts.complianceMode;
  }
  if (opts.forceDirect !== undefined) {
    input.forceDirect = opts.forceDirect;
  }
  return input;
}

export function buildInstagram(
  workspaceId: string,
  to: string,
  message: string,
  opts: DispatchOptions,
  conn: ResolvedMetaConnectionLike,
): ChannelSendInput {
  const igAccountId = (opts.igAccountId || conn.instagramAccountId || '').trim();
  const accessToken = (opts.accessToken || conn.accessToken || '').trim();
  if (!accessToken) {
    throw new Error('meta_instagram_connection_required');
  }
  if (!igAccountId) {
    throw new Error('instagram_account_id_required');
  }
  return {
    channelKind: ChannelKind.INSTAGRAM,
    workspaceId,
    igAccountId,
    recipientId: to,
    text: message,
    accessToken,
  };
}

export function buildMessenger(
  workspaceId: string,
  to: string,
  message: string,
  opts: DispatchOptions,
  conn: ResolvedMetaConnectionLike,
): ChannelSendInput {
  const pageId = (opts.pageId || conn.pageId || '').trim();
  const pageAccessToken = (
    opts.pageAccessToken ||
    conn.pageAccessToken ||
    opts.accessToken ||
    conn.accessToken ||
    ''
  ).trim();
  if (!pageAccessToken) {
    throw new Error('meta_connection_required');
  }
  if (!pageId) {
    throw new Error('messenger_page_id_required');
  }
  const input: ChannelSendInput = {
    channelKind: ChannelKind.MESSENGER,
    workspaceId,
    pageId,
    recipientId: to,
    text: message,
    pageAccessToken,
  };
  if (opts.mediaUrl !== undefined) {
    input.mediaUrl = opts.mediaUrl;
  }
  if (opts.mediaType !== undefined) {
    input.mediaType = opts.mediaType;
  }
  return input;
}

export function buildFacebook(
  workspaceId: string,
  to: string,
  message: string,
  opts: DispatchOptions,
  conn: ResolvedMetaConnectionLike,
): ChannelSendInput {
  const pageId = (opts.pageId || conn.pageId || '').trim();
  const pageAccessToken = (
    opts.pageAccessToken ||
    conn.pageAccessToken ||
    opts.accessToken ||
    conn.accessToken ||
    ''
  ).trim();
  if (!pageAccessToken) {
    throw new Error('meta_connection_required');
  }
  if (!pageId) {
    throw new Error('facebook_page_id_required');
  }
  return {
    channelKind: ChannelKind.FACEBOOK,
    workspaceId,
    pageId,
    recipientPsid: to,
    text: message,
    pageAccessToken,
  };
}

export function buildEmail(
  workspaceId: string,
  to: string,
  message: string,
  opts: DispatchOptions,
): ChannelSendInput {
  const input: ChannelSendInput = {
    channelKind: ChannelKind.EMAIL,
    workspaceId,
    toEmail: to,
  };
  if (opts.subject !== undefined) {
    input.subject = opts.subject;
  }
  const html = opts.html ?? message;
  if (html !== undefined && html !== '') {
    input.html = html;
  }
  if (opts.proactive !== undefined) {
    input.proactive = opts.proactive;
  }
  return input;
}

/**
 * Build the discriminated input for the TRANSACTIONAL email channel
 * ({@link ChannelKind.EMAIL_TRANSACTIONAL}). Unlike {@link buildEmail} (which
 * routes through the workspace's connected mailbox), this targets the platform
 * transactional sender and so requires both a `subject` and an `html` body —
 * the message text is used as the html body when `opts.html` is absent.
 */
export function buildEmailTransactional(
  workspaceId: string,
  to: string,
  message: string,
  opts: DispatchOptions,
): ChannelSendInput {
  const html = opts.html ?? message;
  return {
    channelKind: ChannelKind.EMAIL_TRANSACTIONAL,
    workspaceId,
    toEmail: to,
    subject: opts.subject ?? '',
    html,
  };
}

/**
 * Coerce a loose tool-arg value to a trimmed string.
 *
 * Only primitive scalars (string/number/boolean) are stringified; objects,
 * arrays and null-ish values collapse to the empty string. This matches the
 * honest blocked-path semantics — a non-scalar `channel`/`to`/`message` is
 * never a valid value, so it must surface as a `*_required` block rather than
 * a `[object Object]` stringification.
 */
export function coerceArgString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return fallback;
}

/** Build {@link DispatchOptions} from loose tool args, dropping unset keys. */
export function extractOptions(args: Record<string, unknown>): DispatchOptions {
  const opts: DispatchOptions = {};
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v !== '' ? v : undefined;
  const subject = str(args.subject);
  if (subject !== undefined) {
    opts.subject = subject;
  }
  const html = str(args.html);
  if (html !== undefined) {
    opts.html = html;
  }
  const mediaUrl = str(args.mediaUrl);
  if (mediaUrl !== undefined) {
    opts.mediaUrl = mediaUrl;
  }
  const caption = str(args.caption);
  if (caption !== undefined) {
    opts.caption = caption;
  }
  const externalId = str(args.externalId);
  if (externalId !== undefined) {
    opts.externalId = externalId;
  }
  return opts;
}
