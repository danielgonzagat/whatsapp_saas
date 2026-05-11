import type { WahaChatMessage, WahaChatSummary } from './providers/whatsapp-api.provider';
import { resolveTimestampExt } from './whatsapp-catchup.helpers';

function pickBooleanFromMe(
  lastMessage: Record<string, unknown> | null | undefined,
  lastMsgDataId: Record<string, unknown> | undefined,
  lastMsgId: Record<string, unknown> | undefined,
): boolean | null {
  if (typeof lastMessage?.fromMe === 'boolean') return lastMessage.fromMe;
  if (typeof lastMsgDataId?.fromMe === 'boolean') return lastMsgDataId.fromMe;
  if (typeof lastMsgId?.fromMe === 'boolean') return lastMsgId.fromMe;
  return null;
}

function resolvePreferredChatIdExt(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  const data = payload?._data as Record<string, unknown> | undefined;
  const dk = data?.key as Record<string, unknown> | undefined;
  const pk = payload?.key as Record<string, unknown> | undefined;
  const candidates = [
    dk?.remoteJidAlt,
    pk?.remoteJidAlt,
    payload?.remoteJidAlt,
    payload?.chatId,
    payload?.from,
    dk?.remoteJid,
    pk?.remoteJid,
    payload?.to,
  ]
    .filter((c) => typeof c === 'string')
    .map((c) => String(c).trim())
    .filter(Boolean);
  if (!candidates.length) return null;
  return candidates.find((c) => !c.includes('@lid')) || candidates[0] || null;
}

function normalizeChatEntryExt(chatRaw: unknown): WahaChatSummary {
  const chat = (chatRaw && typeof chatRaw === 'object' ? chatRaw : {}) as Record<string, unknown>;
  const chatIdObj = chat.id as Record<string, unknown> | string | undefined;
  const lm = chat.lastMessage as Record<string, unknown> | null | undefined;
  const lmd = lm?._data as Record<string, unknown> | undefined;
  const lmi = lm?.id as Record<string, unknown> | undefined;
  const cc = chat._chat as Record<string, unknown> | undefined;
  const contact = chat.contact as Record<string, unknown> | undefined;
  const lmdId = lmd?.id as Record<string, unknown> | undefined;
  const id =
    (typeof chatIdObj === 'object' && chatIdObj ? chatIdObj._serialized : undefined) ||
    chat.id ||
    chat.chatId ||
    chat.wid ||
    '';
  const lmt =
    Number(
      chat.lastMessageTimestamp ||
        lm?.timestamp ||
        lmd?.messageTimestamp ||
        chat.last_time ||
        cc?.conversationTimestamp ||
        0,
    ) || 0;
  const lmrt =
    Number(
      chat.lastMessageRecvTimestamp ||
        cc?.lastMessageRecvTimestamp ||
        lm?.timestamp ||
        lmd?.messageTimestamp ||
        cc?.conversationTimestamp ||
        0,
    ) || 0;
  return {
    id,
    unreadCount: Number(chat.unreadCount || chat.unread || 0) || 0,
    timestamp: resolveTimestampExt(chat),
    lastMessageTimestamp: lmt,
    lastMessageRecvTimestamp: lmrt,
    lastMessageFromMe: pickBooleanFromMe(lm, lmdId, lmi),
    name: chat.name || contact?.pushName || lmd?.verifiedBizName || null,
  } as WahaChatSummary;
}

export function normalizeChatsExt(raw: unknown): WahaChatSummary[] {
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
  return candidates.map((c) => normalizeChatEntryExt(c)).filter((c) => !!c.id);
}

export function normalizeMessagesExt(raw: unknown, fallbackChatId: string): WahaChatMessage[] {
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
  return candidates.map((mr: unknown) => {
    const m = (mr && typeof mr === 'object' ? mr : {}) as Record<string, unknown>;
    const mid = m.id as Record<string, unknown> | string | undefined;
    const mk = m.key as Record<string, unknown> | undefined;
    const mt = m.text as Record<string, unknown> | undefined;
    const mm = m.media as Record<string, unknown> | undefined;
    return {
      id:
        (typeof mid === 'object' && mid ? mid._serialized || mid.id : undefined) ||
        mk?.id ||
        m.id ||
        '',
      from: resolvePreferredChatIdExt(m) || m.from,
      to: m.to,
      fromMe: m.fromMe === true,
      body: m.body || mt?.body || '',
      type: m.type,
      hasMedia: m.hasMedia === true,
      mediaUrl: m.mediaUrl || mm?.url,
      mimetype: m.mimetype || mm?.mimetype,
      timestamp: resolveTimestampExt(m),
      chatId: resolvePreferredChatIdExt(m) || fallbackChatId,
      raw: m,
    } as WahaChatMessage;
  });
}
