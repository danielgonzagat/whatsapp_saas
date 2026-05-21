import type {
  NormalizedChat,
  NormalizedContact,
  ProviderMessageEnvelope,
} from './whatsapp-service.types';
import { normalizeNumber, resolveTimestampExt, toIsoTimestamp } from './whatsapp-service.helpers';
import { NON_DIGIT_RE } from '../common/phone';
import { readText } from '../common/utils';

function normalizeNumberLocal(num: string): string {
  return num.replace(NON_DIGIT_RE, '');
}

export function normalizeContactEntry(
  contact: unknown,
  deps: {
    isPlaceholder: (v: unknown, p?: string | null) => boolean;
    resolveName: (p: string, ...c: unknown[]) => string;
    extractPhone: (id: string) => string;
  },
): NormalizedContact | null {
  const c = contact as Record<string, unknown>;
  const cId = c?.id as Record<string, unknown> | string | undefined;
  const cWid = c?.wid as Record<string, unknown> | string | undefined;
  const rawId = readText(
    [
      typeof cId === 'object' ? cId?._serialized : undefined,
      c?.id,
      typeof cWid === 'object' ? cWid?._serialized : undefined,
      c?.wid,
      c?.chatId,
    ].find((v) => typeof v === 'string' && v.trim()) ?? '',
  );
  const pc = [
    c?.phone,
    c?.number,
    typeof cId === 'object' ? cId?.user : undefined,
    typeof cWid === 'object' ? cWid?.user : undefined,
  ].find((v) => typeof v === 'string' && v.trim());
  const phone = normalizeNumber(typeof pc === 'string' ? pc : deps.extractPhone(rawId));
  if (!phone) {
    return null;
  }
  const pushNameRaw = c?.pushName || c?.pushname;
  const pushName = typeof pushNameRaw === 'string' && pushNameRaw.trim() ? pushNameRaw : null;
  return {
    id: rawId || `${phone}@c.us`,
    phone,
    name: deps.resolveName(phone, c?.pushName, c?.pushname, c?.name, c?.shortName) || null,
    pushName: deps.isPlaceholder(pushName, phone) ? null : pushName,
    shortName: typeof c?.shortName === 'string' ? c.shortName : null,
    email: null,
    localContactId: null,
    source: 'provider',
    registered: true,
    createdAt: null,
    updatedAt: null,
  };
}

export function normalizeChatEntry(
  chatRaw: unknown,
  deps: {
    resolveName: (p: string, ...c: unknown[]) => string;
    extractPhone: (id: string) => string;
    isPlaceholder: (v: unknown, p?: string | null) => boolean;
  },
): NormalizedChat | null {
  const chat = chatRaw as Record<string, unknown>;
  const chatId = chat?.id as Record<string, unknown> | string | undefined;
  const chatContact = chat?.contact as Record<string, unknown> | undefined;
  const chatLm = chat?.lastMessage as Record<string, unknown> | undefined;
  const chatLmd = chatLm?._data as Record<string, unknown> | undefined;
  const rawId = readText(
    [
      typeof chatId === 'object' ? chatId?._serialized : undefined,
      chat?.id,
      chat?.chatId,
      chat?.wid,
    ].find((v) => typeof v === 'string' && v.trim()) ?? '',
  );
  const phone = normalizeNumberLocal(
    typeof chat?.phone === 'string' ? chat.phone : deps.extractPhone(rawId),
  );
  if (!rawId || !phone) {
    return null;
  }
  const timestamp = resolveTimestampExt(chat);
  const ur = Number(chat?.unreadCount || chat?.unread || 0) || 0;
  return {
    id: rawId,
    phone,
    name:
      deps.resolveName(
        phone,
        chat?.name,
        chat?.pushName,
        chatContact?.name,
        chatContact?.pushName,
        chatLmd?.verifiedBizName,
      ) || null,
    unreadCount: ur,
    pending: ur > 0 || chatLm?.fromMe === false,
    timestamp,
    lastMessageAt: toIsoTimestamp(timestamp),
    conversationId: null,
    status: null,
    source: 'provider',
  };
}

export function normalizeMessageEntry(
  msgRaw: unknown,
  fallbackChatId: string,
  deps: { extractPhone: (id: string) => string },
): ProviderMessageEnvelope | null {
  const message = msgRaw as Record<string, unknown>;
  const mId = message?.id as Record<string, unknown> | string | undefined;
  const mKey = message?.key as Record<string, unknown> | undefined;
  const mText = message?.text as Record<string, unknown> | undefined;
  const mMedia = message?.media as Record<string, unknown> | undefined;
  const id = readText(
    [
      typeof mId === 'object' ? (mId?._serialized ?? mId?.id) : undefined,
      mKey?.id,
      message?.id,
    ].find((v) => typeof v === 'string' && v.trim()) ?? '',
  );
  const chatId = readText(
    [message?.chatId, message?.from, message?.to].find((v) => typeof v === 'string' && v.trim()) ??
      fallbackChatId,
  );
  if (!id || !chatId) {
    return null;
  }
  const phone = normalizeNumberLocal(
    typeof message?.phone === 'string' ? message.phone : deps.extractPhone(chatId),
  );
  const ts = resolveTimestampExt(message);
  const fm = message?.fromMe === true;
  return {
    id,
    chatId,
    phone,
    body: readText(message?.body || mText?.body || ''),
    direction: fm ? 'OUTBOUND' : 'INBOUND',
    fromMe: fm,
    type: (typeof message?.type === 'string' ? message.type : 'chat').toLowerCase(),
    hasMedia: message?.hasMedia === true,
    mediaUrl: readText(message?.mediaUrl || mMedia?.url || '') || null,
    mimetype: readText(message?.mimetype || mMedia?.mimetype || '') || null,
    timestamp: ts,
    isoTimestamp: toIsoTimestamp(ts),
    source: 'provider',
  };
}
