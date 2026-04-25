/**
 * Helpers extracted from OmnichannelService to keep complexity and file size
 * within Codacy thresholds. Pure functions only — no I/O, no DI dependencies.
 */

/** A single attachment received from any normalized inbound channel. */
export interface MessageAttachment {
  url?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  base64?: string;
}

/** Identifier for a message attachment after persistence. */
export interface ProcessedAttachment {
  url: string;
  mimeType: string;
  name: string;
  size?: number;
}

/** Channel discriminator for normalized messages. */
export type OmniChannel = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'EMAIL';

/** A normalized inbound message — the canonical input across adapters. */
export interface NormalizedMessage {
  workspaceId: string;
  channel: OmniChannel;
  externalId: string;
  /** Phone, username or email depending on the channel. */
  from: string;
  fromName?: string;
  content: string;
  attachments?: MessageAttachment[];
  metadata?: Record<string, unknown>;
}

const INSTAGRAM_ATTACHMENT_MIME: Record<string, string> = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/mp4',
};

const MIME_TYPE_TO_MESSAGE_TYPE: Record<string, string> = {
  'image/': 'IMAGE',
  'video/': 'VIDEO',
  'audio/': 'AUDIO',
};

/** Coerce any value into an Error — prevents `unknown` leaking from catch blocks. */
export function ensureError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'unknown error');
}

/** Resolve the channel-specific identifier used as the conversation key. */
export function extractIdentifier(msg: NormalizedMessage): string {
  if (msg.channel === 'WHATSAPP' || msg.channel === 'EMAIL') {
    return msg.from;
  }
  if (msg.channel === 'INSTAGRAM') {
    return `ig:${msg.externalId || msg.from}`;
  }
  if (msg.channel === 'MESSENGER') {
    return `fb:${msg.externalId || msg.from}`;
  }
  return msg.from || msg.externalId || 'unknown';
}

/** Determine inbox message type (TEXT/IMAGE/VIDEO/AUDIO/DOCUMENT) from attachments. */
export function determineMessageType(msg: NormalizedMessage): string {
  if (!msg.attachments || msg.attachments.length === 0) {
    return 'TEXT';
  }
  const mimeType = (msg.attachments[0].mimeType || '').toLowerCase();
  for (const [pattern, type] of Object.entries(MIME_TYPE_TO_MESSAGE_TYPE)) {
    if (mimeType.startsWith(pattern)) {
      return type;
    }
  }
  if (mimeType.includes('pdf') || mimeType.includes('document')) {
    return 'DOCUMENT';
  }
  return 'TEXT';
}

/** Build the visible content for a message that has attachments but no text. */
export function buildAttachmentContent(
  rawContent: string,
  messageType: string,
  processed: ProcessedAttachment[],
): string {
  if (processed.length > 0 && !rawContent) {
    return `[${messageType}] ${processed[0].name || 'arquivo'}`;
  }
  return rawContent || '';
}

/** Build a ProcessedAttachment from an attachment + a resolved storage URL. */
export function buildProcessedAttachment(
  url: string,
  attachment: MessageAttachment,
): ProcessedAttachment {
  return {
    url,
    mimeType: attachment.mimeType || 'application/octet-stream',
    name: attachment.name || 'attachment',
    size: attachment.size,
  };
}

/** Map an Instagram attachment type (image/video/audio) to a MIME type. */
export function instagramAttachmentMimeType(attType: string): string {
  return INSTAGRAM_ATTACHMENT_MIME[attType] || 'application/octet-stream';
}

interface InstagramRawAttachment {
  type?: string;
  payload?: { url?: string };
}

/** Convert raw Instagram attachments into the normalized MessageAttachment shape. */
export function mapInstagramAttachments(
  raw: InstagramRawAttachment[] | undefined,
): MessageAttachment[] {
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  const out: MessageAttachment[] = [];
  for (const att of raw) {
    const url = att.payload?.url;
    if (!url) {
      continue;
    }
    const attType = att.type || 'file';
    out.push({
      url,
      mimeType: instagramAttachmentMimeType(attType),
      name: `instagram_${attType}_${Date.now()}`,
    });
  }
  return out;
}

interface InstagramMessaging {
  sender?: { id?: string; name?: string };
  message?: {
    text?: string;
    attachments?: InstagramRawAttachment[];
    reply_to?: { story?: { url?: string } };
    story_mention?: unknown;
    mid?: string;
  };
  reaction?: { reaction?: string };
  timestamp?: number;
}

/** Decoded Instagram messaging entry — extracted before normalization. */
export interface InstagramExtraction {
  senderId: string;
  senderName?: string;
  content: string;
  attachments: MessageAttachment[];
  messageId?: string;
  timestamp?: number;
}

function applyStoryReply(
  messaging: InstagramMessaging,
  content: string,
  attachments: MessageAttachment[],
): string {
  const storyUrl = messaging.message?.reply_to?.story?.url;
  if (!messaging.message?.reply_to?.story) {
    return content;
  }
  if (storyUrl) {
    attachments.push({
      url: storyUrl,
      mimeType: 'image/jpeg',
      name: 'story_reply',
    });
  }
  return `[Resposta ao Story] ${content}`;
}

/** Pull all Instagram-specific signals out of a webhook messaging entry. */
export function extractInstagramMessage(messaging: InstagramMessaging): InstagramExtraction {
  const senderId = messaging.sender?.id || 'unknown';
  const senderName = messaging.sender?.name;
  const attachments: MessageAttachment[] = [];
  let content = '';
  if (messaging.message?.text) {
    content = messaging.message.text;
  }
  attachments.push(...mapInstagramAttachments(messaging.message?.attachments));
  content = applyStoryReply(messaging, content, attachments);
  if (messaging.reaction) {
    content = `[Reação: ${messaging.reaction.reaction}]`;
  }
  if (messaging.message?.story_mention) {
    content = `[Mencionou você em um Story]`;
  }
  return {
    senderId,
    senderName,
    content,
    attachments,
    messageId: messaging.message?.mid,
    timestamp: messaging.timestamp,
  };
}

interface InstagramWebhookPayload {
  entry?: Array<{ messaging?: InstagramMessaging[] }>;
}

/** Read the first messaging entry from an Instagram webhook payload, if present. */
export function firstInstagramMessaging(
  payload: Record<string, unknown> | undefined,
): InstagramMessaging | undefined {
  const typed = payload as InstagramWebhookPayload | undefined;
  return typed?.entry?.[0]?.messaging?.[0];
}
