import { Prisma } from '@prisma/client';
import { forEachSequential } from '../../../common/async-sequence';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { type WahaChatSummary } from './providers/whatsapp-api.provider';
import { safeStr } from './whatsapp-catchup-history.shared';

type JsonObj = Record<string, unknown>;

type HistoryStateContext = {
  prisma: PrismaService;
  providerRegistry: WhatsAppProviderRegistry;
  logger: { warn(message: string): void };
  getLidPnMap(ws: string): Promise<Map<string, string>>;
  resolveCanonicalPhone(ws: string, chatId: string): Promise<string>;
  resolveCanonicalChatId(chatId: string, mappings: Map<string, string>): string;
  resolveRemoteContactName(chat: WahaChatSummary): string;
  isPlaceholderContactName(value: unknown, phone?: string | null): boolean;
  normalizeJsonObject(value: unknown): JsonObj;
  normalizeTimestamp(value?: Date | string | number | null): Date | null;
  resolveChatActivityTimestamp(chat: WahaChatSummary): number;
};

type ExistingContactState = {
  id: string;
  name: string | null;
  customFields: unknown;
} | null;

type ResolvedContactNames = {
  /** Remote push name (sanitized) or null. */
  rpn: string | null;
  /** Canonical contact name to persist or null. */
  cn: string | null;
  /** Normalized existing customFields. */
  ecf: JsonObj;
};

/** Pick a non-placeholder candidate name, otherwise empty string. */
function nonPlaceholder(
  ctx: Pick<HistoryStateContext, 'isPlaceholderContactName'>,
  value: string,
  phone?: string | null,
): string {
  return !ctx.isPlaceholderContactName(value, phone) ? value : '';
}

/** Resolve the remote push name and canonical contact name from chat + existing state. */
function resolveContactNames(
  ctx: Pick<
    HistoryStateContext,
    'resolveRemoteContactName' | 'isPlaceholderContactName' | 'normalizeJsonObject'
  >,
  chat: WahaChatSummary,
  existing: ExistingContactState,
  phone: string,
): ResolvedContactNames {
  const ecf = ctx.normalizeJsonObject(existing?.customFields);
  const erp = safeStr(ecf.remotePushName).trim();
  const esn = String(existing?.name || '').trim();
  const rpn = ctx.resolveRemoteContactName(chat) || nonPlaceholder(ctx, erp, phone) || null;
  const cn = rpn || nonPlaceholder(ctx, esn, phone) || null;
  return { rpn, cn, ecf };
}

/** Serialize a customFields payload through JSON to strip undefined keys. */
function toInputJsonObject(value: JsonObj): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

/** Upsert the contact row and return its id. */
async function upsertReconciledContact(
  ctx: Pick<HistoryStateContext, 'prisma'>,
  ws: string,
  phone: string,
  names: ResolvedContactNames,
  cid: string,
  rcid: string,
): Promise<{ id: string }> {
  const { rpn, cn, ecf } = names;
  const nowIso = new Date().toISOString();
  return ctx.prisma.contact.upsert({
    where: { workspaceId_phone: { workspaceId: ws, phone } },
    update: {
      name: cn,
      customFields: toInputJsonObject({
        ...ecf,
        remotePushName: rpn || undefined,
        remotePushNameUpdatedAt: rpn ? nowIso : ecf.remotePushNameUpdatedAt || undefined,
        lastRemoteChatId: cid,
        lastResolvedChatId: rcid || cid,
      }),
    },
    create: {
      workspaceId: ws,
      phone,
      name: cn,
      customFields: toInputJsonObject({
        remotePushName: rpn || undefined,
        remotePushNameUpdatedAt: rpn ? nowIso : undefined,
        lastRemoteChatId: cid,
        lastResolvedChatId: rcid || cid,
      }),
    },
    select: { id: true },
  });
}

/** Push the resolved contact name to the provider, returning whether it persisted. */
async function saveContactProfile(
  ctx: Pick<HistoryStateContext, 'providerRegistry' | 'logger'>,
  ws: string,
  phone: string,
  cn: string | null,
): Promise<boolean> {
  if (!cn) {
    return false;
  }
  return ctx.providerRegistry.upsertContactProfile(ws, { phone, name: cn }).catch((e: unknown) => {
    ctx.logger.warn(
      `upsertContactProfile failed for ws=${ws} phone=${phone}: ${
        e instanceof Error ? e.message : 'unknown'
      }`,
    );
    return false;
  });
}

/** Stamp the contact row with the whatsappSavedAt marker after a successful provider save. */
async function markContactSaved(
  ctx: Pick<HistoryStateContext, 'prisma' | 'normalizeJsonObject'>,
  ws: string,
  contactId: string,
  rpn: string | null,
  cid: string,
  rcid: string,
): Promise<void> {
  const current = await ctx.prisma.contact.findFirst({
    where: { id: contactId, workspaceId: ws },
    select: { customFields: true },
  });
  await ctx.prisma.contact.updateMany({
    where: { id: contactId, workspaceId: ws },
    data: {
      customFields: toInputJsonObject({
        ...ctx.normalizeJsonObject(current?.customFields),
        whatsappSavedAt: new Date().toISOString(),
        lastRemoteChatId: cid,
        lastResolvedChatId: rcid || cid,
        remotePushName: rpn || undefined,
      }),
    },
  });
}

/** Coerce a possibly-null count-like value to a non-negative integer. */
function nonNegativeCount(value: unknown): number {
  return Math.max(0, Number(value || 0) || 0);
}

/** Create or update the conversation row to reflect the latest remote chat activity. */
async function upsertReconciledConversation(
  ctx: Pick<HistoryStateContext, 'prisma' | 'normalizeTimestamp' | 'resolveChatActivityTimestamp'>,
  ws: string,
  contactId: string,
  chat: WahaChatSummary,
): Promise<void> {
  const rAt = ctx.normalizeTimestamp(ctx.resolveChatActivityTimestamp(chat));
  const exC = await ctx.prisma.conversation.findFirst({
    where: { workspaceId: ws, contactId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, unreadCount: true, lastMessageAt: true },
  });
  if (!exC) {
    await ctx.prisma.conversation.create({
      data: {
        workspaceId: ws,
        contactId,
        status: 'OPEN',
        priority: 'MEDIUM',
        channel: 'WHATSAPP',
        mode: 'AI',
        unreadCount: nonNegativeCount(chat.unreadCount),
        lastMessageAt: rAt || new Date(),
      },
    });
    return;
  }
  const clm =
    exC.lastMessageAt instanceof Date ? exC.lastMessageAt : ctx.normalizeTimestamp(exC.lastMessageAt);
  await ctx.prisma.conversation.updateMany({
    where: { id: exC.id, workspaceId: ws },
    data: {
      unreadCount: Math.max(nonNegativeCount(exC.unreadCount), nonNegativeCount(chat.unreadCount)),
      lastMessageAt: rAt && (!clm || rAt > clm) ? rAt : clm || new Date(),
    },
  });
}

export async function reconcileRemoteChatState(
  ctx: HistoryStateContext,
  ws: string,
  chat: WahaChatSummary,
): Promise<void> {
  const cid = String(chat.id || '').trim();
  if (!cid || cid.includes('@g.us')) {
    return;
  }
  const phone = await ctx.resolveCanonicalPhone(ws, cid);
  if (!phone) {
    return;
  }
  const ec = await ctx.prisma.contact.findUnique({
    where: { workspaceId_phone: { workspaceId: ws, phone } },
    select: { id: true, name: true, customFields: true },
  });
  const names = resolveContactNames(ctx, chat, ec, phone);
  const mappings = await ctx.getLidPnMap(ws);
  const rcid = ctx.resolveCanonicalChatId(cid, mappings);
  const contact = await upsertReconciledContact(ctx, ws, phone, names, cid, rcid);
  const saved = await saveContactProfile(ctx, ws, phone, names.cn);
  if (saved) {
    await markContactSaved(ctx, ws, contact.id, names.rpn, cid, rcid);
  }
  await upsertReconciledConversation(ctx, ws, contact.id, chat);
}

type SanitizeContactContext = Pick<
  HistoryStateContext,
  'prisma' | 'normalizeJsonObject' | 'isPlaceholderContactName'
>;

type SanitizableContact = {
  id: string;
  phone: string;
  name: string | null;
  customFields: unknown;
  _count?: {
    messages?: number;
    conversations?: number;
    deals?: number;
    executions?: number;
    autopilotEvents?: number;
    insights?: number;
  } | null;
};

/** Resolve the best non-placeholder name for a contact from its remote/saved candidates. */
function resolveSanitizedName(
  ctx: Pick<SanitizeContactContext, 'isPlaceholderContactName'>,
  contact: SanitizableContact,
  remotePush: string,
  savedName: string,
): string {
  return (
    nonPlaceholder(ctx, remotePush, contact.phone) || nonPlaceholder(ctx, savedName, contact.phone)
  );
}

/** Sum the relation counts that indicate whether a contact has real activity. */
function sumRelationCount(contact: SanitizableContact): number {
  const c = contact._count;
  return (
    Number(c?.messages || 0) +
    Number(c?.conversations || 0) +
    Number(c?.deals || 0) +
    Number(c?.executions || 0) +
    Number(c?.autopilotEvents || 0) +
    Number(c?.insights || 0)
  );
}

/** Build the sanitized customFields payload for a placeholder contact. */
function buildSanitizedCustomFields(
  ctx: Pick<SanitizeContactContext, 'isPlaceholderContactName'>,
  cf: JsonObj,
  contact: SanitizableContact,
  remotePush: string,
  targetName: string,
  relationCount: number,
): JsonObj {
  const ncf = { ...cf };
  if (ctx.isPlaceholderContactName(remotePush, contact.phone)) {
    delete ncf.remotePushName;
    delete ncf.remotePushNameUpdatedAt;
  } else if (targetName) {
    ncf.remotePushName = targetName;
    ncf.remotePushNameUpdatedAt = ncf.remotePushNameUpdatedAt || new Date().toISOString();
  }
  ncf.placeholderSanitizedAt = new Date().toISOString();
  ncf.placeholderRelationCount = relationCount;
  ncf.nameResolutionStatus = targetName ? 'resolved' : 'pending';
  return ncf;
}

/** Sanitize a single placeholder contact, persisting the cleaned name + customFields. */
async function sanitizePlaceholderContact(
  ctx: SanitizeContactContext,
  ws: string,
  contact: SanitizableContact,
): Promise<void> {
  const cf = ctx.normalizeJsonObject(contact.customFields);
  const savedName = String(contact.name || '').trim();
  const remotePush = safeStr(cf.remotePushName).trim();
  const targetName = resolveSanitizedName(ctx, contact, remotePush, savedName);
  const hasPlaceholder =
    ctx.isPlaceholderContactName(savedName, contact.phone) ||
    ctx.isPlaceholderContactName(remotePush, contact.phone);
  if (!hasPlaceholder) {
    return;
  }
  const relationCount = sumRelationCount(contact);
  const ncf = buildSanitizedCustomFields(ctx, cf, contact, remotePush, targetName, relationCount);
  await ctx.prisma.contact.updateMany({
    where: { id: contact.id, workspaceId: ws },
    data: { name: targetName || null, customFields: ncf as Prisma.InputJsonValue },
  });
}

export async function sanitizePlaceholderContacts(
  ctx: SanitizeContactContext,
  ws: string,
): Promise<void> {
  if (typeof ctx.prisma.contact?.findMany !== 'function') {
    return;
  }
  const contacts = await ctx.prisma.contact.findMany({
    take: 5000,
    where: { workspaceId: ws },
    select: {
      id: true,
      phone: true,
      name: true,
      customFields: true,
      _count: {
        select: {
          messages: true,
          conversations: true,
          deals: true,
          executions: true,
          autopilotEvents: true,
          insights: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  await forEachSequential(contacts, async (contact) => {
    await sanitizePlaceholderContact(ctx, ws, contact);
  });
}
