import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { forEachSequential } from '../../common/async-sequence';
import { createRedisClient } from '../../common/redis/redis.util';
import { flowQueue } from '../../queue/queue';
import {
  buildCatalogContactEntry,
  filterAndSortCatalogEntries,
} from './whatsapp.service.catalog.companion';
import type { CatalogConversationSummary } from './whatsapp.service.catalog.companion';
import {
  normalizeNumber,
  readText,
  normalizeJsonObject,
  resolveTimestamp,
  toIsoTimestamp,
  normalizeChatId as normalizeChatIdFn,
} from './whatsapp.service.normalization.companion';
import { isPlaceholderContactName as isPlaceholderContactNameValue } from '../whatsapp-normalization.util';

const PATTERN_RE = /-/g;

export type NormalizedContact = {
  id: string;
  phone: string;
  name: string | null;
  pushName: string | null;
  shortName: string | null;
  email: string | null;
  localContactId: string | null;
  source: 'provider' | 'crm' | 'waha+crm';
  registered: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export function isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
  return isPlaceholderContactNameValue(value, phone);
}

export function resolveTrustedContactName(phone: string, ...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const normalized = readText(candidate);
    if (normalized && !isPlaceholderContactName(normalized, phone)) {
      return normalized;
    }
  }
  return '';
}

export function normalizeContacts(
  raw: unknown,
  providerRegistry: { extractPhoneFromChatId: (chatId: string) => string },
): NormalizedContact[] {
  const r = raw as Record<string, unknown> | undefined;
  const candidates: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(r?.contacts)
      ? (r.contacts as unknown[])
      : Array.isArray(r?.items)
        ? (r.items as unknown[])
        : Array.isArray(r?.data)
          ? (r.data as unknown[])
          : [];

  return candidates
    .map((contact: unknown) => normalizeContactEntry(contact, providerRegistry))
    .filter((contact): contact is NormalizedContact => contact !== null);
}

export function normalizeContactEntry(
  contact: unknown,
  providerRegistry: { extractPhoneFromChatId: (chatId: string) => string },
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

  const phoneCandidate = [
    c?.phone,
    c?.number,
    typeof cId === 'object' ? cId?.user : undefined,
    typeof cWid === 'object' ? cWid?.user : undefined,
  ].find((v) => typeof v === 'string' && v.trim());

  const phone = normalizeNumber(
    typeof phoneCandidate === 'string'
      ? phoneCandidate
      : providerRegistry.extractPhoneFromChatId(rawId),
  );

  if (!phone) {
    return null;
  }

  const pushNameRaw = c?.pushName || c?.pushname;
  const pushName = typeof pushNameRaw === 'string' && pushNameRaw.trim() ? pushNameRaw : null;
  const resolvedPushName = isPlaceholderContactName(pushName, phone) ? null : pushName;
  const shortName = typeof c?.shortName === 'string' ? c.shortName : null;

  return {
    id: rawId || `${phone}@c.us`,
    phone,
    name: resolveTrustedContactName(phone, c?.pushName, c?.pushname, c?.name, c?.shortName) || null,
    pushName: resolvedPushName,
    shortName,
    email: null,
    localContactId: null,
    source: 'provider',
    registered: true,
    createdAt: null,
    updatedAt: null,
  };
}

export function normalizeChats(raw: unknown): any[] {
  const r = raw as Record<string, unknown> | undefined;
  const candidates: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(r?.chats)
      ? (r.chats as unknown[])
      : Array.isArray(r?.items)
        ? (r.items as unknown[])
        : Array.isArray(r?.data)
          ? (r.data as unknown[])
          : [];

  return candidates
    .map((chatRaw: unknown) => normalizeChatEntry(chatRaw))
    .filter((chat: any) => chat !== null);
}

export function normalizeChatEntry(chatRaw: unknown): any {
  const chat = chatRaw as Record<string, unknown>;
  const chatId = chat?.id as Record<string, unknown> | string | undefined;
  const chatContact = chat?.contact as Record<string, unknown> | undefined;
  const chatLastMessage = chat?.lastMessage as Record<string, unknown> | undefined;
  const chatLastMessageData = chatLastMessage?._data as Record<string, unknown> | undefined;

  const rawId = readText(
    [
      typeof chatId === 'object' ? chatId?._serialized : undefined,
      chat?.id,
      chat?.chatId,
      chat?.wid,
    ].find((v) => typeof v === 'string' && v.trim()) ?? '',
  );
  const phone = normalizeNumber(
    typeof chat?.phone === 'string' ? chat.phone : rawId.replace(/@.*$/, ''),
  );

  if (!rawId || !phone) {
    return null;
  }

  const timestamp = resolveTimestamp(chat);
  const unreadCount = Number(chat?.unreadCount || chat?.unread || 0) || 0;

  return {
    id: rawId,
    phone,
    name:
      resolveTrustedContactName(
        phone,
        chat?.name,
        chat?.pushName,
        chatContact?.name,
        chatContact?.pushName,
        chatLastMessageData?.verifiedBizName,
      ) || null,
    unreadCount,
    pending: unreadCount > 0 || chatLastMessage?.fromMe === false,
    timestamp,
    lastMessageAt: toIsoTimestamp(timestamp),
    conversationId: null,
    status: null,
    source: 'provider',
  };
}

export function normalizeMessages(raw: unknown, fallbackChatId: string) {
  const r = raw as Record<string, unknown> | undefined;
  const candidates = Array.isArray(raw)
    ? raw
    : Array.isArray(r?.messages)
      ? (r.messages as unknown[])
      : Array.isArray(r?.items)
        ? (r.items as unknown[])
        : Array.isArray(r?.data)
          ? (r.data as unknown[])
          : [];

  return candidates
    .map((msgRaw: unknown) => normalizeMessageEntry(msgRaw, fallbackChatId))
    .filter(Boolean);
}

export function normalizeMessageEntry(msgRaw: unknown, fallbackChatId: string) {
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

  const phone = normalizeNumber(
    typeof message?.phone === 'string' ? message.phone : chatId.replace(/@.*$/, ''),
  );
  const timestamp = resolveTimestamp(message);
  const fromMe = message?.fromMe === true;

  return {
    id,
    chatId,
    phone,
    body: message?.body || mText?.body || '',
    direction: fromMe ? 'OUTBOUND' : 'INBOUND',
    fromMe,
    type: (typeof message?.type === 'string' ? message.type : 'chat').toLowerCase(),
    hasMedia: message?.hasMedia === true,
    mediaUrl: message?.mediaUrl || mMedia?.url || null,
    mimetype: message?.mimetype || mMedia?.mimetype || null,
    timestamp,
    isoTimestamp: toIsoTimestamp(timestamp),
    source: 'provider',
  };
}

export async function collectCatalogContactEntries(
  prisma: {
    contact: { findMany: (args: any) => Promise<any[]> };
    conversation: { findMany: (args: any) => Promise<any[]> };
  },
  workspaceId: string,
  options?: { days?: number; onlyCataloged?: boolean },
): Promise<ReturnType<typeof buildCatalogContactEntry>[]> {
  const days = Math.max(1, Math.min(365, Number(options?.days || 30) || 30));
  const onlyCataloged = options?.onlyCataloged !== false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const [contacts, conversations] = await Promise.all([
    prisma.contact.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    }),
    prisma.conversation.findMany({
      where: { workspaceId },
      select: {
        id: true,
        contactId: true,
        unreadCount: true,
        status: true,
        mode: true,
        lastMessageAt: true,
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 4000,
    }),
  ]);

  const conversationsByContact = new Map<string, CatalogConversationSummary[]>();
  for (const conversation of conversations || []) {
    const items = conversationsByContact.get(conversation.contactId) || [];
    items.push(conversation);
    conversationsByContact.set(conversation.contactId, items);
  }

  const entries = (contacts || []).map((contact) => {
    const relatedConversations = (conversationsByContact.get(contact.id) || [])
      .slice()
      .sort(
        (a, b) =>
          resolveTimestamp({ createdAt: b.lastMessageAt }) -
          resolveTimestamp({ createdAt: a.lastMessageAt }),
      );
    return buildCatalogContactEntry(contact, relatedConversations, resolveTrustedContactName);
  });

  return filterAndSortCatalogEntries(entries, { onlyCataloged, cutoff }) as any;
}

export function isAutonomousEnabledImpl(settings: Record<string, unknown>): boolean {
  const autonomy = normalizeJsonObject(settings.autonomy);
  const autopilot = normalizeJsonObject(settings.autopilot);
  const mode = readText(autonomy.mode).toUpperCase();
  if (mode) {
    return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
  }
  return autopilot.enabled === true;
}

export async function sendDirectlyViaProvider(
  deps: {
    providerRegistry: {
      sendMessage: (...args: unknown[]) => Promise<unknown>;
      setPresence: (...args: unknown[]) => Promise<unknown>;
      readChatMessages: (...args: unknown[]) => Promise<unknown>;
    };
    redis: Redis;
    inbox: { saveMessageByPhone: (...args: unknown[]) => Promise<unknown> };
  },
  params: {
    workspaceId: string;
    to: string;
    message: string;
    opts?: {
      mediaUrl?: string;
      mediaType?: string;
      caption?: string;
      externalId?: string;
      quotedMessageId?: string;
    };
  },
): Promise<any> {
  const { workspaceId, to, message, opts } = params;
  const lockKey = `whatsapp:action-lock:${workspaceId}`;
  const token = `${Date.now()}:${randomUUID()}`;
  const ttlMs = 45_000;
  const deadline = Date.now() + ttlMs;

  const tryAcquire = async (): Promise<any> => {
    if (Date.now() >= deadline) {
      return doSend();
    }
    const acquired = await deps.redis.set(lockKey, token, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') {
      try {
        return await doSend();
      } finally {
        const current = await deps.redis.get(lockKey).catch(() => null);
        if (current === token) await deps.redis.del(lockKey).catch(() => undefined);
      }
    }
    await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 250)));
    return tryAcquire();
  };

  const doSend = async () => {
    const normalizedChatId = normalizeChatIdFn(to);
    await deps.providerRegistry
      .readChatMessages(workspaceId, normalizedChatId)
      .catch(() => undefined);
    await deps.providerRegistry
      .setPresence(workspaceId, 'available', normalizedChatId)
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300 + Math.floor(Math.random() * 500)));
    await deps.providerRegistry
      .setPresence(workspaceId, 'typing', normalizedChatId)
      .catch(() => undefined);
    await new Promise((r) =>
      setTimeout(
        r,
        Math.max(500, Math.min(3500, 450 + message.length * 35 + Math.floor(Math.random() * 450))),
      ),
    );
    await deps.providerRegistry
      .setPresence(workspaceId, 'stopTyping', normalizedChatId)
      .catch(() => undefined);

    const result = (await deps.providerRegistry.sendMessage(workspaceId, to, message, {
      mediaUrl: opts?.mediaUrl,
      mediaType: opts?.mediaType,
      caption: opts?.caption,
      quotedMessageId: opts?.quotedMessageId,
    })) as Record<string, unknown>;

    if (!result.success) {
      await deps.providerRegistry
        .setPresence(workspaceId, 'offline', normalizedChatId)
        .catch(() => undefined);
      return {
        error: true,
        message: typeof result.error === 'string' ? result.error : 'send_failed',
      };
    }

    await deps.providerRegistry.readChatMessages(workspaceId, to).catch(() => undefined);
    await deps.providerRegistry
      .setPresence(workspaceId, 'offline', normalizedChatId)
      .catch(() => undefined);

    await deps.inbox.saveMessageByPhone({
      workspaceId,
      phone: to,
      content: opts?.caption || message || opts?.mediaUrl || '',
      direction: 'OUTBOUND',
      externalId: result.messageId,
      type: opts?.mediaType ? opts.mediaType.toUpperCase() : 'TEXT',
      mediaUrl: opts?.mediaUrl,
      status: 'SENT',
    });

    return { ok: true, direct: true, delivery: 'sent', messageId: result.messageId };
  };

  return tryAcquire();
}

export async function deliverToContext(
  redis: Redis,
  user: string,
  message: string,
  workspaceId?: string,
  opsAlert?: any,
  logger?: any,
) {
  const normalized = normalizeNumber(user);
  const key = `reply:${normalized}`;
  try {
    await redis.rpush(key, message);
    await redis.expire(key, 60 * 60 * 24);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    logger?.warn(`Redis indisponível para deliverToContext: ${msg}`);
    const fallback = createRedisClient();
    if (!fallback) throw new Error('Redis client unavailable');
    try {
      await fallback.rpush(key, message);
      await fallback.expire(key, 60 * 60 * 24);
    } finally {
      fallback.disconnect();
    }
  }
  await flowQueue.add(
    'resume-flow',
    { user: normalized, message, workspaceId },
    { removeOnComplete: true },
  );
}

export function validateWorkspaceProvider(workspace: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const provider = workspace?.whatsappProvider || 'meta-cloud';
  if (provider !== 'meta-cloud') missing.push('whatsapp_provider');
  return missing;
}

export async function collectMessagingRuntimeIssues(
  workspaceId: string,
  workspace: Record<string, unknown>,
  providerRegistry: {
    getSessionStatus: (...args: unknown[]) => Promise<unknown>;
    getProviderType: (...args: unknown[]) => Promise<unknown>;
  },
  whatsappApi: { getRuntimeConfigDiagnostics: (...args: unknown[]) => unknown },
  options?: { requireInboundWebhook?: boolean },
  opsAlert?: any,
) {
  const issues = validateWorkspaceProvider(workspace);
  const providerType = String(await providerRegistry.getProviderType(workspaceId));
  const diagnostics = {
    webhook: whatsappApi.getRuntimeConfigDiagnostics(),
    session: null as { connected: boolean; status?: string; error?: string } | null,
  };

  if (options?.requireInboundWebhook) {
    const webhook = diagnostics.webhook as Record<string, unknown>;
    if (!webhook.webhookConfigured) issues.push('meta_webhook_missing');
    else if (!webhook.inboundEventsConfigured) issues.push('meta_webhook_events_missing_inbound');
  }

  try {
    diagnostics.session = (await providerRegistry.getSessionStatus(workspaceId)) as {
      connected: boolean;
      status?: string;
      error?: string;
    } | null;
    if (!diagnostics.session?.connected) {
      issues.push(
        `${providerType.replace(PATTERN_RE, '_')}_session_${String(diagnostics.session?.status || 'unknown').toLowerCase()}`,
      );
    }
  } catch (error: unknown) {
    issues.push(`${providerType.replace(PATTERN_RE, '_')}_session_status_unavailable`);
    diagnostics.session = {
      connected: false,
      status: 'UNKNOWN',
      error: error instanceof Error ? error.message : 'unknown_error',
    };
    opsAlert?.alertOnCriticalError?.(error, 'WhatsappService.runDiagnostics.session', {
      workspaceId,
    });
  }
  return { issues, diagnostics };
}

async function resolveReadChatCandidates(
  workspaceId: string,
  chatIdOrPhone: string,
  prisma: any,
): Promise<string[]> {
  const normalizedChatId = normalizeChatIdFn(chatIdOrPhone);
  const normalizedPhone = normalizeNumber(normalizedChatId.replace(/@.*$/, ''));
  const contact = normalizedPhone
    ? await prisma.contact
        .findUnique({
          where: { workspaceId_phone: { workspaceId, phone: normalizedPhone } },
          select: { customFields: true },
        })
        .catch(() => null)
    : null;
  const customFields = normalizeJsonObject(contact?.customFields);
  return Array.from(
    new Set(
      [
        normalizedChatId,
        readText(customFields.lastRemoteChatId),
        readText(customFields.lastCatalogChatId),
        readText(customFields.lastResolvedChatId),
        normalizedPhone ? `${normalizedPhone}@c.us` : '',
        normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : '',
      ].filter(Boolean),
    ),
  );
}

export async function markChatAsReadBestEffort(
  workspaceId: string,
  chatIdOrPhone: string,
  prisma: any,
  providerRegistry: any,
): Promise<void> {
  const candidates = await resolveReadChatCandidates(workspaceId, chatIdOrPhone, prisma);
  await forEachSequential(candidates, async (candidate) => {
    await providerRegistry.readChatMessages(workspaceId, candidate).catch(() => undefined);
  });
}
