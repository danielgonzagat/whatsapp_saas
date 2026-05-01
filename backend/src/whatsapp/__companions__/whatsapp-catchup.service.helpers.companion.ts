const LID_RE = /@lid$/i;
import {
  normalizePhone,
  normalizeOptionalText,
  safeStr,
  normalizeTimestamp,
} from './whatsapp-catchup.service.companion';
import type { WahaLidMapping } from '../providers/whatsapp-api.provider';
import type { WhatsAppProviderRegistry } from '../providers/provider-registry';

export function expandComparablePhoneVariants(phone: string): string[] {
  const digits = normalizePhone(phone);
  if (!digits) {
    return [];
  }

  const variants = new Set<string>([digits]);
  if (digits.startsWith('55') && digits.length > 11) {
    variants.add(digits.slice(2));
  }
  if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
    variants.add(`55${digits}`);
  }

  return Array.from(variants);
}

export function areEquivalentPhones(left: string, right: string): boolean {
  const leftVariants = expandComparablePhoneVariants(left);
  const rightVariants = expandComparablePhoneVariants(right);

  return leftVariants.some((candidate) => rightVariants.includes(candidate));
}

export function resolveCanonicalChatId(chatId: string, mappings: Map<string, string>): string {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) {
    return '';
  }

  if (LID_RE.test(normalizedChatId)) {
    const mapped =
      mappings.get(normalizedChatId) || mappings.get(normalizedChatId.replace(LID_RE, '')) || '';
    if (mapped) {
      return mapped;
    }
  }

  return normalizedChatId;
}

export function isWorkspaceSelfChatId(
  chatId: string,
  workspaceSelfPhone: string | null,
  workspaceSelfIds: string[],
  mappings: Map<string, string>,
): boolean {
  const normalizedChatId = String(chatId || '').trim();
  if (workspaceSelfIds.some((candidate) => String(candidate || '').trim() === normalizedChatId)) {
    return true;
  }

  if (!workspaceSelfPhone) {
    return false;
  }

  const canonicalChatId = resolveCanonicalChatId(normalizedChatId, mappings);
  const phone = normalizePhone(canonicalChatId);

  return areEquivalentPhones(phone, workspaceSelfPhone);
}

export async function resolveCanonicalPhone(
  workspaceId: string,
  chatId: string,
  providerRegistry: WhatsAppProviderRegistry,
  mappings: Map<string, string>,
): Promise<string> {
  await Promise.resolve();
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) {
    return '';
  }

  if (LID_RE.test(normalizedChatId)) {
    const mapped =
      mappings.get(normalizedChatId) || mappings.get(normalizedChatId.replace(LID_RE, '')) || '';
    if (mapped) {
      return normalizePhone(mapped);
    }
  }

  return normalizePhone(normalizedChatId);
}

export async function canonicalizeMessages(
  workspaceId: string,
  messages: any[],
  providerRegistry: WhatsAppProviderRegistry,
  mappings: Map<string, string>,
): Promise<any[]> {
  await Promise.resolve();
  return (messages || []).map((message) => {
    const canonicalChatId = resolveCanonicalChatId(
      String(message.chatId || message.from || '').trim(),
      mappings,
    );
    const canonicalFrom = resolveCanonicalChatId(
      String(message.from || canonicalChatId).trim(),
      mappings,
    );
    const canonicalTo = resolveCanonicalChatId(String(message.to || '').trim(), mappings);

    return {
      ...message,
      chatId: canonicalChatId || message.chatId,
      from: canonicalFrom || message.from,
      to: canonicalTo || message.to,
    };
  });
}

export async function getLidPnMap(
  workspaceId: string,
  providerRegistry: WhatsAppProviderRegistry,
  lidMapCache: Map<string, { expiresAt: number; mappings: Map<string, string> }>,
  lidMapCacheTtlMs: number,
): Promise<Map<string, string>> {
  const cached = lidMapCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.mappings;
  }

  const mappings = await providerRegistry
    .listLidMappings(workspaceId)
    .catch(() => [] as WahaLidMapping[]);
  const normalized = new Map<string, string>();

  for (const mapping of mappings) {
    const lid = String(mapping?.lid || '').trim();
    const pn = String(mapping?.pn || '').trim();
    if (!lid || !pn) {
      continue;
    }
    normalized.set(lid, pn);
    normalized.set(lid.replace(LID_RE, ''), pn);
  }

  lidMapCache.set(workspaceId, {
    expiresAt: Date.now() + lidMapCacheTtlMs,
    mappings: normalized,
  });

  return normalized;
}

export function sortChatsByPriority(
  chats: {
    id: string;
    unreadCount?: number;
    timestamp?: number;
    lastMessageTimestamp?: number;
    lastMessageFromMe?: boolean | null;
  }[],
  since: Date,
): any[] {
  return [...chats].sort((a, b) => {
    const unreadDelta = (b.unreadCount || 0) - (a.unreadCount || 0);
    if (unreadDelta !== 0) {
      return unreadDelta;
    }

    const resolveAct = (c: any) =>
      Math.max(Number(c.timestamp || 0) || 0, Number(c.lastMessageTimestamp || 0) || 0);
    const activityDelta = resolveAct(b) - resolveAct(a);
    if (activityDelta !== 0) {
      return activityDelta;
    }

    const replyPendingDelta =
      Number(b.lastMessageFromMe === false) - Number(a.lastMessageFromMe === false);
    if (replyPendingDelta !== 0) {
      return replyPendingDelta;
    }

    const recentDelta =
      Number(resolveAct(b) >= since.getTime()) - Number(resolveAct(a) >= since.getTime());
    if (recentDelta !== 0) {
      return recentDelta;
    }

    return String(a.id).localeCompare(String(b.id));
  });
}

type CatchupBackfillCursor = {
  chatId: string;
  activityTimestamp: number;
  updatedAt: string;
} | null;

export function selectCandidateChats(
  chats: any[],
  since: Date,
  includeZeroUnreadActivity: boolean,
  fallbackChatsPerPass: number,
  cursor?: CatchupBackfillCursor,
): {
  chats: any[];
  fallbackChatIds: Set<string>;
} {
  const isAwaiting = (c: any) => c.lastMessageFromMe === false;
  const resolveAct = (c: any) =>
    Math.max(Number(c.timestamp || 0) || 0, Number(c.lastMessageTimestamp || 0) || 0);

  const priorityChats = sortChatsByPriority(
    chats.filter(
      (chat) =>
        (chat.unreadCount || 0) > 0 ||
        isAwaiting(chat) ||
        (includeZeroUnreadActivity && resolveAct(chat) >= since.getTime()),
    ),
    since,
  );
  const staleChats = sortChatsByPriority(
    chats.filter(
      (chat) =>
        (chat.unreadCount || 0) <= 0 && !isAwaiting(chat) && resolveAct(chat) < since.getTime(),
    ),
    since,
  );
  const fallbackChats = rotateFallbackChatsByCursor(staleChats, cursor).slice(
    0,
    fallbackChatsPerPass,
  );

  const deduped = new Map<string, any>();
  for (const chat of [...priorityChats, ...fallbackChats]) {
    if (!deduped.has(chat.id)) {
      deduped.set(chat.id, chat);
    }
  }

  return {
    chats: Array.from(deduped.values()),
    fallbackChatIds: new Set(fallbackChats.map((chat: any) => chat.id)),
  };
}

export function resolveBackfillCursor(sessionMeta: Record<string, unknown>): CatchupBackfillCursor {
  const rawCursor = sessionMeta?.backfillCursor;
  if (!rawCursor || typeof rawCursor !== 'object') {
    return null;
  }

  const cursor = rawCursor as Record<string, unknown>;
  const chatId = safeStr(cursor.chatId).trim();
  const activityTimestamp = Number(cursor.activityTimestamp || cursor.timestamp || 0) || 0;
  const updatedAt = normalizeTimestamp(
    cursor.updatedAt as string | number | Date | null | undefined,
  );

  if (!chatId || activityTimestamp <= 0) {
    return null;
  }

  return {
    chatId,
    activityTimestamp,
    updatedAt: updatedAt?.toISOString() || new Date(activityTimestamp).toISOString(),
  };
}

function rotateFallbackChatsByCursor(chats: any[], cursor?: CatchupBackfillCursor): any[] {
  if (!cursor || !chats.length) {
    return chats;
  }

  const resolveAct = (c: any) =>
    Math.max(Number(c.timestamp || 0) || 0, Number(c.lastMessageTimestamp || 0) || 0);

  const chatIndex = chats.findIndex((chat) => chat.id === cursor.chatId);
  if (chatIndex >= 0) {
    const start = (chatIndex + 1) % chats.length;
    return start === 0 ? chats : [...chats.slice(start), ...chats.slice(0, start)];
  }

  const activityIndex = chats.findIndex((chat) => resolveAct(chat) < cursor.activityTimestamp);
  if (activityIndex > 0) {
    return [...chats.slice(activityIndex), ...chats.slice(0, activityIndex)];
  }

  return chats;
}

export function isNowebStoreMisconfigured(error: unknown): boolean {
  const message = String(
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : normalizeOptionalText(error),
  ).toLowerCase();

  return (
    message.includes('enable noweb store') ||
    message.includes('config.noweb.store.enabled') ||
    message.includes('config.noweb.store.full_sync') ||
    (message.includes('noweb') &&
      message.includes('store') &&
      (message.includes('full_sync') || message.includes('full sync')))
  );
}

export function isSessionMissingError(error: unknown): boolean {
  const message = String(
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : normalizeOptionalText(error),
  ).toLowerCase();

  return (
    message.includes('session') &&
    (message.includes('does not exist') || message.includes('not found') || message.includes('404'))
  );
}

export function isGuestWorkspace(
  workspaceName?: string,
  settings?: Record<string, unknown> | null,
): boolean {
  const normalizedName = String(workspaceName || '')
    .trim()
    .toLowerCase();

  if (normalizedName === 'guest workspace') {
    return true;
  }

  return (
    settings?.guestMode === true ||
    settings?.anonymousGuest === true ||
    settings?.workspaceMode === 'guest' ||
    settings?.authMode === 'anonymous' ||
    (settings?.auth as Record<string, unknown> | undefined)?.anonymous === true
  );
}

export function getLifecycleBlockReason(
  workspaceName?: string,
  settings?: Record<string, unknown> | null,
): string | null {
  const lifecycle = (settings?.whatsappLifecycle || {}) as Record<string, unknown>;

  if (isGuestWorkspace(workspaceName, settings)) {
    return 'guest_workspace_disabled';
  }

  if (
    lifecycle.catchupEnabled === false ||
    lifecycle.autoManage === false ||
    lifecycle.autoCatchup === false
  ) {
    return 'catchup_disabled';
  }

  return null;
}
