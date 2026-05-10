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

const CATCHUP_SWEEP_LIMIT = Math.max(
  1,
  Math.min(2000, Number.parseInt(process.env.WAHA_CATCHUP_SWEEP_LIMIT || '500', 10) || 500),
);

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}
function normalizeOptionalText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

type GuestCheckSettings = {
  guestMode?: boolean;
  anonymousGuest?: boolean;
  workspaceMode?: string;
  authMode?: string;
  auth?: { anonymous?: boolean };
};

@Injectable()
export class WhatsappCatchupOrchestratorService {
  private readonly logger = new Logger(WhatsappCatchupOrchestratorService.name);
  private readonly lidMapCacheTtlMs = Math.max(
    60_000,
    Number.parseInt(process.env.WAHA_LID_MAP_CACHE_TTL_MS || '300000', 10) || 300_000,
  );
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
  private readonly fallbackChatsPerPass = (() => {
    const p = Number.parseInt(process.env.WAHA_CATCHUP_FALLBACK_CHATS_PER_PASS || '100', 10);
    return Number.isFinite(p) ? p : 0;
  })();
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
    if (n === 'guest workspace') return true;
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
    if (this.isGuestWorkspace(name, s)) return 'guest_workspace_disabled';
    if (lc.catchupEnabled === false || lc.autoManage === false || lc.autoCatchup === false)
      return 'catchup_disabled';
    return null;
  }
  private getLockKey(ws: string) {
    return `whatsapp:catchup:${ws}`;
  }
  private getCooldownKey(ws: string) {
    return `whatsapp:catchup:cooldown:${ws}`;
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
      this.lidMapCacheTtlMs,
      this.lidMapCache,
    );
  }

  // ═══ PUBLIC ═══
  async triggerCatchup(ws: string, reason = 'unknown') {
    const br = await this.getCatchupBlockReason(ws);
    if (br) return { scheduled: false, reason: br };
    const ck = this.getCooldownKey(ws);
    if ((await this.redis.set(ck, reason, 'EX', this.minTriggerIntervalSeconds, 'NX')) !== 'OK')
      return { scheduled: false, reason: 'catchup_cooldown' };
    const lk = this.getLockKey(ws);
    const t = randomUUID();
    if ((await this.redis.set(lk, t, 'EX', this.lockTtlSeconds, 'NX')) !== 'OK')
      return { scheduled: false, reason: 'catchup_locked' };
    void this.runCatchup(ws, reason, t).catch((e) =>
      this.logger.error(`catchup_failed ws=${ws}: ${e?.message || e}`),
    );
    return { scheduled: true };
  }

  async runCatchupNow(
    ws: string,
    reason = 'manual_sync',
  ): Promise<({ scheduled: true } & CatchupRunSummary) | { scheduled: false; reason?: string }> {
    const br = await this.getCatchupBlockReason(ws);
    if (br) return { scheduled: false, reason: br };
    const lk = this.getLockKey(ws);
    const t = randomUUID();
    if ((await this.redis.set(lk, t, 'EX', this.lockTtlSeconds, 'NX')) !== 'OK')
      return { scheduled: false, reason: 'catchup_locked' };
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
      if (!w) return { importedMessages: im, touchedChats: tc, processedChats: pc, overflow: ho };
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
        if (pass >= this.maxPasses) return;
        const raw = await this.providerRegistry.getChats(ws);
        const pending = this.normalizeChats(raw)
          .filter((c) => !!c.id)
          .filter((c) => !this.isWorkspaceSelfChatId(c.id, selfPhone, selfIds, mappings))
          .filter((c) => !processedChatIds.has(c.id));
        const { chats: ccs, fallbackChatIds } = this.selectCandidateChats(pending, since, nbc);
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
        const chats = ccs.slice(0, this.maxChats);
        if (!chats.length) return;
        if (ccs.length > chats.length || pending.length > ccs.length) ho = true;
        await forEachSequential(chats, async (chat) => {
          processedChatIds.add(chat.id);
          pc += 1;
          if (fallbackChatIds.has(chat.id))
            nbc = {
              chatId: chat.id,
              activityTimestamp: this.resolveChatActivityTimestamp(chat),
              updatedAt: new Date().toISOString(),
            };
          if (pc === 1 || pc === etc || pc % 5 === 0)
            await this.agentEvents.publish({
              type: 'status',
              workspaceId: ws,
              phase: 'sync_progress',
              message: `Sincronizando conversa ${pc} de ${Math.max(etc, pc)}.`,
              meta: { processedChats: pc, totalChats: Math.max(etc, pc), importedMessages: im },
            });
          const { messages, hadOverflow: co } = await this.loadCatchupMessages(ws, chat, since, {
            fallbackScan: fallbackChatIds.has(chat.id),
            firstSync,
          });
          if (co) ho = true;
          await this.history
            .reconcileRemoteChatState(ws, chat)
            .catch((e) =>
              this.logger.warn(
                `catchup_reconcile_failed ws=${ws} chat=${chat.id}: ${e?.message || e}`,
              ),
            );
          if (!messages.length) return;
          tc += 1;
          await forEachSequential(messages, async (m) => {
            if (m.fromMe) {
              const p = await this.history.persistHistoricalOutboundMessage(ws, m);
              if (p) im += 1;
              return;
            }
            const ib = this.history.toInboundMessage(ws, m);
            if (!ib) return;
            const r = await this.inboundProcessor.process(ib);
            if (!r.deduped) im += 1;
          });
          if (this.markReadWithoutReplyOnImport)
            await this.providerRegistry
              .readChatMessages(ws, chat.id)
              .catch((e) => this.logger.warn('Failed to mark chat as read', e.message));
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
        (e) => this.logger.warn(`catchup_sweep_schedule_failed ws=${ws}: ${e?.message || e}`),
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
      await this.releaseLock(ws, token);
    }
  }

  private resolveCatchupSince(sm: ProviderSessionSnapshot): Date {
    const lca = this.normalizeTimestamp(sm.lastCatchupAt);
    return lca || new Date(Date.now() - this.firstRunLookbackMs);
  }

  private sortChatsByPriority(chats: WahaChatSummary[], since: Date): WahaChatSummary[] {
    return [...chats].sort((a, b) => {
      const ud = (b.unreadCount || 0) - (a.unreadCount || 0);
      if (ud !== 0) return ud;
      const ad = this.resolveChatActivityTimestamp(b) - this.resolveChatActivityTimestamp(a);
      if (ad !== 0) return ad;
      const rpd =
        Number(this.history.isRemoteChatAwaitingReply(b)) -
        Number(this.history.isRemoteChatAwaitingReply(a));
      if (rpd !== 0) return rpd;
      const rd =
        Number(this.resolveChatActivityTimestamp(b) >= since.getTime()) -
        Number(this.resolveChatActivityTimestamp(a) >= since.getTime());
      if (rd !== 0) return rd;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  private selectCandidateChats(
    chats: WahaChatSummary[],
    since: Date,
    cursor?: CatchupBackfillCursor,
  ) {
    const pri = this.sortChatsByPriority(
      chats.filter(
        (c) =>
          (c.unreadCount || 0) > 0 ||
          this.history.isRemoteChatAwaitingReply(c) ||
          (this.includeZeroUnreadActivity &&
            this.resolveChatActivityTimestamp(c) >= since.getTime()),
      ),
      since,
    );
    const stale = this.sortChatsByPriority(
      chats.filter(
        (c) =>
          (c.unreadCount || 0) <= 0 &&
          !this.history.isRemoteChatAwaitingReply(c) &&
          this.resolveChatActivityTimestamp(c) < since.getTime(),
      ),
      since,
    );
    const fb = this.history
      .rotateFallbackChatsByCursor(stale, cursor)
      .slice(0, this.fallbackChatsPerPass);
    const deduped = new Map<string, WahaChatSummary>();
    for (const c of [...pri, ...fb]) {
      if (!deduped.has(c.id)) deduped.set(c.id, c);
    }
    return { chats: Array.from(deduped.values()), fallbackChatIds: new Set(fb.map((c) => c.id)) };
  }

  private async loadCatchupMessages(
    ws: string,
    chat: WahaChatSummary,
    since: Date,
    o?: { fallbackScan?: boolean; firstSync?: boolean },
  ): Promise<{ messages: WahaChatMessage[]; hadOverflow: boolean }> {
    const collected: WahaChatMessage[] = [];
    const seen = new Set<string>();
    let ho = false;
    let off = 0;
    const ur = Math.max(0, Number(chat.unreadCount || 0) || 0);
    const fs = o?.fallbackScan === true;
    const fS = o?.firstSync === true;
    const mp = fs
      ? Math.min(this.maxPagesPerChat, this.fallbackPagesPerChat)
      : this.maxPagesPerChat;
    const loadPage = async (page: number): Promise<void> => {
      if (page >= mp) return;
      const raw = await this.providerRegistry.getChatMessages(ws, chat.id, {
        limit: this.maxMessagesPerChat,
        offset: off,
      });
      const np = this.normalizeMessages(raw, chat.id)
        .filter((m) => !!m.id)
        .sort((a, b) => this.resolveTimestamp(a) - this.resolveTimestamp(b));
      if (!np.length) return;
      if (np.length >= this.maxMessagesPerChat) ho = true;
      for (const m of np) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        collected.push(m);
      }
      off += np.length;
      if (np.length < this.maxMessagesPerChat) return;
      const ic = collected.filter((m) => !m.fromMe).length;
      if (ur > 0 && ic >= ur) return;
      if (ur === 0 && !fS && !fs && np.every((m) => this.resolveTimestamp(m) < since.getTime()))
        return;
      return loadPage(page + 1);
    };
    await loadPage(0);
    if (ur > 0 && collected.length < ur) ho = true;
    const cm = await this.canonicalizeMessages(ws, collected);
    return {
      messages:
        ur > 0 || fs || fS ? cm : cm.filter((m) => this.resolveTimestamp(m) >= since.getTime()),
      hadOverflow: ho,
    };
  }

  private async canonicalizeMessages(
    ws: string,
    messages: WahaChatMessage[],
  ): Promise<WahaChatMessage[]> {
    const mappings = await this.getLidPnMap(ws);
    return (messages || []).map((m) => ({
      ...m,
      chatId:
        this.resolveCanonicalChatId(String(m.chatId || m.from || '').trim(), mappings) || m.chatId,
      from: this.resolveCanonicalChatId(String(m.from || m.chatId).trim(), mappings) || m.from,
      to: this.resolveCanonicalChatId(String(m.to || '').trim(), mappings) || m.to,
    })) as WahaChatMessage[];
  }

  private async persistCatchupSnapshot(ws: string, update: CatchupUpdatePayload) {
    await this.prisma.$transaction(async (tx) => {
      const w = await tx.workspace.findUnique({
        where: { id: ws },
        select: { providerSettings: true },
      });
      if (!w) return;
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
    if (!ws) return;
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

  private async releaseLock(ws: string, token: string) {
    const c = await this.redis.get(this.getLockKey(ws));
    if (c === token) await this.redis.del(this.getLockKey(ws));
  }

  private async getCatchupBlockReason(ws: string): Promise<string | null> {
    const w = await this.prisma.workspace.findUnique({
      where: { id: ws },
      select: { name: true, providerSettings: true },
    });
    if (!w) return null;
    const s = asProviderSettings(w.providerSettings);
    const lb = this.getLifecycleBlockReason(w.name || undefined, s);
    if (lb) return lb;
    const sm = s.whatsappApiSession || {};
    const rb = safeStr(sm.recoveryBlockedReason).trim();
    return this.isNowebStoreMisconfigured(rb) ? rb || 'noweb_store_misconfigured' : null;
  }
}
