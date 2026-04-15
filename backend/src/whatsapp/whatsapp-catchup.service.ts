import { randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
// messageLimit: this service imports messages, does not send; rate limit enforced at send time
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import {
  AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
  buildSweepUnreadConversationsJobData,
} from '../contracts/autopilot-jobs';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import { AgentEventsService } from './agent-events.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { InboundMessage, InboundProcessorService } from './inbound-processor.service';
import { asProviderSettings } from './provider-settings.types';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import {
  WahaChatMessage,
  WahaChatSummary,
  WahaLidMapping,
} from './providers/whatsapp-api.provider';
import { WorkerRuntimeService } from './worker-runtime.service';

const D__D_S____S_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;
const LID_RE = /@lid$/i;

function normalizeOptionalText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

type CatchupRunSummary = {
  importedMessages: number;
  touchedChats: number;
  processedChats: number;
  overflow: boolean;
};

type CatchupBackfillCursor = {
  chatId: string;
  activityTimestamp: number;
  updatedAt: string;
} | null;

const CATCHUP_SWEEP_LIMIT = Math.max(
  1,
  Math.min(2000, Number.parseInt(process.env.WAHA_CATCHUP_SWEEP_LIMIT || '500', 10) || 500),
);

@Injectable()
export class WhatsAppCatchupService {
  private readonly logger = new Logger(WhatsAppCatchupService.name);
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
  private readonly lockTtlSeconds = 180;
  private readonly minTriggerIntervalSeconds = Math.max(
    15,
    Number.parseInt(process.env.WAHA_CATCHUP_MIN_TRIGGER_INTERVAL_SECONDS || '60', 10) || 60,
  );
  private readonly maxChats = Math.max(
    1,
    Number.parseInt(process.env.WAHA_CATCHUP_MAX_CHATS || '1000', 10) || 1000,
  );
  private readonly maxMessagesPerChat = Math.max(
    1,
    Number.parseInt(process.env.WAHA_CATCHUP_MAX_MESSAGES_PER_CHAT || '100', 10) || 100,
  );
  private readonly lookbackMs = Math.max(
    60_000,
    Number.parseInt(process.env.WAHA_CATCHUP_LOOKBACK_MS || `${12 * 60 * 60 * 1000}`, 10) ||
      12 * 60 * 60 * 1000,
  );
  private readonly firstRunLookbackMs = Math.max(
    this.lookbackMs,
    Number.parseInt(
      process.env.WAHA_CATCHUP_FIRST_RUN_LOOKBACK_MS || `${30 * 24 * 60 * 60 * 1000}`,
      10,
    ) || 30 * 24 * 60 * 60 * 1000,
  );
  private readonly maxPasses = Math.max(
    1,
    Number.parseInt(process.env.WAHA_CATCHUP_MAX_PASSES || '5', 10) || 5,
  );
  private readonly maxPagesPerChat = Math.max(
    1,
    Number.parseInt(process.env.WAHA_CATCHUP_MAX_PAGES_PER_CHAT || '10', 10) || 10,
  );
  private readonly fallbackChatsPerPass = Math.max(
    0,
    (() => {
      const parsed = Number.parseInt(process.env.WAHA_CATCHUP_FALLBACK_CHATS_PER_PASS || '100', 10);
      return Number.isFinite(parsed) ? parsed : 0;
    })(),
  );
  private readonly includeZeroUnreadActivity =
    String(process.env.WAHA_CATCHUP_INCLUDE_ZERO_UNREAD_ACTIVITY || 'true').toLowerCase() ===
    'true';
  private readonly fallbackPagesPerChat = Math.max(
    1,
    Number.parseInt(process.env.WAHA_CATCHUP_FALLBACK_PAGES_PER_CHAT || '2', 10) || 2,
  );
  private readonly markReadWithoutReplyOnImport =
    String(process.env.WAHA_CATCHUP_MARK_READ_WITHOUT_REPLY || 'true')
      .trim()
      .toLowerCase() === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    @Inject(forwardRef(() => InboundProcessorService))
    private readonly inboundProcessor: InboundProcessorService,
    @Inject(forwardRef(() => CiaRuntimeService))
    private readonly ciaRuntime: CiaRuntimeService,
    private readonly inbox: InboxService,
    private readonly workerRuntime: WorkerRuntimeService,
    @InjectRedis() private readonly redis: Redis,
    private readonly agentEvents: AgentEventsService,
  ) {}

  private isNowebStoreMisconfigured(error: unknown): boolean {
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

  private isSessionMissingError(error: unknown): boolean {
    const message = String(
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : normalizeOptionalText(error),
    ).toLowerCase();

    return (
      message.includes('session') &&
      (message.includes('does not exist') ||
        message.includes('not found') ||
        message.includes('404'))
    );
  }

  private isGuestWorkspace(workspaceName?: string, settings?: Record<string, any> | null): boolean {
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
      settings?.auth?.anonymous === true
    );
  }

  private getLifecycleBlockReason(
    workspaceName?: string,
    settings?: Record<string, any> | null,
  ): string | null {
    const lifecycle = (settings?.whatsappLifecycle || {}) as Record<string, any>;

    if (this.isGuestWorkspace(workspaceName, settings)) {
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

  private async getCatchupBlockReason(workspaceId: string): Promise<string | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, providerSettings: true },
    });
    if (!workspace) return null;

    const settings = asProviderSettings(workspace.providerSettings);
    const lifecycleBlockReason = this.getLifecycleBlockReason(
      workspace.name || undefined,
      settings,
    );
    if (lifecycleBlockReason) {
      return lifecycleBlockReason;
    }

    const sessionMeta = (settings.whatsappApiSession || {}) as Record<string, any>;
    const recoveryBlockedReason = String(sessionMeta.recoveryBlockedReason || '').trim();

    return this.isNowebStoreMisconfigured(recoveryBlockedReason)
      ? recoveryBlockedReason || 'noweb_store_misconfigured'
      : null;
  }

  async triggerCatchup(
    workspaceId: string,
    reason = 'unknown',
  ): Promise<{ scheduled: boolean; reason?: string }> {
    const blockReason = await this.getCatchupBlockReason(workspaceId);
    if (blockReason) {
      return { scheduled: false, reason: blockReason };
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
    const acquired = await this.redis.set(lockKey, token, 'EX', this.lockTtlSeconds, 'NX');

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

  async runCatchupNow(
    workspaceId: string,
    reason = 'manual_sync',
  ): Promise<({ scheduled: true } & CatchupRunSummary) | { scheduled: false; reason?: string }> {
    const blockReason = await this.getCatchupBlockReason(workspaceId);
    if (blockReason) {
      return { scheduled: false, reason: blockReason };
    }

    const lockKey = this.getLockKey(workspaceId);
    const token = randomUUID();
    const acquired = await this.redis.set(lockKey, token, 'EX', this.lockTtlSeconds, 'NX');

    if (acquired !== 'OK') {
      return { scheduled: false, reason: 'catchup_locked' };
    }

    const summary = await this.runCatchup(workspaceId, reason, token);
    return {
      scheduled: true,
      ...summary,
    };
  }

  private async runCatchup(
    workspaceId: string,
    reason: string,
    token: string,
  ): Promise<CatchupRunSummary> {
    let importedMessages = 0;
    let touchedChats = 0;
    let processedChats = 0;
    let hadOverflow = false;
    let estimatedTotalChats = 0;
    let nextBackfillCursor: CatchupBackfillCursor = null;

    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, providerSettings: true },
      });
      if (!workspace) {
        return {
          importedMessages,
          touchedChats,
          processedChats,
          overflow: hadOverflow,
        };
      }

      await this.sanitizePlaceholderContacts(workspaceId);

      const settings = asProviderSettings(workspace.providerSettings) as Record<string, any>;
      const providerType = await this.providerRegistry.getProviderType(workspaceId);
      const lifecycleBlockReason = this.getLifecycleBlockReason(
        workspace.name || undefined,
        settings,
      );
      if (lifecycleBlockReason) {
        this.logger.debug(`Skipping catchup for ${workspaceId}: ${lifecycleBlockReason}`);
        return;
      }

      const sessionMeta = (settings.whatsappApiSession || {}) as Record<string, any>;
      const firstSync = !this.normalizeTimestamp(sessionMeta.lastCatchupAt);
      const backfillCursor = this.resolveBackfillCursor(sessionMeta);
      nextBackfillCursor = backfillCursor;
      const workspaceSelfPhone = await this.resolveWorkspaceSelfPhone(workspaceId, settings);
      const workspaceSelfIds = Array.isArray(settings?.whatsappApiSession?.selfIds)
        ? settings.whatsappApiSession.selfIds
            .map((value: any) => String(value || '').trim())
            .filter(Boolean)
        : [];
      const lidMappings = await this.getLidPnMap(workspaceId);

      await this.agentEvents.publish({
        type: 'thought',
        workspaceId,
        phase: 'sync',
        message: 'Sincronizando suas conversas',
      });

      const since = this.resolveCatchupSince(sessionMeta);
      const processedChatIds = new Set<string>();

      for (let pass = 0; pass < this.maxPasses; pass += 1) {
        const rawChats = await this.providerRegistry.getChats(workspaceId);
        const pendingChats = this.normalizeChats(rawChats)
          .filter((chat) => !!chat.id)
          .filter(
            (chat) =>
              !this.isWorkspaceSelfChatId(
                chat.id,
                workspaceSelfPhone,
                workspaceSelfIds,
                lidMappings,
              ),
          )
          .filter((chat) => !processedChatIds.has(chat.id));
        const { chats: candidateChats, fallbackChatIds } = this.selectCandidateChats(
          pendingChats,
          since,
          nextBackfillCursor,
        );

        if (pass === 0) {
          estimatedTotalChats = candidateChats.length;
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

        const chats = candidateChats.slice(0, this.maxChats);
        if (!chats.length) {
          break;
        }

        if (candidateChats.length > chats.length || pendingChats.length > candidateChats.length) {
          hadOverflow = true;
        }

        for (const chat of chats) {
          processedChatIds.add(chat.id);
          processedChats += 1;

          if (fallbackChatIds.has(chat.id)) {
            nextBackfillCursor = {
              chatId: chat.id,
              activityTimestamp: this.resolveChatActivityTimestamp(chat),
              updatedAt: new Date().toISOString(),
            };
          }

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

          const { messages, hadOverflow: chatOverflow } = await this.loadCatchupMessages(
            workspaceId,
            chat,
            since,
            {
              fallbackScan: fallbackChatIds.has(chat.id),
              firstSync,
            },
          );

          if (chatOverflow) {
            hadOverflow = true;
          }

          await this.reconcileRemoteChatState(workspaceId, chat).catch((error) => {
            this.logger.warn(
              `catchup_reconcile_failed workspace=${workspaceId} chat=${chat.id}: ${error?.message || error}`,
            );
          });

          if (!messages.length) {
            continue;
          }

          touchedChats += 1;

          for (const message of messages) {
            if (message.fromMe) {
              const persisted = await this.persistHistoricalOutboundMessage(workspaceId, message);
              if (persisted) {
                importedMessages += 1;
              }
              continue;
            }

            const inbound = this.toInboundMessage(workspaceId, message, providerType);
            if (!inbound) continue;

            const result = await this.inboundProcessor.process(inbound);
            if (!result.deduped) {
              importedMessages += 1;
            }
          }

          if (this.markReadWithoutReplyOnImport) {
            await this.providerRegistry
              .readChatMessages(workspaceId, chat.id)
              .catch((err) => this.logger.warn('Failed to mark chat as read', err.message));
          }
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
        backfillCursor: nextBackfillCursor,
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

      await this.scheduleUnreadSweep(workspaceId, {
        reason,
        processedChats,
        touchedChats,
      }).catch((error) => {
        this.logger.warn(
          `catchup_sweep_schedule_failed workspace=${workspaceId}: ${error?.message || error}`,
        );
      });

      return {
        importedMessages,
        touchedChats,
        processedChats,
        overflow: hadOverflow,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      const errorMessage = String(errorInstanceofError?.message || 'erro desconhecido');
      const sessionMissing = this.isSessionMissingError(error);
      const recoveryBlockedReason =
        !sessionMissing && this.isNowebStoreMisconfigured(error)
          ? 'noweb_store_misconfigured'
          : null;

      await this.persistCatchupSnapshot(workspaceId, {
        ...(sessionMissing
          ? {
              status: 'disconnected',
              rawStatus: 'SESSION_MISSING',
              disconnectReason: errorMessage,
              phoneNumber: null,
              pushName: null,
              qrCode: null,
              connectedAt: null,
            }
          : {}),
        lastCatchupReason: reason,
        lastCatchupError: errorMessage,
        lastCatchupFailedAt: new Date().toISOString(),
        recoveryBlockedReason,
        recoveryBlockedAt: recoveryBlockedReason ? new Date().toISOString() : null,
      });

      await this.agentEvents.publish({
        type: 'error',
        workspaceId,
        phase: 'sync_error',
        persistent: true,
        message: sessionMissing
          ? 'Não consegui sincronizar porque a sessão do WhatsApp não existe mais no WAHA. Reconecte pelo QR code.'
          : recoveryBlockedReason
            ? 'Não consegui sincronizar suas conversas porque o WAHA está sem NOWEB store habilitado. Corrija a configuração da sessão antes de tentar reconectar.'
            : `Não consegui sincronizar suas conversas. Motivo: ${errorMessage}.`,
        meta: {
          importedMessages,
          touchedChats,
          processedChats,
          overflow: hadOverflow,
          reason,
          sessionMissing,
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
    const lastCatchupAt = this.normalizeTimestamp(sessionMeta.lastCatchupAt);
    if (lastCatchupAt) {
      return lastCatchupAt;
    }

    return new Date(Date.now() - this.firstRunLookbackMs);
  }

  private resolveChatActivityTimestamp(chat: WahaChatSummary): number {
    return Math.max(Number(chat.timestamp || 0) || 0, Number(chat.lastMessageTimestamp || 0) || 0);
  }

  private sortChatsByPriority(chats: WahaChatSummary[], since: Date): WahaChatSummary[] {
    return [...chats].sort((a, b) => {
      const unreadDelta = (b.unreadCount || 0) - (a.unreadCount || 0);
      if (unreadDelta !== 0) return unreadDelta;

      const activityDelta =
        this.resolveChatActivityTimestamp(b) - this.resolveChatActivityTimestamp(a);
      if (activityDelta !== 0) return activityDelta;

      const replyPendingDelta =
        Number(this.isRemoteChatAwaitingReply(b)) - Number(this.isRemoteChatAwaitingReply(a));
      if (replyPendingDelta !== 0) return replyPendingDelta;

      const recentDelta =
        Number(this.resolveChatActivityTimestamp(b) >= since.getTime()) -
        Number(this.resolveChatActivityTimestamp(a) >= since.getTime());
      if (recentDelta !== 0) return recentDelta;

      return String(a.id).localeCompare(String(b.id));
    });
  }

  private selectCandidateChats(
    chats: WahaChatSummary[],
    since: Date,
    cursor?: CatchupBackfillCursor,
  ): {
    chats: WahaChatSummary[];
    fallbackChatIds: Set<string>;
  } {
    const priorityChats = this.sortChatsByPriority(
      chats.filter(
        (chat) =>
          (chat.unreadCount || 0) > 0 ||
          this.isRemoteChatAwaitingReply(chat) ||
          (this.includeZeroUnreadActivity &&
            this.resolveChatActivityTimestamp(chat) >= since.getTime()),
      ),
      since,
    );
    const staleChats = this.sortChatsByPriority(
      chats.filter(
        (chat) =>
          (chat.unreadCount || 0) <= 0 &&
          !this.isRemoteChatAwaitingReply(chat) &&
          this.resolveChatActivityTimestamp(chat) < since.getTime(),
      ),
      since,
    );
    const fallbackChats = this.rotateFallbackChatsByCursor(staleChats, cursor).slice(
      0,
      this.fallbackChatsPerPass,
    );

    const deduped = new Map<string, WahaChatSummary>();
    for (const chat of [...priorityChats, ...fallbackChats]) {
      if (!deduped.has(chat.id)) {
        deduped.set(chat.id, chat);
      }
    }

    return {
      chats: Array.from(deduped.values()),
      fallbackChatIds: new Set(fallbackChats.map((chat) => chat.id)),
    };
  }

  private resolveBackfillCursor(sessionMeta: Record<string, any>): CatchupBackfillCursor {
    const rawCursor = sessionMeta?.backfillCursor;
    if (!rawCursor || typeof rawCursor !== 'object') {
      return null;
    }

    const chatId = String(rawCursor.chatId || '').trim();
    const activityTimestamp = Number(rawCursor.activityTimestamp || rawCursor.timestamp || 0) || 0;
    const updatedAt = this.normalizeTimestamp(rawCursor.updatedAt);

    if (!chatId || activityTimestamp <= 0) {
      return null;
    }

    return {
      chatId,
      activityTimestamp,
      updatedAt: updatedAt?.toISOString() || new Date(activityTimestamp).toISOString(),
    };
  }

  private rotateFallbackChatsByCursor(
    chats: WahaChatSummary[],
    cursor?: CatchupBackfillCursor,
  ): WahaChatSummary[] {
    if (!cursor || !chats.length) {
      return chats;
    }

    const chatIndex = chats.findIndex((chat) => chat.id === cursor.chatId);
    if (chatIndex >= 0) {
      const start = (chatIndex + 1) % chats.length;
      return start === 0 ? chats : [...chats.slice(start), ...chats.slice(0, start)];
    }

    const activityIndex = chats.findIndex(
      (chat) => this.resolveChatActivityTimestamp(chat) < cursor.activityTimestamp,
    );
    if (activityIndex > 0) {
      return [...chats.slice(activityIndex), ...chats.slice(0, activityIndex)];
    }

    return chats;
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
        id: chat?.id?._serialized || chat?.id || chat?.chatId || chat?.wid || '',
        unreadCount: Number(chat?.unreadCount || chat?.unread || 0) || 0,
        timestamp: this.resolveTimestamp(chat),
        lastMessageTimestamp:
          Number(
            chat?.lastMessageTimestamp ||
              chat?.lastMessage?.timestamp ||
              chat?.lastMessage?._data?.messageTimestamp ||
              chat?.last_time ||
              chat?._chat?.conversationTimestamp ||
              0,
          ) || 0,
        lastMessageRecvTimestamp:
          Number(
            chat?.lastMessageRecvTimestamp ||
              chat?._chat?.lastMessageRecvTimestamp ||
              chat?.lastMessage?.timestamp ||
              chat?.lastMessage?._data?.messageTimestamp ||
              chat?._chat?.conversationTimestamp ||
              0,
          ) || 0,
        lastMessageFromMe:
          typeof chat?.lastMessage?.fromMe === 'boolean'
            ? chat.lastMessage.fromMe
            : typeof chat?.lastMessage?._data?.id?.fromMe === 'boolean'
              ? chat.lastMessage._data.id.fromMe
              : typeof chat?.lastMessage?.id?.fromMe === 'boolean'
                ? chat.lastMessage.id.fromMe
                : null,
        name:
          chat?.name ||
          chat?.contact?.pushName ||
          chat?.lastMessage?._data?.verifiedBizName ||
          null,
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
      id: message?.id?._serialized || message?.id?.id || message?.key?.id || message?.id || '',
      from: this.resolvePreferredChatId(message) || message?.from,
      to: message?.to,
      fromMe: message?.fromMe === true,
      body: message?.body || message?.text?.body || '',
      type: message?.type,
      hasMedia: message?.hasMedia === true,
      mediaUrl: message?.mediaUrl || message?.media?.url,
      mimetype: message?.mimetype || message?.media?.mimetype,
      timestamp: this.resolveTimestamp(message),
      chatId: this.resolvePreferredChatId(message) || fallbackChatId,
      raw: message,
    }));
  }

  private toInboundMessage(
    workspaceId: string,
    message: WahaChatMessage,
    provider: InboundMessage['provider'] = 'meta-cloud',
  ): InboundMessage | null {
    const providerMessageId = String(message.id || '').trim();
    const from = String(message.from || message.chatId || '').trim();

    if (!providerMessageId || !from) {
      return null;
    }

    return {
      workspaceId,
      provider,
      ingestMode: 'catchup',
      createdAt: this.normalizeTimestamp(message.timestamp),
      providerMessageId,
      from,
      to: message.to,
      senderName: this.extractSenderName(message.raw),
      type: this.mapInboundType(message.type),
      text: message.body,
      mediaUrl: message.mediaUrl,
      mediaMime: message.mimetype,
      raw: message.raw,
    };
  }

  private resolvePreferredChatId(payload: any): string | null {
    const candidates = [
      payload?._data?.key?.remoteJidAlt,
      payload?.key?.remoteJidAlt,
      payload?.remoteJidAlt,
      payload?.chatId,
      payload?.from,
      payload?._data?.key?.remoteJid,
      payload?.key?.remoteJid,
      payload?.to,
    ]
      .filter((candidate) => typeof candidate === 'string')
      .map((candidate) => String(candidate).trim())
      .filter(Boolean);

    if (!candidates.length) {
      return null;
    }

    return candidates.find((candidate) => !candidate.includes('@lid')) || candidates[0] || null;
  }

  private extractSenderName(payload: any): string | undefined {
    const candidates = [
      payload?._data?.pushName,
      payload?.pushName,
      payload?._data?.notifyName,
      payload?.notifyName,
      payload?.author,
      payload?.senderName,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const normalized = candidate.trim();
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private mapInboundType(type?: string): InboundMessage['type'] {
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
      value?._chat?.conversationTimestamp,
      value?._chat?.lastMessageRecvTimestamp,
      value?.lastMessage?.timestamp,
      value?.lastMessage?._data?.messageTimestamp,
      value?.conversationTimestamp,
      value?.lastMessageRecvTimestamp,
      value?.lastMessageSentTimestamp,
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

  private async persistCatchupSnapshot(workspaceId: string, update: Record<string, any>) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!workspace) return;

    const settings = asProviderSettings(workspace.providerSettings);
    const sessionMeta = settings.whatsappApiSession || {};

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: toPrismaJsonValue({
          ...settings,
          ...(typeof update.status === 'string' ? { connectionStatus: update.status } : {}),
          whatsappApiSession: {
            ...sessionMeta,
            ...update,
          },
        }),
      },
    });
  }

  private async scheduleUnreadSweep(
    workspaceId: string,
    input: {
      reason: string;
      processedChats: number;
      touchedChats: number;
    },
  ): Promise<void> {
    if (!workspaceId) {
      return;
    }

    const triggeredBy = `catchup:${input.reason}`;
    const workerAvailable = await this.workerRuntime.isAvailable().catch(() => false);

    if (!workerAvailable) {
      await this.ciaRuntime.startBacklogRun(
        workspaceId,
        'reply_all_recent_first',
        CATCHUP_SWEEP_LIMIT,
        {
          autoStarted: true,
          runtimeState: 'EXECUTING_BACKLOG',
          triggeredBy,
        },
      );

      await this.agentEvents.publish({
        type: 'status',
        workspaceId,
        phase: 'sync_queue_unread',
        persistent: true,
        message:
          'Sincronização concluída. O worker não está saudável, então vou zerar as conversas não lidas diretamente pelo fallback inline.',
        meta: {
          reason: input.reason,
          processedChats: input.processedChats,
          touchedChats: input.touchedChats,
          limit: CATCHUP_SWEEP_LIMIT,
          inlineFallback: true,
        },
      });
      return;
    }

    await autopilotQueue.add(
      AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
      buildSweepUnreadConversationsJobData({
        workspaceId,
        runId: randomUUID(),
        limit: CATCHUP_SWEEP_LIMIT,
        mode: 'reply_all_recent_first',
        triggeredBy,
      }),
      {
        jobId: buildQueueJobId('catchup-sweep-unread', workspaceId),
        removeOnComplete: true,
      },
    );

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'sync_queue_unread',
      persistent: true,
      message:
        input.processedChats > 0
          ? 'Sincronização concluída. Vou começar imediatamente a zerar as conversas não lidas.'
          : 'Sincronização concluída. Vou conferir imediatamente se ainda restam conversas não lidas no WAHA.',
      meta: {
        reason: input.reason,
        processedChats: input.processedChats,
        touchedChats: input.touchedChats,
        limit: CATCHUP_SWEEP_LIMIT,
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
    options?: {
      fallbackScan?: boolean;
      firstSync?: boolean;
    },
  ): Promise<{ messages: WahaChatMessage[]; hadOverflow: boolean }> {
    const collected: WahaChatMessage[] = [];
    const seenIds = new Set<string>();
    let hadOverflow = false;
    let offset = 0;
    const unreadCount = Math.max(0, Number(chat.unreadCount || 0) || 0);
    const fallbackScan = options?.fallbackScan === true;
    const firstSync = options?.firstSync === true;
    const maxPages = fallbackScan
      ? Math.min(this.maxPagesPerChat, this.fallbackPagesPerChat)
      : this.maxPagesPerChat;

    for (let page = 0; page < maxPages; page += 1) {
      const rawMessages = await this.providerRegistry.getChatMessages(workspaceId, chat.id, {
        limit: this.maxMessagesPerChat,
        offset,
      });
      const normalizedPage = this.normalizeMessages(rawMessages, chat.id)
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

      const inboundCollectedCount = collected.filter((message) => !message.fromMe).length;

      if (unreadCount > 0 && inboundCollectedCount >= unreadCount) {
        break;
      }

      if (
        unreadCount === 0 &&
        !firstSync &&
        !fallbackScan &&
        normalizedPage.every((message) => this.resolveTimestamp(message) < since.getTime())
      ) {
        break;
      }
    }

    if (unreadCount > 0 && collected.length < unreadCount) {
      hadOverflow = true;
    }

    const canonicalMessages = await this.canonicalizeMessages(workspaceId, collected);

    return {
      messages:
        unreadCount > 0 || fallbackScan || firstSync
          ? canonicalMessages
          : canonicalMessages.filter(
              (message) => this.resolveTimestamp(message) >= since.getTime(),
            ),
      hadOverflow,
    };
  }

  private isRemoteChatAwaitingReply(chat: WahaChatSummary): boolean {
    return chat.lastMessageFromMe === false;
  }

  private normalizeTimestamp(value?: Date | string | number | null): Date | null {
    if (!value && value !== 0) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalized = value > 1e12 ? value : value * 1000;
      const parsed = new Date(normalized);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      const normalized = numeric > 1e12 ? numeric : numeric * 1000;
      const parsed = new Date(normalized);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async persistHistoricalOutboundMessage(
    workspaceId: string,
    message: WahaChatMessage,
  ): Promise<boolean> {
    const phone = this.normalizePhone(String(message.chatId || message.from || '').trim());
    const providerMessageId = String(message.id || '').trim();
    if (!phone || !providerMessageId) {
      return false;
    }

    try {
      await this.inbox.saveMessageByPhone({
        workspaceId,
        phone,
        content: message.body || '',
        direction: 'OUTBOUND',
        externalId: providerMessageId,
        type: this.mapInboundType(message.type).toUpperCase(),
        mediaUrl: message.mediaUrl,
        status: 'READ',
        createdAt: this.normalizeTimestamp(message.timestamp),
        countAsUnread: false,
        resetUnreadOnOutbound: false,
        silent: true,
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  private async releaseLock(workspaceId: string, token: string) {
    const lockKey = this.getLockKey(workspaceId);
    const current = await this.redis.get(lockKey);
    if (current === token) {
      await this.redis.del(lockKey);
    }
  }

  private async reconcileRemoteChatState(
    workspaceId: string,
    chat: WahaChatSummary,
  ): Promise<void> {
    const chatId = String(chat.id || '').trim();
    if (!chatId || chatId.includes('@g.us')) {
      return;
    }

    const phone = await this.resolveCanonicalPhone(workspaceId, chatId);
    if (!phone) {
      return;
    }

    const existingContact = await this.prisma.contact.findUnique({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      select: {
        id: true,
        name: true,
        customFields: true,
      },
    });
    const existingCustomFields = this.normalizeJsonObject(existingContact?.customFields);
    const existingRemotePushName = String(existingCustomFields.remotePushName || '').trim();
    const existingStoredName = String(existingContact?.name || '').trim();
    const remotePushName =
      this.resolveRemoteContactName(chat) ||
      (!this.isPlaceholderContactName(existingRemotePushName, phone)
        ? existingRemotePushName
        : '') ||
      null;
    const contactName =
      remotePushName ||
      (!this.isPlaceholderContactName(existingStoredName, phone) ? existingStoredName : '') ||
      null;
    const mappings = await this.getLidPnMap(workspaceId);
    const resolvedChatId = this.resolveCanonicalChatId(chatId, mappings);
    const contact = await this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      update: {
        name: contactName,
        customFields: {
          ...existingCustomFields,
          remotePushName: remotePushName || undefined,
          remotePushNameUpdatedAt: remotePushName
            ? new Date().toISOString()
            : existingCustomFields.remotePushNameUpdatedAt || undefined,
          lastRemoteChatId: chatId,
          lastResolvedChatId: resolvedChatId || chatId,
        } satisfies Record<string, unknown> as Prisma.InputJsonValue,
      },
      create: {
        workspaceId,
        phone,
        name: contactName,
        customFields: {
          remotePushName: remotePushName || undefined,
          remotePushNameUpdatedAt: remotePushName ? new Date().toISOString() : undefined,
          lastRemoteChatId: chatId,
          lastResolvedChatId: resolvedChatId || chatId,
        } satisfies Record<string, unknown> as Prisma.InputJsonValue,
      },
      select: {
        id: true,
      },
    });

    const savedToWhatsapp = contactName
      ? await this.providerRegistry
          .upsertContactProfile(workspaceId, {
            phone,
            name: contactName,
          })
          .catch(() => false)
      : false;

    if (savedToWhatsapp) {
      await this.prisma.contact.updateMany({
        where: { id: contact.id, workspaceId },
        data: {
          customFields: {
            ...this.normalizeJsonObject(
              (
                await this.prisma.contact.findFirst({
                  where: { id: contact.id, workspaceId },
                  select: { customFields: true },
                })
              )?.customFields,
            ),
            whatsappSavedAt: new Date().toISOString(),
            lastRemoteChatId: chatId,
            lastResolvedChatId: resolvedChatId || chatId,
            remotePushName: remotePushName || undefined,
          } satisfies Record<string, unknown> as Prisma.InputJsonValue,
        },
      });
    }

    const remoteActivityAt = this.normalizeTimestamp(this.resolveChatActivityTimestamp(chat));
    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        workspaceId,
        contactId: contact.id,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        unreadCount: true,
        lastMessageAt: true,
      },
    });

    if (!existingConversation) {
      await this.prisma.conversation.create({
        data: {
          workspaceId,
          contactId: contact.id,
          status: 'OPEN',
          priority: 'MEDIUM',
          channel: 'WHATSAPP',
          mode: 'AI',
          unreadCount: Math.max(0, Number(chat.unreadCount || 0) || 0),
          lastMessageAt: remoteActivityAt || new Date(),
        },
      });
      return;
    }

    const currentLastMessageAt =
      existingConversation.lastMessageAt instanceof Date
        ? existingConversation.lastMessageAt
        : this.normalizeTimestamp(existingConversation.lastMessageAt);

    await this.prisma.conversation.updateMany({
      where: { id: existingConversation.id, workspaceId },
      data: {
        unreadCount: Math.max(
          0,
          Number(existingConversation.unreadCount || 0) || 0,
          Number(chat.unreadCount || 0) || 0,
        ),
        lastMessageAt:
          remoteActivityAt && (!currentLastMessageAt || remoteActivityAt > currentLastMessageAt)
            ? remoteActivityAt
            : currentLastMessageAt || new Date(),
      },
    });
  }

  private normalizePhone(phone: string): string {
    return String(phone || '')
      .replace(/\D/g, '')
      .replace('@c.us', '')
      .replace('@s.whatsapp.net', '');
  }

  private normalizeJsonObject(value: unknown): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...(value as Record<string, any>) };
    }
    return {};
  }

  private async sanitizePlaceholderContacts(workspaceId: string): Promise<void> {
    if (typeof this.prisma.contact?.findMany !== 'function') {
      return;
    }

    const contacts = await this.prisma.contact.findMany({
      take: 5000,
      where: { workspaceId },
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

    for (const contact of contacts) {
      const customFields = this.normalizeJsonObject(contact.customFields);
      const storedName = String(contact.name || '').trim();
      const remotePushName = String(customFields.remotePushName || '').trim();
      const trustedName =
        (!this.isPlaceholderContactName(remotePushName, contact.phone) ? remotePushName : '') ||
        (!this.isPlaceholderContactName(storedName, contact.phone) ? storedName : '');
      const hasPlaceholderData =
        this.isPlaceholderContactName(storedName, contact.phone) ||
        this.isPlaceholderContactName(remotePushName, contact.phone);

      if (!hasPlaceholderData) {
        continue;
      }

      const nextCustomFields = { ...customFields };
      const relationCount =
        Number(contact._count?.messages || 0) +
        Number(contact._count?.conversations || 0) +
        Number(contact._count?.deals || 0) +
        Number(contact._count?.executions || 0) +
        Number(contact._count?.autopilotEvents || 0) +
        Number(contact._count?.insights || 0);

      if (this.isPlaceholderContactName(remotePushName, contact.phone)) {
        delete nextCustomFields.remotePushName;
        delete nextCustomFields.remotePushNameUpdatedAt;
      } else if (trustedName) {
        nextCustomFields.remotePushName = trustedName;
        nextCustomFields.remotePushNameUpdatedAt =
          nextCustomFields.remotePushNameUpdatedAt || new Date().toISOString();
      }
      nextCustomFields.placeholderSanitizedAt = new Date().toISOString();
      nextCustomFields.placeholderRelationCount = relationCount;
      nextCustomFields.nameResolutionStatus = trustedName ? 'resolved' : 'pending';

      await this.prisma.contact.updateMany({
        where: { id: contact.id, workspaceId },
        data: {
          name: trustedName || null,
          customFields: nextCustomFields as Prisma.InputJsonValue,
        },
      });
    }
  }

  private isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
    const normalized = normalizeOptionalText(value);
    if (!normalized) {
      return true;
    }

    const lowered = normalized.toLowerCase();
    const phoneDigits = this.normalizePhone(String(phone || ''));

    if (lowered === 'doe' || lowered === 'unknown' || lowered === 'desconhecido') {
      return true;
    }

    if (D__D_S____S_DOE_RE.test(normalized)) {
      return true;
    }

    if (phoneDigits && lowered === `${phoneDigits} doe`) {
      return true;
    }

    if (phoneDigits && this.normalizePhone(normalized) === phoneDigits) {
      return true;
    }

    return false;
  }

  private resolveRemoteContactName(chat: WahaChatSummary): string {
    const fallbackPhone = this.normalizePhone(
      this.providerRegistry.extractPhoneFromChatId(chat?.id || ''),
    );
    const candidates = [
      chat?.name,
      chat?.contact?.pushName,
      chat?.contact?.name,
      chat?.pushName,
      chat?.notifyName,
      chat?.lastMessage?._data?.notifyName,
      chat?.lastMessage?._data?.verifiedBizName,
    ];

    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (normalized && !this.isPlaceholderContactName(normalized, fallbackPhone)) {
        return normalized;
      }
    }

    return '';
  }

  private async resolveWorkspaceSelfPhone(
    workspaceId: string,
    settings?: Record<string, any> | null,
  ): Promise<string | null> {
    const cached = this.selfPhoneCache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.phone;
    }

    const storedPhone = this.normalizePhone(
      String(
        settings?.whatsappWebSession?.phoneNumber ||
          settings?.whatsappApiSession?.phoneNumber ||
          '',
      ),
    );
    if (storedPhone) {
      this.selfPhoneCache.set(workspaceId, {
        expiresAt: Date.now() + this.selfPhoneCacheTtlMs,
        phone: storedPhone,
      });
      return storedPhone;
    }

    if (process.env.NODE_ENV === 'test') {
      this.selfPhoneCache.set(workspaceId, {
        expiresAt: Date.now() + this.selfPhoneCacheTtlMs,
        phone: null,
      });
      return null;
    }

    const remote = await this.providerRegistry.getSessionStatus(workspaceId).catch(() => null);
    const remotePhone = this.normalizePhone(String(remote?.phoneNumber || ''));
    const resolvedPhone = remotePhone || null;

    this.selfPhoneCache.set(workspaceId, {
      expiresAt: Date.now() + this.selfPhoneCacheTtlMs,
      phone: resolvedPhone,
    });

    return resolvedPhone;
  }

  private isWorkspaceSelfChatId(
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

    const canonicalChatId = this.resolveCanonicalChatId(normalizedChatId, mappings);
    const phone = this.normalizePhone(canonicalChatId);

    return this.areEquivalentPhones(phone, workspaceSelfPhone);
  }

  private expandComparablePhoneVariants(phone: string): string[] {
    const digits = this.normalizePhone(phone);
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

  private areEquivalentPhones(left: string, right: string): boolean {
    const leftVariants = this.expandComparablePhoneVariants(left);
    const rightVariants = this.expandComparablePhoneVariants(right);

    return leftVariants.some((candidate) => rightVariants.includes(candidate));
  }

  private resolveCanonicalChatId(chatId: string, mappings: Map<string, string>): string {
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

  private async getLidPnMap(workspaceId: string): Promise<Map<string, string>> {
    const cached = this.lidMapCache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.mappings;
    }

    const mappings = await this.providerRegistry
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

    this.lidMapCache.set(workspaceId, {
      expiresAt: Date.now() + this.lidMapCacheTtlMs,
      mappings: normalized,
    });

    return normalized;
  }

  private async resolveCanonicalPhone(workspaceId: string, chatId: string): Promise<string> {
    const normalizedChatId = String(chatId || '').trim();
    if (!normalizedChatId) {
      return '';
    }

    if (LID_RE.test(normalizedChatId)) {
      const mappings = await this.getLidPnMap(workspaceId);
      const mapped =
        mappings.get(normalizedChatId) || mappings.get(normalizedChatId.replace(LID_RE, '')) || '';
      if (mapped) {
        return this.normalizePhone(mapped);
      }
    }

    return this.normalizePhone(normalizedChatId);
  }

  private async canonicalizeMessages(
    workspaceId: string,
    messages: WahaChatMessage[],
  ): Promise<WahaChatMessage[]> {
    const mappings = await this.getLidPnMap(workspaceId);
    return (messages || []).map((message) => {
      const canonicalChatId = this.resolveCanonicalChatId(
        String(message.chatId || message.from || '').trim(),
        mappings,
      );
      const canonicalFrom = this.resolveCanonicalChatId(
        String(message.from || canonicalChatId).trim(),
        mappings,
      );
      const canonicalTo = this.resolveCanonicalChatId(String(message.to || '').trim(), mappings);

      return {
        ...message,
        chatId: canonicalChatId || message.chatId,
        from: canonicalFrom || message.from,
        to: canonicalTo || message.to,
      };
    });
  }
}
