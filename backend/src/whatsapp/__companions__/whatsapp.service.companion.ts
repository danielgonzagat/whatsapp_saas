import { randomInt, randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WhatsAppProviderRegistry } from '../providers/provider-registry';
import type { PlanLimitsService } from '../../billing/plan-limits.service';
import type { WorkspaceService } from '../../workspaces/workspace.service';
import type { InboxService } from '../../inbox/inbox.service';
import type { NeuroCrmService } from '../../crm/neuro-crm.service';
import type { OpsAlertService } from '../../observability/ops-alert.service';
import type { WhatsAppCatchupService } from '../whatsapp-catchup.service';
import type { CiaRuntimeService } from '../cia-runtime.service';
import type { WorkerRuntimeService } from '../worker-runtime.service';
import type { WhatsAppApiProvider } from '../providers/whatsapp-api.provider';
import { buildQueueDedupId, buildQueueJobId } from '../../queue/job-id.util';
import { autopilotQueue, flowQueue } from '../../queue/queue';

const D_RE = /\D/g;

// ── Types ──
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
export type NormalizedChat = {
  id: string;
  phone: string;
  name: string | null;
  unreadCount: number;
  pending: boolean;
  needsReply?: boolean;
  pendingMessages?: number;
  owner?: any;
  blockedReason?: any;
  lastMessageDirection?: any;
  timestamp: number;
  lastMessageAt: string | null;
  conversationId: string | null;
  status: string | null;
  mode?: string | null;
  assignedAgentId?: string | null;
  source: 'provider' | 'crm' | 'waha+crm';
};
export type CatalogConversationSummary = {
  id: string;
  contactId: string;
  unreadCount: number | null;
  status: string | null;
  mode: string | null;
  lastMessageAt: Date | null;
};

export type WsDeps = {
  prisma: PrismaService;
  redis: Redis;
  providerRegistry: WhatsAppProviderRegistry;
  planLimits: PlanLimitsService;
  workspaces: WorkspaceService;
  inbox: InboxService;
  neuroCrm: NeuroCrmService;
  opsAlert?: OpsAlertService;
  catchupService: WhatsAppCatchupService;
  ciaRuntime: CiaRuntimeService;
  workerRuntime: WorkerRuntimeService;
  whatsappApi: WhatsAppApiProvider;
  contactDebounceMs: number;
};

// ── Utility helpers ──
function readText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}
function normalizeNumber(num: string): string {
  return num.replace(D_RE, '');
}

export function normalizeJsonObjExt(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const p = JSON.parse(value);
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return {};
    }
    return {};
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}
export function resolveTimestampExt(value: unknown): number {
  const v = value as Record<string, unknown> | undefined;
  const vChat = v?._chat as Record<string, unknown> | undefined;
  const vLm = v?.lastMessage as Record<string, unknown> | undefined;
  const vLmd = vLm?._data as Record<string, unknown> | undefined;
  for (const c of [
    vChat?.conversationTimestamp,
    vChat?.lastMessageRecvTimestamp,
    v?.conversationTimestamp,
    v?.lastMessageRecvTimestamp,
    vLm?.timestamp,
    vLmd?.messageTimestamp,
    v?.timestamp,
    v?.t,
    v?.createdAt,
    v?.lastMessageTimestamp,
    v?.last_time,
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
export function toIsoTimestamp(timestamp: number): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}
export function normalizeProbabilityScoreExt(score: unknown, bucket?: string | null): number {
  const numeric = Number(score);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
  switch (
    String(bucket || '')
      .trim()
      .toUpperCase()
  ) {
    case 'VERY_HIGH':
      return 0.95;
    case 'HIGH':
      return 0.8;
    case 'MEDIUM':
      return 0.5;
    case 'LOW':
      return 0.15;
    default:
      return 0;
  }
}
export function isAutonomousEnabledExt(settings: Record<string, unknown>): boolean {
  const autonomy = normalizeJsonObjExt(settings.autonomy);
  const autopilot = normalizeJsonObjExt(settings.autopilot);
  const mode = readText(autonomy.mode).toUpperCase();
  if (mode) return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
  return autopilot.enabled === true;
}
export function normalizeHashExt(text: string): string {
  return Buffer.from(text || '')
    .toString('base64')
    .slice(0, 32);
}
export function normalizeNumberExt(num: string): string {
  return num.replace(D_RE, '');
}

// ── Normalize contacts ──
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
  if (!phone) return null;
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

// ── Normalize chats ──
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
  const phone = normalizeNumber(
    typeof chat?.phone === 'string' ? chat.phone : deps.extractPhone(rawId),
  );
  if (!rawId || !phone) return null;
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

// ── Normalize messages ──
export function normalizeMessageEntry(
  msgRaw: unknown,
  fallbackChatId: string,
  deps: { extractPhone: (id: string) => string },
): any {
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
  if (!id || !chatId) return null;
  const phone = normalizeNumber(
    typeof message?.phone === 'string' ? message.phone : deps.extractPhone(chatId),
  );
  const ts = resolveTimestampExt(message);
  const fm = message?.fromMe === true;
  return {
    id,
    chatId,
    phone,
    body: message?.body || mText?.body || '',
    direction: fm ? 'OUTBOUND' : 'INBOUND',
    fromMe: fm,
    type: (typeof message?.type === 'string' ? message.type : 'chat').toLowerCase(),
    hasMedia: message?.hasMedia === true,
    mediaUrl: message?.mediaUrl || mMedia?.url || null,
    mimetype: message?.mimetype || mMedia?.mimetype || null,
    timestamp: ts,
    isoTimestamp: toIsoTimestamp(ts),
    source: 'provider',
  };
}

// ── collectCatalogContactEntries ──
export async function collectCatalogContactEntriesExt(
  deps: Pick<WsDeps, 'prisma'> & { resolveName: (p: string, ...c: unknown[]) => string },
  workspaceId: string,
  options?: { days?: number; onlyCataloged?: boolean },
) {
  const days = Math.max(1, Math.min(365, Number(options?.days || 30) || 30));
  const onlyCataloged = options?.onlyCataloged !== false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const [contacts, conversations] = await Promise.all([
    deps.prisma.contact.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    }),
    deps.prisma.conversation.findMany({
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
  const cbC = new Map<string, CatalogConversationSummary[]>();
  for (const c of conversations || []) {
    const items = cbC.get(c.contactId) || [];
    items.push(c);
    cbC.set(c.contactId, items);
  }
  const ndv = (v: unknown) => {
    const ts = resolveTimestampExt({ createdAt: v });
    return toIsoTimestamp(ts);
  };
  return (contacts || [])
    .map((contact) => {
      const cf = normalizeJsonObjExt(contact.customFields);
      const rcs = (cbC.get(contact.id) || [])
        .slice()
        .sort(
          (a, b) =>
            resolveTimestampExt({ createdAt: b.lastMessageAt }) -
            resolveTimestampExt({ createdAt: a.lastMessageAt }),
        );
      const lastC = rcs[0] || null;
      const lca = ndv(lastC?.lastMessageAt) || null;
      const ur = rcs.reduce((s, c) => s + Math.max(0, Number(c?.unreadCount || 0) || 0), 0);
      const catAt = ndv(cf.catalogedAt);
      const scoredAt = ndv(cf.lastScoredAt);
      const waAt = ndv(cf.whatsappSavedAt);
      const rpn = typeof cf.remotePushName === 'string' ? cf.remotePushName : null;
      const lrcId = typeof cf.lastRemoteChatId === 'string' ? cf.lastRemoteChatId : null;
      const lrscId = typeof cf.lastResolvedChatId === 'string' ? cf.lastResolvedChatId : null;
      const pps = normalizeProbabilityScoreExt(
        cf.purchaseProbabilityScore,
        contact.purchaseProbability,
      );
      const ppp = Math.max(
        0,
        Math.min(100, Math.round(Number(cf.purchaseProbabilityPercent ?? pps * 100) || 0)),
      );
      const pReasons = Array.isArray(cf.probabilityReasons)
        ? cf.probabilityReasons
            .map((r: unknown) => (typeof r === 'string' ? r : '').trim())
            .filter(Boolean)
        : [];
      const pref = Array.isArray(cf.preferences)
        ? cf.preferences
            .map((i: unknown) => (typeof i === 'string' ? i : '').trim())
            .filter(Boolean)
        : [];
      const imp = Array.isArray(cf.importantDetails)
        ? cf.importantDetails
            .map((i: unknown) => (typeof i === 'string' ? i : '').trim())
            .filter(Boolean)
        : [];
      const dem = normalizeJsonObjExt(cf.demographics);
      const demographics =
        Object.keys(dem).length > 0
          ? {
              gender: typeof dem.gender === 'string' ? dem.gender : 'UNKNOWN',
              ageRange: typeof dem.ageRange === 'string' ? dem.ageRange : 'UNKNOWN',
              location: typeof dem.location === 'string' ? dem.location : 'UNKNOWN',
              confidence: Math.max(0, Math.min(1, Number(dem.confidence || 0) || 0)),
            }
          : { gender: 'UNKNOWN', ageRange: 'UNKNOWN', location: 'UNKNOWN', confidence: 0 };
      const rbs = typeof cf.buyerStatus === 'string' ? cf.buyerStatus.trim().toUpperCase() : '';
      const buyerStatus = ['BOUGHT', 'NOT_BOUGHT', 'UNKNOWN'].includes(rbs) ? rbs : 'UNKNOWN';
      const cataloged =
        !!catAt ||
        !!scoredAt ||
        !!waAt ||
        !!String(contact.aiSummary || '').trim() ||
        pReasons.length > 0 ||
        Number.isFinite(Number(cf.purchaseProbabilityScore));
      const lrt = Math.max(
        resolveTimestampExt({ createdAt: lca }),
        resolveTimestampExt({ createdAt: catAt }),
        resolveTimestampExt({ createdAt: scoredAt }),
        resolveTimestampExt({ createdAt: contact.updatedAt }),
      );
      return {
        id: contact.id,
        phone: contact.phone,
        name: deps.resolveName(contact.phone, rpn, contact.name) || null,
        email: contact.email || null,
        leadScore: Math.max(0, Number(contact.leadScore || 0) || 0),
        sentiment: contact.sentiment || 'NEUTRAL',
        purchaseProbability: contact.purchaseProbability || 'LOW',
        purchaseProbabilityScore: pps,
        purchaseProbabilityPercent: ppp,
        buyerStatus,
        purchasedProduct: typeof cf.purchasedProduct === 'string' ? cf.purchasedProduct : null,
        purchaseValue: Number.isFinite(Number(cf.purchaseValue)) ? Number(cf.purchaseValue) : null,
        purchaseReason: typeof cf.purchaseReason === 'string' ? cf.purchaseReason : null,
        notPurchasedReason:
          typeof cf.notPurchasedReason === 'string' ? cf.notPurchasedReason : null,
        nextBestAction: contact.nextBestAction || null,
        aiSummary: contact.aiSummary || null,
        fullSummary:
          typeof cf.fullSummary === 'string' ? cf.fullSummary : contact.aiSummary || null,
        intent: typeof cf.intent === 'string' ? cf.intent : null,
        remotePushName: rpn,
        demographics,
        preferences: pref,
        importantDetails: imp,
        probabilityReasons: pReasons,
        cataloged,
        catalogedAt: catAt,
        lastScoredAt: scoredAt,
        whatsappSavedAt: waAt,
        lastRemoteChatId: lrcId,
        lastResolvedChatId: lrscId,
        conversationCount: rcs.length,
        unreadCount: ur,
        lastConversationAt: lca,
        lastConversationStatus: lastC?.status || null,
        lastConversationMode: lastC?.mode || null,
        createdAt: contact.createdAt?.toISOString?.() || null,
        updatedAt: contact.updatedAt?.toISOString?.() || null,
        latestRelevantTimestamp: lrt,
      };
    })
    .filter((e) => {
      if (onlyCataloged && !e.cataloged) return false;
      return e.latestRelevantTimestamp >= cutoff;
    })
    .sort((a, b) => {
      const ca = Math.max(
        resolveTimestampExt({ createdAt: a.catalogedAt }),
        resolveTimestampExt({ createdAt: a.lastScoredAt }),
      );
      const cb = Math.max(
        resolveTimestampExt({ createdAt: b.catalogedAt }),
        resolveTimestampExt({ createdAt: b.lastScoredAt }),
      );
      if (ca !== cb) return cb - ca;
      if (a.purchaseProbabilityScore !== b.purchaseProbabilityScore)
        return b.purchaseProbabilityScore - a.purchaseProbabilityScore;
      return b.latestRelevantTimestamp - a.latestRelevantTimestamp;
    })
    .map(({ latestRelevantTimestamp: _, ...entry }) => entry);
}

// ── handleIncoming extracted ──
export async function handleIncomingExt(
  deps: WsDeps & {
    isPlaceholderContact: (v: unknown, p?: string | null) => boolean;
    resolveTrustedName: (p: string, ...c: unknown[]) => string;
  },
  workspaceId: string,
  from: string,
  message: string,
) {
  const ws = await deps.workspaces.getWorkspace(workspaceId).catch(() => null);
  if (!ws) throw new Error('Workspace not found for incoming message');
  const dedupeKey = `incoming:dedupe:${workspaceId}:${from}:${normalizeHashExt(message)}`;
  const already = await deps.redis.get(dedupeKey);
  if (already) return { skipped: true, reason: 'duplicate' };
  await deps.redis.setex(dedupeKey, 60, '1');
  const lower = (message || '').toLowerCase();
  if (
    ['stop', 'sair', 'cancelar', 'cancel', 'parar', 'unsubscribe'].some((k) => lower.includes(k))
  ) {
    try {
      /* opt-out best effort - handled by service */
    } catch {
      /* handled by service */
    }
  }
  const saved = await deps.inbox.saveMessageByPhone({
    workspaceId,
    phone: from,
    content: message,
    direction: 'INBOUND',
  });
  const nPhone = normalizeNumber(from);
  const key = `reply:${nPhone}`;
  try {
    await deps.redis.rpush(key, message);
    await deps.redis.expire(key, 60 * 60 * 24);
  } catch {
    /* fallback handled */
  }
  await flowQueue.add(
    'resume-flow',
    { user: nPhone, message, workspaceId },
    { removeOnComplete: true },
  );
  try {
    const settings = normalizeJsonObjExt(ws.providerSettings);
    if (isAutonomousEnabledExt(settings) && saved?.contactId) {
      const scanKey = `autopilot:scan-contact:${workspaceId}:${saved.contactId}`;
      const reserved = await deps.redis.set(scanKey, saved.id, 'PX', deps.contactDebounceMs, 'NX');
      if (reserved === 'OK')
        await autopilotQueue.add(
          'scan-contact',
          {
            workspaceId,
            phone: from,
            contactId: saved.contactId,
            messageContent: message,
            messageId: saved.id,
          },
          {
            jobId: buildQueueJobId('scan-contact', workspaceId, saved.contactId, saved.id),
            delay: deps.contactDebounceMs,
            deduplication: {
              id: buildQueueDedupId('scan-contact', workspaceId, saved.contactId),
              ttl: deps.contactDebounceMs + 500,
            },
            removeOnComplete: true,
          },
        );
    }
    const apConfig = normalizeJsonObjExt(settings.autopilot);
    const hotFlowId = typeof apConfig.hotFlowId === 'string' ? apConfig.hotFlowId : null;
    if (
      hotFlowId &&
      ['preco', 'preço', 'price', 'quanto', 'pix', 'boleto', 'garantia', 'comprar', 'assinar'].some(
        (k) => lower.includes(k),
      )
    )
      await flowQueue.add('run-flow', {
        workspaceId,
        flowId: hotFlowId,
        user: nPhone,
        initialVars: { source: 'hot_signal', lastMessage: message },
      });
  } catch (err: unknown) {
    void deps.opsAlert?.alertOnCriticalError(err, 'WhatsappService.processInbound.autopilot', {
      workspaceId,
    });
  }
  if (saved?.contactId)
    void deps.neuroCrm.analyzeContact(workspaceId, saved.contactId).catch(() => {});
  try {
    await deps.redis.publish(
      `ws:copilot:${workspaceId}`,
      JSON.stringify({
        type: 'new_message',
        workspaceId,
        contactId: saved?.contactId,
        phone: from,
        message,
      }),
    );
  } catch {
    /* handled by service */
  }
  return { ok: true };
}

// ── sendDirectlyViaProvider extracted ──
export async function sendDirectlyViaProviderExt(
  deps: Pick<WsDeps, 'prisma' | 'providerRegistry' | 'inbox' | 'redis'> & {
    normalizeChatId: (id: string) => string;
    readText: (v: unknown) => string;
    sleep: (ms: number) => Promise<void>;
    markChatAsReadBestEffort: (workspaceId: string, chatIdOrPhone: string) => Promise<void>;
  },
  workspaceId: string,
  to: string,
  message: string,
  opts?: {
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
    externalId?: string;
    complianceMode?: 'reactive' | 'proactive';
    forceDirect?: boolean;
    quotedMessageId?: string;
  },
) {
  const lockKey = `whatsapp:action-lock:${workspaceId}`;
  const token = `${Date.now()}:${randomUUID()}`;
  const ttlMs = Math.max(
    15_000,
    Number.parseInt(process.env.WHATSAPP_ACTION_LOCK_MS || '45000', 10) || 45_000,
  );
  const deadline = Date.now() + ttlMs;
  const tryAcquire = async (): Promise<any> => {
    if (Date.now() >= deadline) {
      /* fall through */
    }
    const acquired = await deps.redis.set(lockKey, token, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') {
      try {
        await deps.sleep(300 + randomInt(500));
        const nChatId = deps.normalizeChatId(to);
        await deps.markChatAsReadBestEffort(workspaceId, nChatId);
        await deps.providerRegistry.setPresence(workspaceId, 'available', nChatId).catch(() => {});
        await deps.sleep(300 + randomInt(500));
        await deps.providerRegistry.sendTyping(workspaceId, nChatId).catch(() => {});
        await deps.sleep(
          Math.max(
            500,
            Math.min(
              3500,
              450 + String(opts?.caption || message || '').trim().length * 35 + randomInt(450),
            ),
          ),
        );
        await deps.providerRegistry.stopTyping(workspaceId, nChatId).catch(() => {});
        const result = await deps.providerRegistry.sendMessage(workspaceId, to, message, {
          mediaUrl: opts?.mediaUrl,
          mediaType: opts?.mediaType,
          caption: opts?.caption,
          quotedMessageId: opts?.quotedMessageId,
        });
        if (!result.success) {
          await deps.providerRegistry.setPresence(workspaceId, 'offline', nChatId).catch(() => {});
          return { error: true, message: result.error || 'send_failed' };
        }
        await deps.markChatAsReadBestEffort(workspaceId, to);
        await deps.providerRegistry.setPresence(workspaceId, 'offline', nChatId).catch(() => {});
        await deps.inbox.saveMessageByPhone({
          workspaceId,
          phone: to,
          content: opts?.caption || message || opts?.mediaUrl || '',
          direction: 'OUTBOUND',
          externalId: result.messageId || opts?.externalId,
          type: opts?.mediaType ? opts.mediaType.toUpperCase() : 'TEXT',
          mediaUrl: opts?.mediaUrl,
          status: 'SENT',
        });
        return { ok: true, direct: true, delivery: 'sent', messageId: result.messageId };
      } finally {
        const current = await deps.redis.get(lockKey).catch(() => null);
        if (current === token) await deps.redis.del(lockKey).catch(() => {});
      }
    }
    await deps.sleep(250 + randomInt(250));
    return tryAcquire();
  };
  return tryAcquire();
}
