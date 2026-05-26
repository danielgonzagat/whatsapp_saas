import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
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
import {
  reconcileRemoteChatState as reconcileRemoteChatStateHelper,
  sanitizePlaceholderContacts as sanitizePlaceholderContactsHelper,
} from './whatsapp-catchup-history-state.helpers';
import {
  type BackfillCursorData,
  isDoePlaceholderName,
  type NormalizedJsonObj,
  normalizeOptionalText,
  safeStr,
  type WahaMessagePayload,
} from './whatsapp-catchup-history.shared';

import type { CatchupBackfillCursor } from './whatsapp.interfaces';
export type { CatchupBackfillCursor };

@Injectable()
export class WhatsappCatchupHistoryService {
  private readonly logger = StructuredLogger.from(WhatsappCatchupHistoryService.name);
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
    if (isDoePlaceholderName(n)) {
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
    await reconcileRemoteChatStateHelper(
      {
        prisma: this.prisma,
        providerRegistry: this.providerRegistry,
        logger: this.logger,
        getLidPnMap: (workspaceId) => this.getLidPnMap(workspaceId),
        resolveCanonicalPhone: (workspaceId, chatId) =>
          this.resolveCanonicalPhone(workspaceId, chatId),
        resolveCanonicalChatId: (chatId, mappings) => this.resolveCanonicalChatId(chatId, mappings),
        resolveRemoteContactName: (remoteChat) => this.resolveRemoteContactName(remoteChat),
        isPlaceholderContactName: (value, phone) => this.isPlaceholderContactName(value, phone),
        normalizeJsonObject: (value) => this.normalizeJsonObject(value),
        normalizeTimestamp: (value) => this.normalizeTimestamp(value),
        resolveChatActivityTimestamp: (remoteChat) => this.resolveChatActivityTimestamp(remoteChat),
      },
      ws,
      chat,
    );
  }

  async sanitizePlaceholderContacts(ws: string): Promise<void> {
    await sanitizePlaceholderContactsHelper(
      {
        prisma: this.prisma,
        normalizeJsonObject: (value) => this.normalizeJsonObject(value),
        isPlaceholderContactName: (value, phone) => this.isPlaceholderContactName(value, phone),
      },
      ws,
    );
  }
}
