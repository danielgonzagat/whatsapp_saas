import { randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import Redis from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from './agent-events.service';
import { asProviderSettings, type ProviderSessionSnapshot } from './provider-settings.types';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
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
import {
  getCatchupBlockReason as resolveCatchupBlockReason,
  getLifecycleBlockReason,
  isSessionMissingError,
  persistCatchupSnapshot,
  scheduleUnreadSweep,
  type CatchupRunSummary,
  type CatchupUpdatePayload,
} from './whatsapp-catchup-orchestrator.helpers';
@Injectable()
export class WhatsappCatchupOrchestratorService {
  private readonly logger = StructuredLogger.from(WhatsappCatchupOrchestratorService.name);
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
  private async getLidPnMap(ws: string): Promise<Map<string, string>> {
    return getLidPnMapExt(
      { providerRegistry: this.providerRegistry },
      ws,
      CATCHUP_LID_MAP_CACHE_TTL_MS,
      this.lidMapCache,
    );
  }
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
      const lb = getLifecycleBlockReason(w.name || undefined, s);
      if (lb) {
        this.logger.debug(`Skipping catchup for ${ws}: ${lb}`);
        return { importedMessages: im, touchedChats: tc, processedChats: pc, overflow: ho };
      }
      const sm = s.whatsappApiSession || {};
      const firstSync = !normalizeTimestampExt(sm.lastCatchupAt);
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
        const pending = normalizeChatsExt(raw)
          .filter((c) => !!c.id)
          .filter((c) => !isWorkspaceSelfChatIdExt(c.id, selfPhone, selfIds, mappings))
          .filter((c) => !processedChatIds.has(c.id));
        const { chats: ccs, fallbackChatIds } = selectCandidateChats(
          pending,
          since,
          this.history,
          CATCHUP_INCLUDE_ZERO_UNREAD_ACTIVITY,
          CATCHUP_FALLBACK_CHATS_PER_PASS,
          (c) => resolveChatActivityTimestampExt(c),
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
              activityTimestamp: resolveChatActivityTimestampExt(chat),
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
            normalizeMessages: (r, fcid) => normalizeMessagesExt(r, fcid),
            resolveTimestamp: (v) => resolveTimestampExt(v),
            getLidPnMap: (w) => this.getLidPnMap(w),
            resolveCanonicalChatId: (cid, m) => resolveCanonicalChatIdExt(cid, m),
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
      await scheduleUnreadSweep({
        ws,
        reason,
        processedChats: pc,
        touchedChats: tc,
        workerRuntime: this.workerRuntime,
        ciaRuntime: this.ciaRuntime,
        agentEvents: this.agentEvents,
      }).catch((e: unknown) =>
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
      const sess = isSessionMissingError(error);
      const rb = !sess && isNowebStoreMisconfiguredExt(error) ? 'noweb_store_misconfigured' : null;
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
    const lca = normalizeTimestampExt(sm.lastCatchupAt);
    return lca || new Date(Date.now() - CATCHUP_FIRST_RUN_LOOKBACK_MS);
  }
  private async persistCatchupSnapshot(ws: string, update: CatchupUpdatePayload) {
    await persistCatchupSnapshot(this.prisma, ws, update);
  }
  private async getCatchupBlockReason(ws: string): Promise<string | null> {
    return resolveCatchupBlockReason(this.prisma, ws);
  }
}
