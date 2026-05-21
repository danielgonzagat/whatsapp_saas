import { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
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
  const ecf = ctx.normalizeJsonObject(ec?.customFields);
  const erp = safeStr(ecf.remotePushName).trim();
  const esn = String(ec?.name || '').trim();
  const rpn =
    ctx.resolveRemoteContactName(chat) ||
    (!ctx.isPlaceholderContactName(erp, phone) ? erp : '') ||
    null;
  const cn = rpn || (!ctx.isPlaceholderContactName(esn, phone) ? esn : '') || null;
  const mappings = await ctx.getLidPnMap(ws);
  const rcid = ctx.resolveCanonicalChatId(cid, mappings);
  const contact = await ctx.prisma.contact.upsert({
    where: { workspaceId_phone: { workspaceId: ws, phone } },
    update: {
      name: cn,
      customFields: JSON.parse(
        JSON.stringify({
          ...ecf,
          remotePushName: rpn || undefined,
          remotePushNameUpdatedAt: rpn
            ? new Date().toISOString()
            : ecf.remotePushNameUpdatedAt || undefined,
          lastRemoteChatId: cid,
          lastResolvedChatId: rcid || cid,
        }),
      ) as Prisma.InputJsonObject,
    },
    create: {
      workspaceId: ws,
      phone,
      name: cn,
      customFields: JSON.parse(
        JSON.stringify({
          remotePushName: rpn || undefined,
          remotePushNameUpdatedAt: rpn ? new Date().toISOString() : undefined,
          lastRemoteChatId: cid,
          lastResolvedChatId: rcid || cid,
        }),
      ) as Prisma.InputJsonObject,
    },
    select: { id: true },
  });
  const saved = cn
    ? await ctx.providerRegistry
        .upsertContactProfile(ws, { phone, name: cn })
        .catch((e: unknown) => {
          ctx.logger.warn(
            `upsertContactProfile failed for ws=${ws} phone=${phone}: ${
              e instanceof Error ? e.message : 'unknown'
            }`,
          );
          return false;
        })
    : false;
  if (saved) {
    await ctx.prisma.contact.updateMany({
      where: { id: contact.id, workspaceId: ws },
      data: {
        customFields: JSON.parse(
          JSON.stringify({
            ...ctx.normalizeJsonObject(
              (
                await ctx.prisma.contact.findFirst({
                  where: { id: contact.id, workspaceId: ws },
                  select: { customFields: true },
                })
              )?.customFields,
            ),
            whatsappSavedAt: new Date().toISOString(),
            lastRemoteChatId: cid,
            lastResolvedChatId: rcid || cid,
            remotePushName: rpn || undefined,
          }),
        ) as Prisma.InputJsonObject,
      },
    });
  }
  const rAt = ctx.normalizeTimestamp(ctx.resolveChatActivityTimestamp(chat));
  const exC = await ctx.prisma.conversation.findFirst({
    where: { workspaceId: ws, contactId: contact.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, unreadCount: true, lastMessageAt: true },
  });
  if (!exC) {
    await ctx.prisma.conversation.create({
      data: {
        workspaceId: ws,
        contactId: contact.id,
        status: 'OPEN',
        priority: 'MEDIUM',
        channel: 'WHATSAPP',
        mode: 'AI',
        unreadCount: Math.max(0, Number(chat.unreadCount || 0) || 0),
        lastMessageAt: rAt || new Date(),
      },
    });
    return;
  }
  const clm =
    exC.lastMessageAt instanceof Date
      ? exC.lastMessageAt
      : ctx.normalizeTimestamp(exC.lastMessageAt);
  await ctx.prisma.conversation.updateMany({
    where: { id: exC.id, workspaceId: ws },
    data: {
      unreadCount: Math.max(
        0,
        Number(exC.unreadCount || 0) || 0,
        Number(chat.unreadCount || 0) || 0,
      ),
      lastMessageAt: rAt && (!clm || rAt > clm) ? rAt : clm || new Date(),
    },
  });
}

export async function sanitizePlaceholderContacts(
  ctx: Pick<HistoryStateContext, 'prisma' | 'normalizeJsonObject' | 'isPlaceholderContactName'>,
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
    const cf = ctx.normalizeJsonObject(contact.customFields);
    const sn = String(contact.name || '').trim();
    const rp = safeStr(cf.remotePushName).trim();
    const tn =
      (!ctx.isPlaceholderContactName(rp, contact.phone) ? rp : '') ||
      (!ctx.isPlaceholderContactName(sn, contact.phone) ? sn : '');
    const hp =
      ctx.isPlaceholderContactName(sn, contact.phone) ||
      ctx.isPlaceholderContactName(rp, contact.phone);
    if (!hp) {
      return;
    }
    const ncf = { ...cf };
    const rc =
      Number(contact._count?.messages || 0) +
      Number(contact._count?.conversations || 0) +
      Number(contact._count?.deals || 0) +
      Number(contact._count?.executions || 0) +
      Number(contact._count?.autopilotEvents || 0) +
      Number(contact._count?.insights || 0);
    if (ctx.isPlaceholderContactName(rp, contact.phone)) {
      delete ncf.remotePushName;
      delete ncf.remotePushNameUpdatedAt;
    } else if (tn) {
      ncf.remotePushName = tn;
      ncf.remotePushNameUpdatedAt = ncf.remotePushNameUpdatedAt || new Date().toISOString();
    }
    ncf.placeholderSanitizedAt = new Date().toISOString();
    ncf.placeholderRelationCount = rc;
    ncf.nameResolutionStatus = tn ? 'resolved' : 'pending';
    await ctx.prisma.contact.updateMany({
      where: { id: contact.id, workspaceId: ws },
      data: { name: tn || null, customFields: ncf as Prisma.InputJsonValue },
    });
  });
}
