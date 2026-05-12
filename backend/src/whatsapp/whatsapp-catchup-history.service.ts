import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
import { OpsAlertService } from '../observability/ops-alert.service';
import { INBOX_SERVICE } from '../inbox/inbox.token';
import type { IInboxService } from '../inbox/inbox.interface';
import { PrismaService } from '../prisma/prisma.service';
import { type ProviderSettings } from './provider-settings.types';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { type WahaChatMessage, type WahaChatSummary } from './providers/whatsapp-api.provider';
import { type InboundMessage } from './inbound-processor.service';
import {
  normalizePhoneExt,
  normalizeTimestampExt,
  normalizeJsonObjExt,
  resolveChatActivityTimestampExt,
  resolveCanonicalChatIdExt,
  getLidPnMapExt,
  resolveCanonicalPhoneExt,
} from './whatsapp-catchup.helpers';

const D__D_S____S_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}
function normalizeOptionalText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

type BackfillCursorData = {
  chatId?: string;
  activityTimestamp?: number;
  timestamp?: number;
  updatedAt?: unknown;
  [key: string]: unknown;
};
type WahaMessagePayload = {
  _data?: { key?: { remoteJidAlt?: string; remoteJid?: string }; [key: string]: unknown };
  key?: { remoteJidAlt?: string; remoteJid?: string };
  [key: string]: unknown;
};
type NormalizedJsonObj = Record<string, unknown>;

export type CatchupBackfillCursor = {
  chatId: string;
  activityTimestamp: number;
  updatedAt: string;
} | null;

@Injectable()
export class WhatsappCatchupHistoryService {
  private readonly logger = new Logger(WhatsappCatchupHistoryService.name);
  private readonly selfPhoneCacheTtlMs = Math.max(
    30_000,
    Number.parseInt(process.env.WAHA_SELF_IDENTITY_TTL_MS || '60000', 10) || 60_000,
  );
  private readonly lidMapCacheTtlMs = Math.max(
    60_000,
    Number.parseInt(process.env.WAHA_LID_MAP_CACHE_TTL_MS || '300000', 10) || 300_000,
  );
  private readonly selfPhoneCache = new Map<string, { expiresAt: number; phone: string | null }>();
  private readonly lidMapCache = new Map<
    string,
    { expiresAt: number; mappings: Map<string, string> }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    @Inject(forwardRef(() => INBOX_SERVICE)) private readonly inbox: IInboxService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private normalizePhone(phone: string): string {
    return normalizePhoneExt(phone);
  }
  private normalizeTimestamp(value?: Date | string | number | null): Date | null {
    return normalizeTimestampExt(value);
  }
  private normalizeJsonObject(value: unknown): NormalizedJsonObj {
    return normalizeJsonObjExt(value);
  }
  private resolveChatActivityTimestamp(chat: WahaChatSummary): number {
    return resolveChatActivityTimestampExt(chat);
  }
  private resolveCanonicalChatId(chatId: string, mappings: Map<string, string>): string {
    return resolveCanonicalChatIdExt(chatId, mappings);
  }

  private async getLidPnMap(ws: string): Promise<Map<string, string>> {
    return getLidPnMapExt(
      { providerRegistry: this.providerRegistry },
      ws,
      this.lidMapCacheTtlMs,
      this.lidMapCache,
    );
  }

  private async resolveCanonicalPhone(ws: string, chatId: string): Promise<string> {
    return resolveCanonicalPhoneExt(
      { providerRegistry: this.providerRegistry },
      ws,
      chatId,
      this.lidMapCacheTtlMs,
      this.lidMapCache,
    );
  }

  isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
    const n = normalizeOptionalText(value);
    if (!n) {
      return true;
    }
    const l = n.toLowerCase();
    const pd = this.normalizePhone(String(phone || ''));
    if (l === 'doe' || l === 'unknown' || l === 'desconhecido') {
      return true;
    }
    if (D__D_S____S_DOE_RE.test(n)) {
      return true;
    }
    if (pd && l === `${pd} doe`) {
      return true;
    }
    if (pd && this.normalizePhone(n) === pd) {
      return true;
    }
    return false;
  }

  resolveRemoteContactName(chat: WahaChatSummary): string {
    const fp = this.normalizePhone(this.providerRegistry.extractPhoneFromChatId(chat?.id || ''));
    for (const c of [
      chat?.name,
      chat?.contact?.pushName,
      chat?.contact?.name,
      chat?.pushName,
      chat?.notifyName,
      chat?.lastMessage?._data?.notifyName,
      chat?.lastMessage?._data?.verifiedBizName,
    ]) {
      const n = String(c || '').trim();
      if (n && !this.isPlaceholderContactName(n, fp)) {
        return n;
      }
    }
    return '';
  }

  async resolveWorkspaceSelfPhone(ws: string, s?: ProviderSettings | null): Promise<string | null> {
    const cached = this.selfPhoneCache.get(ws);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.phone;
    }
    const wS = s?.whatsappWebSession;
    const aS = s?.whatsappApiSession;
    const sp = this.normalizePhone(safeStr(wS?.phoneNumber || aS?.phoneNumber));
    if (sp) {
      this.selfPhoneCache.set(ws, { expiresAt: Date.now() + this.selfPhoneCacheTtlMs, phone: sp });
      return sp;
    }
    if (process.env.NODE_ENV === 'test') {
      this.selfPhoneCache.set(ws, {
        expiresAt: Date.now() + this.selfPhoneCacheTtlMs,
        phone: null,
      });
      return null;
    }
    const r = await this.providerRegistry.getSessionStatus(ws).catch((e: unknown) => {
      this.logger.warn(
        `Session status fetch failed for ws=${ws}: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return null;
    });
    const rp = this.normalizePhone(String(r?.phoneNumber || '')) || null;
    this.selfPhoneCache.set(ws, { expiresAt: Date.now() + this.selfPhoneCacheTtlMs, phone: rp });
    return rp;
  }

  resolveBackfillCursor(sm: {
    backfillCursor?: unknown;
    [key: string]: unknown;
  }): CatchupBackfillCursor {
    const rc = sm?.backfillCursor;
    if (!rc || typeof rc !== 'object') {
      return null;
    }
    const c = rc as BackfillCursorData;
    const cid = safeStr(c.chatId).trim();
    const at = Number(c.activityTimestamp || c.timestamp || 0) || 0;
    if (!cid || at <= 0) {
      return null;
    }
    return {
      chatId: cid,
      activityTimestamp: at,
      updatedAt:
        normalizeTimestampExt(
          c.updatedAt as string | number | Date | null | undefined,
        )?.toISOString() || new Date(at).toISOString(),
    };
  }

  rotateFallbackChatsByCursor(
    chats: WahaChatSummary[],
    cursor?: CatchupBackfillCursor,
  ): WahaChatSummary[] {
    if (!cursor || !chats.length) {
      return chats;
    }
    const i = chats.findIndex((c) => c.id === cursor.chatId);
    if (i >= 0) {
      const s = (i + 1) % chats.length;
      return s === 0 ? chats : [...chats.slice(s), ...chats.slice(0, s)];
    }
    const ai = chats.findIndex(
      (c) => this.resolveChatActivityTimestamp(c) < cursor.activityTimestamp,
    );
    if (ai > 0) {
      return [...chats.slice(ai), ...chats.slice(0, ai)];
    }
    return chats;
  }

  isRemoteChatAwaitingReply(chat: WahaChatSummary): boolean {
    return chat.lastMessageFromMe === false;
  }

  mapInboundType(type?: string): InboundMessage['type'] {
    const n = String(type || '').toLowerCase();
    if (n === 'chat' || n === 'text') {
      return 'text';
    }
    if (n === 'audio' || n === 'ptt') {
      return 'audio';
    }
    if (n === 'image') {
      return 'image';
    }
    if (n === 'document') {
      return 'document';
    }
    if (n === 'video') {
      return 'video';
    }
    if (n === 'sticker') {
      return 'sticker';
    }
    return 'unknown';
  }

  extractSenderName(payload: WahaMessagePayload | null | undefined): string | undefined {
    const data = payload?._data;
    const cs: unknown[] = [
      data?.pushName,
      payload?.pushName,
      data?.notifyName,
      payload?.notifyName,
      payload?.author,
      payload?.senderName,
    ];
    for (const c of cs) {
      if (typeof c === 'string' && c.trim()) {
        return c.trim();
      }
    }
    return undefined;
  }

  resolvePreferredChatId(payload: WahaMessagePayload | null | undefined): string | null {
    const data = payload?._data;
    const dk = data?.key;
    const pk = payload?.key;
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
    return !candidates.length
      ? null
      : candidates.find((c) => !c.includes('@lid')) || candidates[0] || null;
  }

  toInboundMessage(
    ws: string,
    m: WahaChatMessage,
    provider: InboundMessage['provider'] = 'meta-cloud',
  ): InboundMessage | null {
    const pid = String(m.id || '').trim();
    const from = String(m.from || m.chatId || '').trim();
    if (!pid || !from) {
      return null;
    }
    return {
      workspaceId: ws,
      provider,
      ingestMode: 'catchup',
      createdAt: this.normalizeTimestamp(m.timestamp),
      providerMessageId: pid,
      from,
      to: m.to,
      senderName: this.extractSenderName(m.raw),
      type: this.mapInboundType(m.type),
      text: m.body,
      mediaUrl: m.mediaUrl,
      mediaMime: m.mimetype,
      raw: m.raw,
    } as InboundMessage;
  }

  async persistHistoricalOutboundMessage(ws: string, message: WahaChatMessage): Promise<boolean> {
    const phone = this.normalizePhone(String(message.chatId || message.from || '').trim());
    const pid = String(message.id || '').trim();
    if (!phone || !pid) {
      return false;
    }
    try {
      await this.inbox.saveMessageByPhone({
        workspaceId: ws,
        phone,
        content: message.body || '',
        direction: 'OUTBOUND',
        externalId: pid,
        type: this.mapInboundType(message.type).toUpperCase(),
        mediaUrl: message.mediaUrl,
        status: 'READ',
        createdAt: this.normalizeTimestamp(message.timestamp),
        countAsUnread: false,
        resetUnreadOnOutbound: false,
        silent: true,
      } as Parameters<typeof this.inbox.saveMessageByPhone>[0]);
      return true;
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        this.logger.warn(`Duplicate outbound message for ws=${ws} phone=${phone}`);
        void this.opsAlert?.alertOnDegradation(
          e.message,
          'WhatsAppCatchupService.persistHistoricalOutboundMessage.duplicate',
          { workspaceId: ws },
        );
        return false;
      }
      this.logger.error(
        `persistHistoricalOutboundMessage failed for ws=${ws} phone=${phone}: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      void this.opsAlert?.alertOnCriticalError(
        e,
        'WhatsAppCatchupService.persistHistoricalOutboundMessage',
        { workspaceId: ws },
      );
      throw e;
    }
  }

  async reconcileRemoteChatState(ws: string, chat: WahaChatSummary): Promise<void> {
    const cid = String(chat.id || '').trim();
    if (!cid || cid.includes('@g.us')) {
      return;
    }
    const phone = await this.resolveCanonicalPhone(ws, cid);
    if (!phone) {
      return;
    }
    const ec = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId: ws, phone } },
      select: { id: true, name: true, customFields: true },
    });
    const ecf = this.normalizeJsonObject(ec?.customFields);
    const erp = safeStr(ecf.remotePushName).trim();
    const esn = String(ec?.name || '').trim();
    const rpn =
      this.resolveRemoteContactName(chat) ||
      (!this.isPlaceholderContactName(erp, phone) ? erp : '') ||
      null;
    const cn = rpn || (!this.isPlaceholderContactName(esn, phone) ? esn : '') || null;
    const mappings = await this.getLidPnMap(ws);
    const rcid = this.resolveCanonicalChatId(cid, mappings);
    const contact = await this.prisma.contact.upsert({
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
      ? await this.providerRegistry
          .upsertContactProfile(ws, { phone, name: cn })
          .catch((e: unknown) => {
            this.logger.warn(
              `upsertContactProfile failed for ws=${ws} phone=${phone}: ${e instanceof Error ? e.message : 'unknown'}`,
            );
            return false;
          })
      : false;
    if (saved) {
      await this.prisma.contact.updateMany({
        where: { id: contact.id, workspaceId: ws },
        data: {
          customFields: JSON.parse(
            JSON.stringify({
              ...this.normalizeJsonObject(
                (
                  await this.prisma.contact.findFirst({
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
    const rAt = this.normalizeTimestamp(this.resolveChatActivityTimestamp(chat));
    const exC = await this.prisma.conversation.findFirst({
      where: { workspaceId: ws, contactId: contact.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, unreadCount: true, lastMessageAt: true },
    });
    if (!exC) {
      await this.prisma.conversation.create({
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
        : this.normalizeTimestamp(exC.lastMessageAt);
    await this.prisma.conversation.updateMany({
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

  async sanitizePlaceholderContacts(ws: string): Promise<void> {
    if (typeof this.prisma.contact?.findMany !== 'function') {
      return;
    }
    const contacts = await this.prisma.contact.findMany({
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
      const cf = this.normalizeJsonObject(contact.customFields);
      const sn = String(contact.name || '').trim();
      const rp = safeStr(cf.remotePushName).trim();
      const tn =
        (!this.isPlaceholderContactName(rp, contact.phone) ? rp : '') ||
        (!this.isPlaceholderContactName(sn, contact.phone) ? sn : '');
      const hp =
        this.isPlaceholderContactName(sn, contact.phone) ||
        this.isPlaceholderContactName(rp, contact.phone);
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
      if (this.isPlaceholderContactName(rp, contact.phone)) {
        delete ncf.remotePushName;
        delete ncf.remotePushNameUpdatedAt;
      } else if (tn) {
        ncf.remotePushName = tn;
        ncf.remotePushNameUpdatedAt = ncf.remotePushNameUpdatedAt || new Date().toISOString();
      }
      ncf.placeholderSanitizedAt = new Date().toISOString();
      ncf.placeholderRelationCount = rc;
      ncf.nameResolutionStatus = tn ? 'resolved' : 'pending';
      await this.prisma.contact.updateMany({
        where: { id: contact.id, workspaceId: ws },
        data: { name: tn || null, customFields: ncf as Prisma.InputJsonValue },
      });
    });
  }
}
