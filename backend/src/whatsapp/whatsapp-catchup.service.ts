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
import { AgentEventsService } from './agent-events.service';

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
  private readonly maxPagesPerChat = Math.max(
    1,
    parseInt(process.env.WAHA_CATCHUP_MAX_PAGES_PER_CHAT || '10', 10) || 10,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly inboundProcessor: InboundProcessorService,
    @InjectRedis() private readonly redis: Redis,
    private readonly agentEvents: AgentEventsService,
  ) {}

  private isNowebStoreMisconfigured(error: unknown): boolean {
    const message = String(
      typeof error === 'string' ? error : (error as any)?.message || error || '',
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

  private async getStructuralBlockReason(
    workspaceId: string,
  ): Promise<string | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!workspace) return null;

    const settings = (workspace.providerSettings as any) || {};
    const sessionMeta = (settings.whatsappApiSession || {}) as Record<
      string,
      any
    >;
    const recoveryBlockedReason = String(
      sessionMeta.recoveryBlockedReason || '',
    ).trim();

    return this.isNowebStoreMisconfigured(recoveryBlockedReason)
      ? recoveryBlockedReason || 'noweb_store_misconfigured'
      : null;
  }

  async triggerCatchup(
    workspaceId: string,
    reason = 'unknown',
  ): Promise<{ scheduled: boolean; reason?: string }> {
    const structuralBlockReason = await this.getStructuralBlockReason(
      workspaceId,
    );
    if (structuralBlockReason) {
      return { scheduled: false, reason: structuralBlockReason };
    }

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
    let importedMessages = 0;
    let touchedChats = 0;
    let processedChats = 0;
    let hadOverflow = false;
    let estimatedTotalChats = 0;

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

      await this.agentEvents.publish({
        type: 'thought',
        workspaceId,
        phase: 'sync',
        message: 'Sincronizando suas conversas',
      });

      const since = this.resolveCatchupSince(sessionMeta);
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

        if (pass === 0) {
          estimatedTotalChats = pendingChats.length;
          await this.agentEvents.publish({
            type: 'status',
            workspaceId,
            phase: 'sync_start',
            message:
              estimatedTotalChats > 0
                ? `Começando a sincronização de ${estimatedTotalChats} conversas.`
                : 'Não encontrei novas conversas para sincronizar.',
            meta: {
              totalChats: estimatedTotalChats,
              reason,
            },
          });
        }

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

          if (
            processedChats === 1 ||
            processedChats === estimatedTotalChats ||
            processedChats % 5 === 0
          ) {
            await this.agentEvents.publish({
              type: 'status',
              workspaceId,
              phase: 'sync_progress',
              message: `Sincronizando conversa ${processedChats} de ${Math.max(
                estimatedTotalChats,
                processedChats,
              )}.`,
              meta: {
                processedChats,
                totalChats: Math.max(estimatedTotalChats, processedChats),
                importedMessages,
              },
            });
          }

          const {
            messages,
            hadOverflow: chatOverflow,
          } = await this.loadCatchupMessages(workspaceId, chat, since);

          if (chatOverflow) {
            hadOverflow = true;
          }

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
        lastCatchupError: null,
        lastCatchupFailedAt: null,
        recoveryBlockedReason: null,
        recoveryBlockedAt: null,
      });

      this.logger.log(
        `catchup_completed workspace=${workspaceId} chats=${touchedChats} imported=${importedMessages} overflow=${hadOverflow} reason=${reason}`,
      );
      await this.agentEvents.publish({
        type: 'status',
        workspaceId,
        phase: 'sync_complete',
        persistent: true,
        message:
          importedMessages > 0
            ? `Sincronização concluída. Importei ${importedMessages} mensagens em ${touchedChats} conversas.`
            : 'Sincronização concluída. Não encontrei mensagens novas para importar.',
        meta: {
          importedMessages,
          touchedChats,
          processedChats,
          overflow: hadOverflow,
          reason,
        },
      });
    } catch (error: any) {
      const errorMessage = String(error?.message || 'erro desconhecido');
      const recoveryBlockedReason = this.isNowebStoreMisconfigured(error)
        ? 'noweb_store_misconfigured'
        : null;

      await this.persistCatchupSnapshot(workspaceId, {
        lastCatchupReason: reason,
        lastCatchupError: errorMessage,
        lastCatchupFailedAt: new Date().toISOString(),
        recoveryBlockedReason,
        recoveryBlockedAt: recoveryBlockedReason
          ? new Date().toISOString()
          : null,
      });

      await this.agentEvents.publish({
        type: 'error',
        workspaceId,
        phase: 'sync_error',
        persistent: true,
        message: recoveryBlockedReason
          ? 'Não consegui sincronizar suas conversas porque o WAHA está sem NOWEB store habilitado. Corrija a configuração da sessão antes de tentar reconectar.'
          : `Não consegui sincronizar suas conversas. Motivo: ${errorMessage}.`,
        meta: {
          importedMessages,
          touchedChats,
          processedChats,
          overflow: hadOverflow,
          reason,
          recoveryBlockedReason,
          errorMessage,
        },
      });
      throw error;
    } finally {
      await this.releaseLock(workspaceId, token);
    }
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

  private async loadCatchupMessages(
    workspaceId: string,
    chat: WahaChatSummary,
    since: Date,
  ): Promise<{ messages: WahaChatMessage[]; hadOverflow: boolean }> {
    const collected: WahaChatMessage[] = [];
    const seenIds = new Set<string>();
    let hadOverflow = false;
    let offset = 0;
    const unreadCount = Math.max(0, Number(chat.unreadCount || 0) || 0);

    for (let page = 0; page < this.maxPagesPerChat; page += 1) {
      const rawMessages = await this.whatsappApi.getChatMessages(
        workspaceId,
        chat.id,
        {
          limit: this.maxMessagesPerChat,
          offset,
        },
      );
      const normalizedPage = this.normalizeMessages(rawMessages, chat.id)
        .filter((message) => !message.fromMe)
        .filter((message) => !!message.id)
        .sort((a, b) => this.resolveTimestamp(a) - this.resolveTimestamp(b));

      if (!normalizedPage.length) {
        break;
      }

      if (normalizedPage.length >= this.maxMessagesPerChat) {
        hadOverflow = true;
      }

      for (const message of normalizedPage) {
        if (seenIds.has(message.id)) continue;
        seenIds.add(message.id);
        collected.push(message);
      }

      offset += normalizedPage.length;

      if (normalizedPage.length < this.maxMessagesPerChat) {
        break;
      }

      if (unreadCount > 0 && collected.length >= unreadCount) {
        break;
      }

      if (
        unreadCount === 0 &&
        normalizedPage.every(
          (message) => this.resolveTimestamp(message) < since.getTime(),
        )
      ) {
        break;
      }
    }

    if (unreadCount > 0 && collected.length < unreadCount) {
      hadOverflow = true;
    }

    return {
      messages:
        unreadCount > 0
          ? collected
          : collected.filter(
              (message) => this.resolveTimestamp(message) >= since.getTime(),
            ),
      hadOverflow,
    };
  }

  private async releaseLock(workspaceId: string, token: string) {
    const lockKey = this.getLockKey(workspaceId);
    const current = await this.redis.get(lockKey);
    if (current === token) {
      await this.redis.del(lockKey);
    }
  }
}
