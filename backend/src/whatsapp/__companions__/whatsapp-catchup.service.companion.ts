import type { WhatsAppProviderRegistry } from '../providers/provider-registry';
import type {
  WahaChatMessage,
  WahaChatSummary,
  WahaLidMapping,
} from '../providers/whatsapp-api.provider';

const D_RE = /\D/g;
const LID_RE = /@lid$/i;

export function normalizePhoneExt(phone: string): string {
  return String(phone || '')
    .replace(D_RE, '')
    .replace('@c.us', '')
    .replace('@s.whatsapp.net', '');
}
export function normalizeTimestampExt(value?: Date | string | number | null): Date | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = value > 1e12 ? value : value * 1000;
    const p = new Date(n);
    return Number.isNaN(p.getTime()) ? null : p;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const n = numeric > 1e12 ? numeric : numeric * 1000;
    const p = new Date(n);
    return Number.isNaN(p.getTime()) ? null : p;
  }
  const p = new Date(String(value));
  return Number.isNaN(p.getTime()) ? null : p;
}

export function normalizeJsonObjExt(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeOptionalText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

export function resolveTimestampExt(value: unknown): number {
  const val = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const vChat = val._chat as Record<string, unknown> | undefined;
  const vLm = val.lastMessage as Record<string, unknown> | undefined;
  const vLmd = vLm?._data as Record<string, unknown> | undefined;
  for (const c of [
    vChat?.conversationTimestamp,
    vChat?.lastMessageRecvTimestamp,
    vLm?.timestamp,
    vLmd?.messageTimestamp,
    val.conversationTimestamp,
    val.lastMessageRecvTimestamp,
    val.lastMessageSentTimestamp,
    val.timestamp,
    val.t,
    val.createdAt,
    val.lastMessageTimestamp,
    val.last_time,
  ]) {
    if (typeof c === 'number' && Number.isFinite(c)) return c > 1e12 ? c : c * 1000;
    if (typeof c === 'string') {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n > 1e12 ? n : n * 1000;
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
  }
  return 0;
}

export function resolveChatActivityTimestampExt(chat: WahaChatSummary): number {
  return Math.max(Number(chat.timestamp || 0) || 0, Number(chat.lastMessageTimestamp || 0) || 0);
}

export function isNowebStoreMisconfiguredExt(error: unknown): boolean {
  const msg = String(
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : normalizeOptionalText(error),
  ).toLowerCase();
  return (
    msg.includes('enable noweb store') ||
    msg.includes('config.noweb.store.enabled') ||
    msg.includes('config.noweb.store.full_sync') ||
    (msg.includes('noweb') &&
      msg.includes('store') &&
      (msg.includes('full_sync') || msg.includes('full sync')))
  );
}

export function expandComparablePhoneVariantsExt(phone: string): string[] {
  const digits = normalizePhoneExt(phone);
  if (!digits) return [];
  const variants = new Set<string>([digits]);
  if (digits.startsWith('55') && digits.length > 11) variants.add(digits.slice(2));
  if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11)
    variants.add(`55${digits}`);
  return Array.from(variants);
}

export function areEquivalentPhonesExt(left: string, right: string): boolean {
  const lv = expandComparablePhoneVariantsExt(left);
  const rv = expandComparablePhoneVariantsExt(right);
  return lv.some((c) => rv.includes(c));
}

export function resolveCanonicalChatIdExt(chatId: string, mappings: Map<string, string>): string {
  const n = String(chatId || '').trim();
  if (!n) return '';
  if (LID_RE.test(n)) {
    const m = mappings.get(n) || mappings.get(n.replace(LID_RE, '')) || '';
    if (m) return m;
  }
  return n;
}

export async function resolveCanonicalPhoneExt(
  deps: { providerRegistry: WhatsAppProviderRegistry },
  workspaceId: string,
  chatId: string,
  lidMapCacheMs: number,
  lidMapCache: Map<string, { expiresAt: number; mappings: Map<string, string> }>,
): Promise<string> {
  const n = String(chatId || '').trim();
  if (!n) return '';
  if (LID_RE.test(n)) {
    const mappings = await getLidPnMapExt(deps, workspaceId, lidMapCacheMs, lidMapCache);
    const m = mappings.get(n) || mappings.get(n.replace(LID_RE, '')) || '';
    if (m) return normalizePhoneExt(m);
  }
  return normalizePhoneExt(n);
}

export async function getLidPnMapExt(
  deps: { providerRegistry: WhatsAppProviderRegistry },
  workspaceId: string,
  cacheTtlMs: number,
  cache: Map<string, { expiresAt: number; mappings: Map<string, string> }>,
): Promise<Map<string, string>> {
  const cached = cache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) return cached.mappings;
  const raw = await deps.providerRegistry
    .listLidMappings(workspaceId)
    .catch(() => [] as WahaLidMapping[]);
  const normalized = new Map<string, string>();
  for (const m of raw) {
    const lid = String(m?.lid || '').trim();
    const pn = String(m?.pn || '').trim();
    if (!lid || !pn) continue;
    normalized.set(lid, pn);
    normalized.set(lid.replace(LID_RE, ''), pn);
  }
  cache.set(workspaceId, { expiresAt: Date.now() + cacheTtlMs, mappings: normalized });
  return normalized;
}

export function isWorkspaceSelfChatIdExt(
  chatId: string,
  selfPhone: string | null,
  selfIds: string[],
  mappings: Map<string, string>,
): boolean {
  const n = String(chatId || '').trim();
  if (selfIds.some((c) => String(c || '').trim() === n)) return true;
  if (!selfPhone) return false;
  const canonical = resolveCanonicalChatIdExt(n, mappings);
  return areEquivalentPhonesExt(normalizePhoneExt(canonical), selfPhone);
}

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

export function normalizeChatEntryExt(chatRaw: unknown): WahaChatSummary {
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
