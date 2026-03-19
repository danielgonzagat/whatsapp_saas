import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  InboundMessage,
  InboundProcessorService,
} from './inbound-processor.service';
import {
  WahaChatMessage,
  WahaChatSummary,
  WhatsAppApiProvider,
} from './providers/whatsapp-api.provider';

@Injectable()
export class WhatsAppCatchupService {
  private readonly logger = new Logger(WhatsAppCatchupService.name);
  private readonly lockTtlSeconds = 180;
  private readonly minTriggerIntervalSeconds = Math.max(
    15,
    parseInt(process.env.WAHA_CATCHUP_MIN_TRIGGER_INTERVAL_SECONDS || '60', 10) ||
      60,
  );
  private readonly maxChats = Math.max(
    1,
    parseInt(process.env.WAHA_CATCHUP_MAX_CHATS || '200', 10) || 200,
  );
  private readonly maxMessagesPerChat = Math.max(
    1,
    parseInt(process.env.WAHA_CATCHUP_MAX_MESSAGES_PER_CHAT || '100', 10) ||
      100,
  );
  private readonly lookbackMs = Math.max(
    60_000,
    parseInt(process.env.WAHA_CATCHUP_LOOKBACK_MS || `${12 * 60 * 60 * 1000}`, 10) ||
      12 * 60 * 60 * 1000,
  );
  private readonly maxPasses = Math.max(
    1,
    parseInt(process.env.WAHA_CATCHUP_MAX_PASSES || '5', 10) || 5,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly inboundProcessor: InboundProcessorService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async triggerCatchup(
    workspaceId: string,
    reason = 'unknown',
  ): Promise<{ scheduled: boolean; reason?: string }> {
    const cooldownKey = this.getCooldownKey(workspaceId);
    const cooldown = await this.redis.set(
      cooldownKey,
      reason,
      'EX',
      this.minTriggerIntervalSeconds,
      'NX',
    );
    if (cooldown !== 'OK') {
      return { scheduled: false, reason: 'catchup_cooldown' };
    }

    const lockKey = this.getLockKey(workspaceId);
    const token = randomUUID();
    const acquired = await this.redis.set(
      lockKey,
      token,
      'EX',
      this.lockTtlSeconds,
      'NX',
    );

    if (acquired !== 'OK') {
      return { scheduled: false, reason: 'catchup_locked' };
    }

    void this.runCatchup(workspaceId, reason, token).catch((error) => {
      this.logger.error(
        `catchup_failed workspace=${workspaceId} reason=${reason}: ${error?.message || error}`,
      );
    });

    return { scheduled: true };
  }

  private async runCatchup(
    workspaceId: string,
    reason: string,
    token: string,
  ) {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, providerSettings: true },
      });
      if (!workspace) {
        return;
      }

      const settings = ((workspace.providerSettings as any) || {}) as Record<
        string,
        any
      >;
      const sessionMeta = (settings.whatsappApiSession || {}) as Record<
        string,
        any
      >;

      await this.ensureAutopilotEnabled(workspaceId, settings);

      const since = this.resolveCatchupSince(sessionMeta);
      let importedMessages = 0;
      let touchedChats = 0;
      let processedChats = 0;
      let hadOverflow = false;
      const processedChatIds = new Set<string>();

      for (let pass = 0; pass < this.maxPasses; pass += 1) {
        const rawChats = await this.whatsappApi.getChats(workspaceId);
        const pendingChats = this.normalizeChats(rawChats)
          .filter((chat) => !!chat.id)
          .filter((chat) => !processedChatIds.has(chat.id))
          .filter(
            (chat) =>
              (chat.unreadCount || 0) > 0 ||
              this.resolveTimestamp(chat) >= since.getTime(),
          )
          .sort((a, b) => {
            const unreadDelta = (b.unreadCount || 0) - (a.unreadCount || 0);
            if (unreadDelta !== 0) return unreadDelta;
            return this.resolveTimestamp(b) - this.resolveTimestamp(a);
          });

        const chats = pendingChats.slice(0, this.maxChats);
        if (!chats.length) {
          break;
        }

        if (pendingChats.length > chats.length) {
          hadOverflow = true;
        }

        for (const chat of chats) {
          processedChatIds.add(chat.id);
          processedChats += 1;

          const rawMessages = await this.whatsappApi.getChatMessages(
            workspaceId,
            chat.id,
            { limit: this.maxMessagesPerChat },
          );
          const normalizedMessages = this.normalizeMessages(rawMessages, chat.id)
            .filter((message) => !message.fromMe)
            .filter((message) => !!message.id)
            .sort((a, b) => this.resolveTimestamp(a) - this.resolveTimestamp(b));

          if (
            normalizedMessages.length >= this.maxMessagesPerChat ||
            (chat.unreadCount || 0) > normalizedMessages.length
          ) {
            hadOverflow = true;
          }

          const messages = normalizedMessages.filter(
            (message) => this.resolveTimestamp(message) >= since.getTime(),
          );

          if (!messages.length) {
            continue;
          }

          touchedChats += 1;

          for (const message of messages) {
            const inbound = this.toInboundMessage(workspaceId, message);
            if (!inbound) continue;

            const result = await this.inboundProcessor.process(inbound);
            if (!result.deduped) {
              importedMessages += 1;
            }
          }

          await this.whatsappApi.sendSeen(workspaceId, chat.id).catch(() => {});
        }
      }

      await this.persistCatchupSnapshot(workspaceId, {
        lastCatchupAt: new Date().toISOString(),
        lastCatchupReason: reason,
        lastCatchupImportedMessages: importedMessages,
        lastCatchupTouchedChats: touchedChats,
        lastCatchupProcessedChats: processedChats,
        lastCatchupOverflow: hadOverflow,
      });

      this.logger.log(
        `catchup_completed workspace=${workspaceId} chats=${touchedChats} imported=${importedMessages} overflow=${hadOverflow} reason=${reason}`,
      );
    } finally {
      await this.releaseLock(workspaceId, token);
    }
  }

  private async ensureAutopilotEnabled(
    workspaceId: string,
    settings: Record<string, any>,
  ) {
    const current = (settings.autopilot || {}) as Record<string, any>;
    if (current.enabled === true) {
      return;
    }

    const nextSettings = {
      ...settings,
      autopilot: {
        ...current,
        enabled: true,
        mode: current.mode || 'sales',
        autoEnabledByWhatsAppConnect: true,
        autoEnabledAt: current.autoEnabledAt || new Date().toISOString(),
      },
    };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: nextSettings,
      },
    });
  }

  private resolveCatchupSince(sessionMeta: Record<string, any>): Date {
    if (typeof sessionMeta.lastCatchupAt === 'string') {
      const lastCatchupAt = new Date(sessionMeta.lastCatchupAt);
      if (!Number.isNaN(lastCatchupAt.getTime())) {
        return lastCatchupAt;
      }
    }

    return new Date(Date.now() - this.lookbackMs);
  }

  private normalizeChats(raw: any): WahaChatSummary[] {
    const candidates = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.chats)
        ? raw.chats
        : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.data)
            ? raw.data
            : [];

    return candidates
      .map((chat: any) => ({
        id:
          chat?.id?._serialized ||
          chat?.id ||
          chat?.chatId ||
          chat?.wid ||
          '',
        unreadCount: Number(chat?.unreadCount || chat?.unread || 0) || 0,
        timestamp: this.resolveTimestamp(chat),
        lastMessageTimestamp:
          Number(chat?.lastMessageTimestamp || chat?.last_time || 0) || 0,
      }))
      .filter((chat) => !!chat.id);
  }

  private normalizeMessages(raw: any, fallbackChatId: string): WahaChatMessage[] {
    const candidates = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.messages)
        ? raw.messages
        : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.data)
            ? raw.data
            : [];

    return candidates.map((message: any) => ({
      id:
        message?.id?._serialized ||
        message?.id?.id ||
        message?.key?.id ||
        message?.id ||
        '',
      from: message?.from,
      to: message?.to,
      fromMe: message?.fromMe === true,
      body: message?.body || message?.text?.body || '',
      type: message?.type,
      hasMedia: message?.hasMedia === true,
      mediaUrl: message?.mediaUrl || message?.media?.url,
      mimetype: message?.mimetype || message?.media?.mimetype,
      timestamp: this.resolveTimestamp(message),
      chatId:
        message?.chatId ||
        message?.from ||
        message?.to ||
        fallbackChatId,
      raw: message,
    }));
  }

  private toInboundMessage(
    workspaceId: string,
    message: WahaChatMessage,
  ): InboundMessage | null {
    const providerMessageId = String(message.id || '').trim();
    const from = String(message.from || message.chatId || '').trim();

    if (!providerMessageId || !from) {
      return null;
    }

    return {
      workspaceId,
      provider: 'whatsapp-api',
      providerMessageId,
      from,
      to: message.to,
      type: this.mapInboundType(message.type),
      text: message.body,
      mediaUrl: message.mediaUrl,
      mediaMime: message.mimetype,
      raw: message.raw,
    };
  }

  private mapInboundType(
    type?: string,
  ): InboundMessage['type'] {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'chat' || normalized === 'text') return 'text';
    if (normalized === 'audio' || normalized === 'ptt') return 'audio';
    if (normalized === 'image') return 'image';
    if (normalized === 'document') return 'document';
    if (normalized === 'video') return 'video';
    if (normalized === 'sticker') return 'sticker';
    return 'unknown';
  }

  private resolveTimestamp(value: any): number {
    const candidates = [
      value?.timestamp,
      value?.t,
      value?.createdAt,
      value?.lastMessageTimestamp,
      value?.last_time,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate > 1e12 ? candidate : candidate * 1000;
      }
      if (typeof candidate === 'string') {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) {
          return numeric > 1e12 ? numeric : numeric * 1000;
        }
        const date = new Date(candidate);
        if (!Number.isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }

    return 0;
  }

  private async persistCatchupSnapshot(
    workspaceId: string,
    update: Record<string, any>,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!workspace) return;

    const settings = (workspace.providerSettings as any) || {};
    const sessionMeta = settings.whatsappApiSession || {};

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          whatsappApiSession: {
            ...sessionMeta,
            ...update,
          },
        },
      },
    });
  }

  private getLockKey(workspaceId: string) {
    return `whatsapp:catchup:${workspaceId}`;
  }

  private getCooldownKey(workspaceId: string) {
    return `whatsapp:catchup:cooldown:${workspaceId}`;
  }

  private async releaseLock(workspaceId: string, token: string) {
    const lockKey = this.getLockKey(workspaceId);
    const current = await this.redis.get(lockKey);
    if (current === token) {
      await this.redis.del(lockKey);
    }
  }
}
