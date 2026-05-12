import { randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import Redis from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
  buildSweepUnreadConversationsJobData,
} from '../contracts/autopilot-jobs';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import { AgentEventsService } from './agent-events.service';
import { asProviderSettings, type ProviderSessionSnapshot } from './provider-settings.types';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { type WahaChatMessage, type WahaChatSummary } from './providers/whatsapp-api.provider';
import { WorkerRuntimeService } from './worker-runtime.service';
import {
  normalizeTimestampExt,
  resolveTimestampExt,
  resolveChatActivityTimestampExt,
  isNowebStoreMisconfiguredExt,
  resolveCanonicalChatIdExt,
  getLidPnMapExt,
  isWorkspaceSelfChatIdExt,
} from './whatsapp-catchup.helpers';
import { normalizeChatsExt, normalizeMessagesExt } from './whatsapp-catchup.normalizers';
import { INBOUND_PROCESSOR, CIA_RUNTIME, CATCHUP_HISTORY } from './whatsapp.tokens';
import type {
  IInboundProcessor,
  ICiaRuntime,
  ICatchupHistory,
  CatchupBackfillCursor,
} from './whatsapp.interfaces';
import {
  safeStr,
  normalizeOptionalText,
  type GuestCheckSettings,
  CATCHUP_SWEEP_LIMIT,
  CATCHUP_LOCK_TTL_SECONDS,
  CATCHUP_MIN_TRIGGER_INTERVAL_SECONDS,
  CATCHUP_MAX_CHATS,
  CATCHUP_MAX_MESSAGES_PER_CHAT,
  CATCHUP_FIRST_RUN_LOOKBACK_MS,
  CATCHUP_MAX_PASSES,
  CATCHUP_MAX_PAGES_PER_CHAT,
  CATCHUP_FALLBACK_CHATS_PER_PASS,
  CATCHUP_INCLUDE_ZERO_UNREAD_ACTIVITY,
  CATCHUP_FALLBACK_PAGES_PER_CHAT,
  CATCHUP_MARK_READ_WITHOUT_REPLY,
  CATCHUP_LID_MAP_CACHE_TTL_MS,
} from './whatsapp-catchup-config';
import { getLockKey, getCooldownKey, releaseLock } from './whatsapp-catchup-lock.helpers';
import { selectCandidateChats } from './whatsapp-catchup-chat-selector';
import { loadCatchupMessages } from './whatsapp-catchup-message-loader';

type CatchupRunSummary = {
  importedMessages: number;
  touchedChats: number;
  processedChats: number;
  overflow: boolean;
};
type CatchupLifecycle = {
  catchupEnabled?: boolean;
  autoManage?: boolean;
  autoCatchup?: boolean;
  [key: string]: unknown;
};
type CatchupUpdatePayload = {
  status?: string;
  lastCatchupAt?: string | null;
  lastCatchupError?: string | null;
  lastCatchupFailedAt?: string | null;
  recoveryBlockedReason?: string | null;
  recoveryBlockedAt?: string | null;
  [key: string]: unknown;
};

@Injectable()
export class WhatsappCatchupOrchestratorService {
  private readonly logger = new Logger(WhatsappCatchupOrchestratorService.name);
  private readonly lidMapCache = new Map<
    string,
    { expiresAt: number; mappings: Map<string, string> }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    @Inject(forwardRef(() => INBOUND_PROCESSOR))
    private readonly inboundProcessor: IInboundProcessor,
    @Inject(forwardRef(() => CIA_RUNTIME)) private readonly ciaRuntime: ICiaRuntime,
    private readonly workerRuntime: WorkerRuntimeService,
    @InjectRedis() private readonly redis: Redis,
    private readonly agentEvents: AgentEventsService,
    @Inject(forwardRef(() => CATCHUP_HISTORY)) private readonly history: ICatchupHistory,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  // ═══ thin wrappers ═══
  private isNowebStoreMisconfigured(error: unknown): boolean {
    return isNowebStoreMisconfiguredExt(error);
  }
  private isSessionMissingError(error: unknown): boolean {
    const m = String(
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : normalizeOptionalText(error),
    ).toLowerCase();
    return (
      m.includes('session') &&
      (m.includes('does not exist') || m.includes('not found') || m.includes('404'))
    );
  }
  private isGuestWorkspace(name?: string, s?: GuestCheckSettings | null): boolean {
    const n = String(name || '')
      .trim()
      .toLowerCase();
    if (n === 'guest workspace') {
      return true;
    }
    return (
      s?.guestMode === true ||
      s?.anonymousGuest === true ||
      s?.workspaceMode === 'guest' ||
      s?.authMode === 'anonymous' ||
      s?.auth?.anonymous === true
    );
  }
  private getLifecycleBlockReason(
    name?: string,
    s?: Record<string, unknown> | null,
  ): string | null {
    const lc = (s?.whatsappLifecycle || {}) as CatchupLifecycle;
    if (this.isGuestWorkspace(name, s)) {
      return 'guest_workspace_disabled';
    }
    if (lc.catchupEnabled === false || lc.autoManage === false || lc.autoCatchup === false) {
      return 'catchup_disabled';
    }
    return null;
  }
  private resolveTimestamp(value: unknown): number {
    return resolveTimestampExt(value);
  }
  private normalizeTimestamp(value?: Date | string | number | null): Date | null {
    return normalizeTimestampExt(value);
  }
  private resolveCanonicalChatId(chatId: string, mappings: Map<string, string>): string {
    return resolveCanonicalChatIdExt(chatId, mappings);
  }
  private isWorkspaceSelfChatId(
    chatId: string,
    selfPhone: string | null,
    selfIds: string[],
    mappings: Map<string, string>,
  ): boolean {
    return isWorkspaceSelfChatIdExt(chatId, selfPhone, selfIds, mappings);
  }
  private normalizeChats(raw: unknown): WahaChatSummary[] {
    return normalizeChatsExt(raw);
  }
  private normalizeMessages(raw: unknown, fallbackChatId: string): WahaChatMessage[] {
    return normalizeMessagesExt(raw, fallbackChatId);
  }
  private resolveChatActivityTimestamp(chat: WahaChatSummary): number {
    return resolveChatActivityTimestampExt(chat);
  }
  private async getLidPnMap(ws: string): Promise<Map<string, string>> {
    return getLidPnMapExt(
      { providerRegistry: this.providerRegistry },
      ws,
      CATCHUP_LID_MAP_CACHE_TTL_MS,
      this.lidMapCache,
    );
  }

  // ═══ PUBLIC ═══
  async triggerCatchup(ws: string, reason = 'unknown') {
    const br = await this.getCatchupBlockReason(ws);
    if (br) {
      return { scheduled: false, reason: br };
    }
    const ck = getCooldownKey(ws);
    if (
      (await this.redis.set(ck, reason, 'EX', CATCHUP_MIN_TRIGGER_INTERVAL_SECONDS, 'NX')) !== 'OK'
    ) {
      return { scheduled: false, reason: 'catchup_cooldown' };
    }
    const lk = getLockKey(ws);
    const t = randomUUID();
    if ((await this.redis.set(lk, t, 'EX', CATCHUP_LOCK_TTL_SECONDS, 'NX')) !== 'OK') {
      return { scheduled: false, reason: 'catchup_locked' };
    }
    void this.runCatchup(ws, reason, t).catch((e: unknown) =>
      this.logger.error(`catchup_failed ws=${ws}: ${e instanceof Error ? e.message : String(e)}`),
    );
    return { scheduled: true };
  }

  async runCatchupNow(
    ws: string,
    reason = 'manual_sync',
  ): Promise<({ scheduled: true } & CatchupRunSummary) | { scheduled: false; reason?: string }> {
    const br = await this.getCatchupBlockReason(ws);
    if (br) {
      return { scheduled: false, reason: br };
    }
    const lk = getLockKey(ws);
    const t = randomUUID();
    if ((await this.redis.set(lk, t, 'EX', CATCHUP_LOCK_TTL_SECONDS, 'NX')) !== 'OK') {
      return { scheduled: false, reason: 'catchup_locked' };
    }
    const s = await this.runCatchup(ws, reason, t);
    return { scheduled: true, ...s };
  }

  private async runCatchup(ws: string, reason: string, token: string): Promise<CatchupRunSummary> {
    let im = 0,
      tc = 0,
      pc = 0;
    let ho = false;
    let etc = 0;
    let nbc: CatchupBackfillCursor = null;
    try {
      const w = await this.prisma.workspace.findUnique({
        where: { id: ws },
        select: { name: true, providerSettings: true },
      });
      if (!w) {
        return { importedMessages: im, touchedChats: tc, processedChats: pc, overflow: ho };
      }
      await this.history.sanitizePlaceholderContacts(ws);
      const s = asProviderSettings(w.providerSettings);
      await this.providerRegistry.getProviderType(ws);
      const lb = this.getLifecycleBlockReason(w.name || undefined, s);
      if (lb) {
        this.logger.debug(`Skipping catchup for ${ws}: ${lb}`);
        return { importedMessages: im, touchedChats: tc, processedChats: pc, overflow: ho };
      }
      const sm = s.whatsappApiSession || {};
      const firstSync = !this.normalizeTimestamp(sm.lastCatchupAt);
      const bc = this.history.resolveBackfillCursor(
        sm as { backfillCursor?: unknown; [key: string]: unknown },
      );
      nbc = bc;
      const selfPhone = await this.history.resolveWorkspaceSelfPhone(ws, s);
      const ssi = (sm.selfIds || []) as unknown[];
      const selfIds = Array.isArray(ssi)
        ? ssi.map((v: unknown) => safeStr(v).trim()).filter(Boolean)
        : [];
      const mappings = await this.getLidPnMap(ws);
      await this.agentEvents.publish({
        type: 'thought',
        workspaceId: ws,
        phase: 'sync',
        message: 'Sincronizando suas conversas',
      });
      const since = this.resolveCatchupSince(sm);
      const processedChatIds = new Set<string>();
      const runPass = async (pass: number): Promise<void> => {
        if (pass >= CATCHUP_MAX_PASSES) {
          return;
        }
        const raw = await this.providerRegistry.getChats(ws);
        const pending = this.normalizeChats(raw)
          .filter((c) => !!c.id)
          .filter((c) => !this.isWorkspaceSelfChatId(c.id, selfPhone, selfIds, mappings))
          .filter((c) => !processedChatIds.has(c.id));
        const { chats: ccs, fallbackChatIds } = selectCandidateChats(
          pending,
          since,
          this.history,
          CATCHUP_INCLUDE_ZERO_UNREAD_ACTIVITY,
          CATCHUP_FALLBACK_CHATS_PER_PASS,
          (c) => this.resolveChatActivityTimestamp(c),
          nbc,
        );
        if (pass === 0) {
          etc = ccs.length;
          await this.agentEvents.publish({
            type: 'status',
            workspaceId: ws,
            phase: 'sync_start',
            message:
              etc > 0
                ? `Começando a sincronização de ${etc} conversas.`
                : 'Não encontrei novas conversas para sincronizar.',
            meta: { totalChats: etc, reason },
          });
        }
        const chats = ccs.slice(0, CATCHUP_MAX_CHATS);
        if (!chats.length) {
          return;
        }
        if (ccs.length > chats.length || pending.length > ccs.length) {
          ho = true;
        }
        await forEachSequential(chats, async (chat) => {
          processedChatIds.add(chat.id);
          pc += 1;
          if (fallbackChatIds.has(chat.id)) {
            nbc = {
              chatId: chat.id,
              activityTimestamp: this.resolveChatActivityTimestamp(chat),
              updatedAt: new Date().toISOString(),
            };
          }
          if (pc === 1 || pc === etc || pc % 5 === 0) {
            await this.agentEvents.publish({
              type: 'status',
              workspaceId: ws,
              phase: 'sync_progress',
              message: `Sincronizando conversa ${pc} de ${Math.max(etc, pc)}.`,
              meta: { processedChats: pc, totalChats: Math.max(etc, pc), importedMessages: im },
            });
          }
          const { messages, hadOverflow: co } = await loadCatchupMessages(ws, chat, since, {
            providerRegistry: this.providerRegistry,
            maxPagesPerChat: CATCHUP_MAX_PAGES_PER_CHAT,
            fallbackPagesPerChat: CATCHUP_FALLBACK_PAGES_PER_CHAT,
            maxMessagesPerChat: CATCHUP_MAX_MESSAGES_PER_CHAT,
            normalizeMessages: (r, fcid) => this.normalizeMessages(r, fcid),
            resolveTimestamp: (v) => this.resolveTimestamp(v),
            getLidPnMap: (w) => this.getLidPnMap(w),
            resolveCanonicalChatId: (cid, m) => this.resolveCanonicalChatId(cid, m),
            fallbackScan: fallbackChatIds.has(chat.id),
            firstSync,
          });
          if (co) {
            ho = true;
          }
          await this.history
            .reconcileRemoteChatState(ws, chat)
            .catch((e: unknown) =>
              this.logger.warn(
                `catchup_reconcile_failed ws=${ws} chat=${chat.id}: ${
                  e instanceof Error ? e.message : String(e)
                }`,
              ),
            );
          if (!messages.length) {
            return;
          }
          tc += 1;
          await forEachSequential(messages, async (m) => {
            if (m.fromMe) {
              const p = await this.history.persistHistoricalOutboundMessage(ws, m);
              if (p) {
                im += 1;
              }
              return;
            }
            const ib = this.history.toInboundMessage(ws, m);
            if (!ib) {
              return;
            }
            const result = (await this.inboundProcessor.process(ib)) as {
              deduped?: boolean;
              messageId?: string;
              contactId?: string;
            };
            if (!result.deduped) {
              im += 1;
            }
          });
          if (CATCHUP_MARK_READ_WITHOUT_REPLY) {
            await this.providerRegistry
              .readChatMessages(ws, chat.id)
              .catch((e: unknown) =>
                this.logger.warn(
                  `Failed to mark chat as read: ${e instanceof Error ? e.message : String(e)}`,
                ),
              );
          }
        });
        await runPass(pass + 1);
      };
      await runPass(0);
      await this.persistCatchupSnapshot(ws, {
        lastCatchupAt: new Date().toISOString(),
        lastCatchupReason: reason,
        lastCatchupImportedMessages: im,
        lastCatchupTouchedChats: tc,
        lastCatchupProcessedChats: pc,
        lastCatchupOverflow: ho,
        lastCatchupError: null,
        lastCatchupFailedAt: null,
        recoveryBlockedReason: null,
        recoveryBlockedAt: null,
        backfillCursor: nbc,
      });
      await this.agentEvents.publish({
        type: 'status',
        workspaceId: ws,
        phase: 'sync_complete',
        persistent: true,
        message:
          im > 0
            ? `Sincronização concluída. Importei ${im} mensagens em ${tc} conversas.`
            : 'Sincronização concluída. Não encontrei mensagens novas para importar.',
        meta: { importedMessages: im, touchedChats: tc, processedChats: pc, overflow: ho, reason },
      });
      await this.scheduleUnreadSweep(ws, { reason, processedChats: pc, touchedChats: tc }).catch(
        (e: unknown) =>
          this.logger.warn(
            `catchup_sweep_schedule_failed ws=${ws}: ${e instanceof Error ? e.message : String(e)}`,
          ),
      );
      return { importedMessages: im, touchedChats: tc, processedChats: pc, overflow: ho };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'WhatsAppCatchupService.runCatchup', {
        workspaceId: ws,
      });
      const em = String(
        (error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error')
        ).message || 'erro desconhecido',
      );
      const sess = this.isSessionMissingError(error);
      const rb =
        !sess && this.isNowebStoreMisconfigured(error) ? 'noweb_store_misconfigured' : null;
      await this.persistCatchupSnapshot(ws, {
        ...(sess
          ? {
              status: 'disconnected',
              rawStatus: 'SESSION_MISSING',
              disconnectReason: em,
              phoneNumber: null,
              pushName: null,
              qrCode: null,
              connectedAt: null,
            }
          : {}),
        lastCatchupReason: reason,
        lastCatchupError: em,
        lastCatchupFailedAt: new Date().toISOString(),
        recoveryBlockedReason: rb,
        recoveryBlockedAt: rb ? new Date().toISOString() : null,
      });
      await this.agentEvents.publish({
        type: 'error',
        workspaceId: ws,
        phase: 'sync_error',
        persistent: true,
        message: sess
          ? 'Não consegui sincronizar porque a sessão do WhatsApp não existe mais no WAHA.'
          : rb
            ? 'WAHA está sem NOWEB store habilitado.'
            : `Não consegui sincronizar suas conversas. Motivo: ${em}.`,
        meta: {
          importedMessages: im,
          touchedChats: tc,
          processedChats: pc,
          overflow: ho,
          reason,
          sessionMissing: sess,
          recoveryBlockedReason: rb,
          errorMessage: em,
        },
      });
      throw error;
    } finally {
      await releaseLock(this.redis, ws, token);
    }
  }

  private resolveCatchupSince(sm: ProviderSessionSnapshot): Date {
    const lca = this.normalizeTimestamp(sm.lastCatchupAt);
    return lca || new Date(Date.now() - CATCHUP_FIRST_RUN_LOOKBACK_MS);
  }

  private async persistCatchupSnapshot(ws: string, update: CatchupUpdatePayload) {
    await this.prisma.$transaction(async (tx) => {
      const w = await tx.workspace.findUnique({
        where: { id: ws },
        select: { providerSettings: true },
      });
      if (!w) {
        return;
      }
      const s = asProviderSettings(w.providerSettings);
      const sm = s.whatsappApiSession || {};
      await tx.workspace.update({
        where: { id: ws },
        data: {
          providerSettings: toPrismaJsonValue({
            ...s,
            ...(typeof update.status === 'string' ? { connectionStatus: update.status } : {}),
            whatsappApiSession: { ...sm, ...update },
          }),
        },
      });
    });
  }

  private async scheduleUnreadSweep(
    ws: string,
    input: { reason: string; processedChats: number; touchedChats: number },
  ): Promise<void> {
    if (!ws) {
      return;
    }
    const workerOk = await this.workerRuntime.isAvailable().catch(() => false);
    const triggeredBy = `catchup:${input.reason}`;
    if (!workerOk) {
      await this.ciaRuntime.startBacklogRun(ws, 'reply_all_recent_first', CATCHUP_SWEEP_LIMIT, {
        autoStarted: true,
        runtimeState: 'EXECUTING_BACKLOG',
        triggeredBy,
      });
      await this.agentEvents.publish({
        type: 'status',
        workspaceId: ws,
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
        workspaceId: ws,
        runId: randomUUID(),
        limit: CATCHUP_SWEEP_LIMIT,
        mode: 'reply_all_recent_first',
        triggeredBy,
      }),
      { jobId: buildQueueJobId('catchup-sweep-unread', ws), removeOnComplete: true },
    );
    await this.agentEvents.publish({
      type: 'status',
      workspaceId: ws,
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

  private async getCatchupBlockReason(ws: string): Promise<string | null> {
    const w = await this.prisma.workspace.findUnique({
      where: { id: ws },
      select: { name: true, providerSettings: true },
    });
    if (!w) {
      return null;
    }
    const s = asProviderSettings(w.providerSettings);
    const lb = this.getLifecycleBlockReason(w.name || undefined, s);
    if (lb) {
      return lb;
    }
    const sm = s.whatsappApiSession || {};
    const rb = safeStr(sm.recoveryBlockedReason).trim();
    return this.isNowebStoreMisconfigured(rb) ? rb || 'noweb_store_misconfigured' : null;
  }
}
