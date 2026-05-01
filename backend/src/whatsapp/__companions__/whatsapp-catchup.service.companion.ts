import type { WahaChatMessage, WahaChatSummary } from '../providers/whatsapp-api.provider';
import { InboundMessage } from '../inbound-processor.service';

const D_RE = /\D/g;

export function normalizePhone(phone: string): string {
  return String(phone || '')
    .replace(D_RE, '')
    .replace('@c.us', '')
    .replace('@s.whatsapp.net', '');
}

export function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}

export function normalizeOptionalText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

export function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

const D__D_S____S_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;

export function isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return true;
  }

  const lowered = normalized.toLowerCase();
  const phoneDigits = normalizePhone(String(phone || ''));

  if (lowered === 'doe' || lowered === 'unknown' || lowered === 'desconhecido') {
    return true;
  }

  if (D__D_S____S_DOE_RE.test(normalized)) {
    return true;
  }

  if (phoneDigits && lowered === `${phoneDigits} doe`) {
    return true;
  }

  if (phoneDigits && normalizePhone(normalized) === phoneDigits) {
    return true;
  }

  return false;
}

// PULSE_OK: validates every new Date(input) with Number.isNaN(parsed.getTime()) — returns null on invalid
export function normalizeTimestamp(value?: Date | string | number | null): Date | null {
  if (!value && value !== 0) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = value > 1e12 ? value : value * 1000;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const normalized = numeric > 1e12 ? numeric : numeric * 1000;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// PULSE_OK: resolves timestamps safely — numeric paths return parsed milliseconds,
// string path validates with isNaN before returning
export function resolveTimestamp(value: unknown): number {
  const val = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const valChat = val._chat as Record<string, unknown> | undefined;
  const valLastMessage = val.lastMessage as Record<string, unknown> | undefined;
  const valLastMsgData = valLastMessage?._data as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    valChat?.conversationTimestamp,
    valChat?.lastMessageRecvTimestamp,
    valLastMessage?.timestamp,
    valLastMsgData?.messageTimestamp,
    val.conversationTimestamp,
    val.lastMessageRecvTimestamp,
    val.lastMessageSentTimestamp,
    val.timestamp,
    val.t,
    val.createdAt,
    val.lastMessageTimestamp,
    val.last_time,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate > 1e12 ? candidate : candidate * 1000;
    }
    if (typeof candidate === 'string') {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > 1e12 ? numeric : numeric * 1000;
      }
      const date = new Date(candidate);
      if (!Number.isNaN(date.getTime())) {
        return date.getTime();
      }
    }
  }

  return 0;
}

export function resolveChatActivityTimestamp(chat: WahaChatSummary): number {
  return Math.max(Number(chat.timestamp || 0) || 0, Number(chat.lastMessageTimestamp || 0) || 0);
}

export function isRemoteChatAwaitingReply(chat: WahaChatSummary): boolean {
  return chat.lastMessageFromMe === false;
}

export function pickBooleanFromMe(
  lastMessage: Record<string, unknown> | null | undefined,
  lastMsgDataId: Record<string, unknown> | undefined,
  lastMsgId: Record<string, unknown> | undefined,
): boolean | null {
  if (typeof lastMessage?.fromMe === 'boolean') {
    return lastMessage.fromMe;
  }
  if (typeof lastMsgDataId?.fromMe === 'boolean') {
    return lastMsgDataId.fromMe;
  }
  if (typeof lastMsgId?.fromMe === 'boolean') {
    return lastMsgId.fromMe;
  }
  return null;
}

export function normalizeChats(raw: unknown): WahaChatSummary[] {
  const rawObj = raw as Record<string, unknown> | unknown[] | null;
  const candidates: unknown[] = Array.isArray(rawObj)
    ? rawObj
    : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.chats)
      ? (rawObj.chats as unknown[])
      : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.items)
        ? (rawObj.items as unknown[])
        : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.data)
          ? (rawObj.data as unknown[])
          : [];

  return candidates
    .map((chatRaw: unknown) => normalizeChatEntry(chatRaw))
    .filter((chat) => !!chat.id);
}

export function normalizeChatEntry(chatRaw: unknown): WahaChatSummary {
  const chat = (chatRaw && typeof chatRaw === 'object' ? chatRaw : {}) as Record<string, unknown>;
  const chatIdObj = chat.id as Record<string, unknown> | string | undefined;
  const lastMessage = chat.lastMessage as Record<string, unknown> | null | undefined;
  const lastMsgData = lastMessage?._data as Record<string, unknown> | undefined;
  const lastMsgId = lastMessage?.id as Record<string, unknown> | undefined;
  const chatChat = chat._chat as Record<string, unknown> | undefined;
  const contact = chat.contact as Record<string, unknown> | undefined;
  const lastMsgDataId = lastMsgData?.id as Record<string, unknown> | undefined;

  const id =
    (typeof chatIdObj === 'object' && chatIdObj ? chatIdObj._serialized : undefined) ||
    chat.id ||
    chat.chatId ||
    chat.wid ||
    '';

  const lastMessageTimestamp =
    Number(
      chat.lastMessageTimestamp ||
        lastMessage?.timestamp ||
        lastMsgData?.messageTimestamp ||
        chat.last_time ||
        chatChat?.conversationTimestamp ||
        0,
    ) || 0;

  const lastMessageRecvTimestamp =
    Number(
      chat.lastMessageRecvTimestamp ||
        chatChat?.lastMessageRecvTimestamp ||
        lastMessage?.timestamp ||
        lastMsgData?.messageTimestamp ||
        chatChat?.conversationTimestamp ||
        0,
    ) || 0;

  return {
    id,
    unreadCount: Number(chat.unreadCount || chat.unread || 0) || 0,
    timestamp: resolveTimestamp(chat),
    lastMessageTimestamp,
    lastMessageRecvTimestamp,
    lastMessageFromMe: pickBooleanFromMe(lastMessage, lastMsgDataId, lastMsgId),
    name: chat.name || contact?.pushName || lastMsgData?.verifiedBizName || null,
  } as WahaChatSummary;
}

export function normalizeMessages(raw: unknown, fallbackChatId: string): WahaChatMessage[] {
  const rawObj = raw as Record<string, unknown> | unknown[] | null;
  const candidates: unknown[] = Array.isArray(rawObj)
    ? rawObj
    : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.messages)
      ? (rawObj.messages as unknown[])
      : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.items)
        ? (rawObj.items as unknown[])
        : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.data)
          ? (rawObj.data as unknown[])
          : [];

  return candidates.map((messageRaw: unknown) => {
    const message = (messageRaw && typeof messageRaw === 'object' ? messageRaw : {}) as Record<
      string,
      unknown
    >;
    const msgId = message.id as Record<string, unknown> | string | undefined;
    const msgKey = message.key as Record<string, unknown> | undefined;
    const msgText = message.text as Record<string, unknown> | undefined;
    const msgMedia = message.media as Record<string, unknown> | undefined;
    return {
      id:
        (typeof msgId === 'object' && msgId ? msgId._serialized || msgId.id : undefined) ||
        msgKey?.id ||
        message.id ||
        '',
      from: resolvePreferredChatId(message) || message.from,
      to: message.to,
      fromMe: message.fromMe === true,
      body: message.body || msgText?.body || '',
      type: message.type,
      hasMedia: message.hasMedia === true,
      mediaUrl: message.mediaUrl || msgMedia?.url,
      mimetype: message.mimetype || msgMedia?.mimetype,
      timestamp: resolveTimestamp(message),
      chatId: resolvePreferredChatId(message) || fallbackChatId,
      raw: message,
    } as WahaChatMessage;
  });
}

function resolvePreferredChatId(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  const data = payload?._data as Record<string, unknown> | undefined;
  const dataKey = data?.key as Record<string, unknown> | undefined;
  const payloadKey = payload?.key as Record<string, unknown> | undefined;
  const candidates = [
    dataKey?.remoteJidAlt,
    payloadKey?.remoteJidAlt,
    payload?.remoteJidAlt,
    payload?.chatId,
    payload?.from,
    dataKey?.remoteJid,
    payloadKey?.remoteJid,
    payload?.to,
  ]
    .filter((candidate) => typeof candidate === 'string')
    .map((candidate) => String(candidate).trim())
    .filter(Boolean);

  if (!candidates.length) {
    return null;
  }

  return candidates.find((candidate) => !candidate.includes('@lid')) || candidates[0] || null;
}

export function extractSenderName(
  payload: Record<string, unknown> | null | undefined,
): string | undefined {
  const data = payload?._data as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    data?.pushName,
    payload?.pushName,
    data?.notifyName,
    payload?.notifyName,
    payload?.author,
    payload?.senderName,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const normalized = candidate.trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

export function mapInboundType(type?: string): InboundMessage['type'] {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'chat' || normalized === 'text') {
    return 'text';
  }
  if (normalized === 'audio' || normalized === 'ptt') {
    return 'audio';
  }
  if (normalized === 'image') {
    return 'image';
  }
  if (normalized === 'document') {
    return 'document';
  }
  if (normalized === 'video') {
    return 'video';
  }
  if (normalized === 'sticker') {
    return 'sticker';
  }
  return 'unknown';
}

export function toInboundMessage(
  workspaceId: string,
  message: WahaChatMessage,
  provider: InboundMessage['provider'] = 'meta-cloud',
): InboundMessage | null {
  const providerMessageId = String(message.id || '').trim();
  const from = String(message.from || message.chatId || '').trim();

  if (!providerMessageId || !from) {
    return null;
  }

  return {
    workspaceId,
    provider,
    ingestMode: 'catchup',
    createdAt: normalizeTimestamp(message.timestamp),
    providerMessageId,
    from,
    to: message.to,
    senderName: extractSenderName(message.raw),
    type: mapInboundType(message.type),
    text: message.body,
    mediaUrl: message.mediaUrl,
    mediaMime: message.mimetype,
    raw: message.raw,
  };
}

export function resolveRemoteContactName(
  chat: WahaChatSummary,
  extractPhoneFromChatId: (chatId: string) => string,
): string {
  const fallbackPhone = normalizePhone(extractPhoneFromChatId(chat?.id || ''));
  const candidates = [
    chat?.name,
    chat?.contact?.pushName,
    chat?.contact?.name,
    chat?.pushName,
    chat?.notifyName,
    chat?.lastMessage?._data?.notifyName,
    chat?.lastMessage?._data?.verifiedBizName,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized && !isPlaceholderContactName(normalized, fallbackPhone)) {
      return normalized;
    }
  }

  return '';
}
