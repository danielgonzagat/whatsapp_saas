import { randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { OpsAlertService } from '../observability/ops-alert.service';
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
import { InboundProcessorService, type InboundMessage } from './inbound-processor.service';
import { asProviderSettings } from './provider-settings.types';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { type WahaChatMessage, type WahaChatSummary } from './providers/whatsapp-api.provider';
import { WorkerRuntimeService } from './worker-runtime.service';
import {
  normalizePhoneExt,
  normalizeTimestampExt,
  normalizeJsonObjExt,
  resolveTimestampExt,
  resolveChatActivityTimestampExt,
  isNowebStoreMisconfiguredExt,
  areEquivalentPhonesExt,
  resolveCanonicalChatIdExt,
  getLidPnMapExt,
  resolveCanonicalPhoneExt,
  isWorkspaceSelfChatIdExt,
  normalizeChatsExt,
  normalizeMessagesExt,
} from './__companions__/whatsapp-catchup.service.companion';

const D__D_S____S_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;

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
    @Inject(forwardRef(() => InboundProcessorService))
    private readonly inboundProcessor: InboundProcessorService,
    @Inject(forwardRef(() => CiaRuntimeService)) private readonly ciaRuntime: CiaRuntimeService,
    private readonly inbox: InboxService,
    private readonly workerRuntime: WorkerRuntimeService,
    @InjectRedis() private readonly redis: Redis,
    private readonly agentEvents: AgentEventsService,
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
  private isGuestWorkspace(name?: string, s?: Record<string, unknown> | null): boolean {
    const n = String(name || '')
      .trim()
      .toLowerCase();
    if (n === 'guest workspace') return true;
    return (
      s?.guestMode === true ||
      s?.anonymousGuest === true ||
      s?.workspaceMode === 'guest' ||
      s?.authMode === 'anonymous' ||
      (s?.auth as Record<string, unknown> | undefined)?.anonymous === true
    );
  }
  private getLifecycleBlockReason(
    name?: string,
    s?: Record<string, unknown> | null,
  ): string | null {
    const lc = (s?.whatsappLifecycle || {}) as Record<string, unknown>;
    if (this.isGuestWorkspace(name, s)) return 'guest_workspace_disabled';
    if (lc.catchupEnabled === false || lc.autoManage === false || lc.autoCatchup === false)
      return 'catchup_disabled';
    return null;
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
    const sm = (s.whatsappApiSession || {}) as Record<string, unknown>;
    const rb = safeStr(sm.recoveryBlockedReason).trim();
    return this.isNowebStoreMisconfigured(rb) ? rb || 'noweb_store_misconfigured' : null;
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
  private normalizePhone(phone: string): string {
    return normalizePhoneExt(phone);
  }
  private normalizeJsonObject(value: unknown): Record<string, unknown> {
    return normalizeJsonObjExt(value);
  }
  private areEquivalentPhones(left: string, right: string): boolean {
    return areEquivalentPhonesExt(left, right);
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
  private async resolveCanonicalPhone(ws: string, chatId: string): Promise<string> {
    return resolveCanonicalPhoneExt(
      { providerRegistry: this.providerRegistry },
      ws,
      chatId,
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

  // ═══ runCatchup (main runner, kept inline as it's the core orchestrator) ═══
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
      await this.sanitizePlaceholderContacts(ws);
      const s = asProviderSettings(w.providerSettings) as Record<string, unknown>;
      await this.providerRegistry.getProviderType(ws);
      const lb = this.getLifecycleBlockReason(w.name || undefined, s);
      if (lb) {
        this.logger.debug(`Skipping catchup for ${ws}: ${lb}`);
        return { importedMessages: im, touchedChats: tc, processedChats: pc, overflow: ho };
      }
      const sm = (s.whatsappApiSession || {}) as Record<string, unknown>;
      const firstSync = !this.normalizeTimestamp(
        sm.lastCatchupAt as string | number | Date | null | undefined,
      );
      const bc = this.resolveBackfillCursor(sm);
      nbc = bc;
      const selfPhone = await this.resolveWorkspaceSelfPhone(ws, s);
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
          await this.reconcileRemoteChatState(ws, chat).catch((e) =>
            this.logger.warn(
              `catchup_reconcile_failed ws=${ws} chat=${chat.id}: ${e?.message || e}`,
            ),
          );
          if (!messages.length) return;
          tc += 1;
          await forEachSequential(messages, async (m) => {
            if (m.fromMe) {
              const p = await this.persistHistoricalOutboundMessage(ws, m);
              if (p) im += 1;
              return;
            }
            const ib = this.toInboundMessage(ws, m);
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

  // ═══ PRIVATE helpers (thin wrappers around extracted logic) ═══

  private resolveCatchupSince(sm: Record<string, unknown>): Date {
    const lca = this.normalizeTimestamp(
      sm.lastCatchupAt as string | number | Date | null | undefined,
    );
    return lca || new Date(Date.now() - this.firstRunLookbackMs);
  }

  private sortChatsByPriority(chats: WahaChatSummary[], since: Date): WahaChatSummary[] {
    return [...chats].sort((a, b) => {
      const ud = (b.unreadCount || 0) - (a.unreadCount || 0);
      if (ud !== 0) return ud;
      const ad = this.resolveChatActivityTimestamp(b) - this.resolveChatActivityTimestamp(a);
      if (ad !== 0) return ad;
      const rpd =
        Number(this.isRemoteChatAwaitingReply(b)) - Number(this.isRemoteChatAwaitingReply(a));
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
          this.isRemoteChatAwaitingReply(c) ||
          (this.includeZeroUnreadActivity &&
            this.resolveChatActivityTimestamp(c) >= since.getTime()),
      ),
      since,
    );
    const stale = this.sortChatsByPriority(
      chats.filter(
        (c) =>
          (c.unreadCount || 0) <= 0 &&
          !this.isRemoteChatAwaitingReply(c) &&
          this.resolveChatActivityTimestamp(c) < since.getTime(),
      ),
      since,
    );
    const fb = this.rotateFallbackChatsByCursor(stale, cursor).slice(0, this.fallbackChatsPerPass);
    const deduped = new Map<string, WahaChatSummary>();
    for (const c of [...pri, ...fb]) {
      if (!deduped.has(c.id)) deduped.set(c.id, c);
    }
    return { chats: Array.from(deduped.values()), fallbackChatIds: new Set(fb.map((c) => c.id)) };
  }

  private resolveBackfillCursor(sm: Record<string, unknown>): CatchupBackfillCursor {
    const rc = sm?.backfillCursor;
    if (!rc || typeof rc !== 'object') return null;
    const c = rc as Record<string, unknown>;
    const cid = safeStr(c.chatId).trim();
    const at = Number(c.activityTimestamp || c.timestamp || 0) || 0;
    if (!cid || at <= 0) return null;
    return {
      chatId: cid,
      activityTimestamp: at,
      updatedAt:
        normalizeTimestampExt(
          c.updatedAt as string | number | Date | null | undefined,
        )?.toISOString() || new Date(at).toISOString(),
    };
  }

  private rotateFallbackChatsByCursor(
    chats: WahaChatSummary[],
    cursor?: CatchupBackfillCursor,
  ): WahaChatSummary[] {
    if (!cursor || !chats.length) return chats;
    const i = chats.findIndex((c) => c.id === cursor.chatId);
    if (i >= 0) {
      const s = (i + 1) % chats.length;
      return s === 0 ? chats : [...chats.slice(s), ...chats.slice(0, s)];
    }
    const ai = chats.findIndex(
      (c) => this.resolveChatActivityTimestamp(c) < cursor.activityTimestamp,
    );
    if (ai > 0) return [...chats.slice(ai), ...chats.slice(0, ai)];
    return chats;
  }

  private isRemoteChatAwaitingReply(chat: WahaChatSummary): boolean {
    return chat.lastMessageFromMe === false;
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
    }));
  }

  private toInboundMessage(
    ws: string,
    m: WahaChatMessage,
    provider: InboundMessage['provider'] = 'meta-cloud',
  ): InboundMessage | null {
    const pid = String(m.id || '').trim();
    const from = String(m.from || m.chatId || '').trim();
    if (!pid || !from) return null;
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
    };
  }

  private resolvePreferredChatId(
    payload: Record<string, unknown> | null | undefined,
  ): string | null {
    const data = payload?._data as Record<string, unknown> | undefined;
    const dk = data?.key as Record<string, unknown> | undefined;
    const pk = payload?.key as Record<string, unknown> | undefined;
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

  private extractSenderName(
    payload: Record<string, unknown> | null | undefined,
  ): string | undefined {
    const data = payload?._data as Record<string, unknown> | undefined;
    const cs: unknown[] = [
      data?.pushName,
      payload?.pushName,
      data?.notifyName,
      payload?.notifyName,
      payload?.author,
      payload?.senderName,
    ];
    for (const c of cs) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return undefined;
  }

  private mapInboundType(type?: string): InboundMessage['type'] {
    const n = String(type || '').toLowerCase();
    if (n === 'chat' || n === 'text') return 'text';
    if (n === 'audio' || n === 'ptt') return 'audio';
    if (n === 'image') return 'image';
    if (n === 'document') return 'document';
    if (n === 'video') return 'video';
    if (n === 'sticker') return 'sticker';
    return 'unknown';
  }

  // ═══ PERSISTENCE ═══
  private async persistCatchupSnapshot(ws: string, update: Record<string, unknown>) {
    const w = await this.prisma.workspace.findUnique({
      where: { id: ws },
      select: { providerSettings: true },
    });
    if (!w) return;
    const s = asProviderSettings(w.providerSettings);
    const sm = s.whatsappApiSession || {};
    await this.prisma.workspace.update({
      where: { id: ws },
      data: {
        providerSettings: toPrismaJsonValue({
          ...s,
          ...(typeof update.status === 'string' ? { connectionStatus: update.status } : {}),
          whatsappApiSession: { ...sm, ...update },
        }),
      },
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

  private async persistHistoricalOutboundMessage(
    ws: string,
    message: WahaChatMessage,
  ): Promise<boolean> {
    const phone = this.normalizePhone(String(message.chatId || message.from || '').trim());
    const pid = String(message.id || '').trim();
    if (!phone || !pid) return false;
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
      });
      return true;
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        void this.opsAlert?.alertOnDegradation(
          e.message,
          'WhatsAppCatchupService.persistHistoricalOutboundMessage.duplicate',
          { workspaceId: ws },
        );
        return false;
      }
      void this.opsAlert?.alertOnCriticalError(
        e,
        'WhatsAppCatchupService.persistHistoricalOutboundMessage',
        { workspaceId: ws },
      );
      throw e;
    }
  }

  private async releaseLock(ws: string, token: string) {
    const c = await this.redis.get(this.getLockKey(ws));
    if (c === token) await this.redis.del(this.getLockKey(ws));
  }

  // ═══ RECONCILE ═══
  private async reconcileRemoteChatState(ws: string, chat: WahaChatSummary): Promise<void> {
    const cid = String(chat.id || '').trim();
    if (!cid || cid.includes('@g.us')) return;
    const phone = await this.resolveCanonicalPhone(ws, cid);
    if (!phone) return;
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
      ? await this.providerRegistry.upsertContactProfile(ws, { phone, name: cn }).catch(() => false)
      : false;
    if (saved)
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

  // ═══ SANITIZE ═══
  private async sanitizePlaceholderContacts(ws: string): Promise<void> {
    if (typeof this.prisma.contact?.findMany !== 'function') return;
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
      if (!hp) return;
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

  // ═══ CONTACT HELPERS ═══
  private isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
    const n = normalizeOptionalText(value);
    if (!n) return true;
    const l = n.toLowerCase();
    const pd = this.normalizePhone(String(phone || ''));
    if (l === 'doe' || l === 'unknown' || l === 'desconhecido') return true;
    if (D__D_S____S_DOE_RE.test(n)) return true;
    if (pd && l === `${pd} doe`) return true;
    if (pd && this.normalizePhone(n) === pd) return true;
    return false;
  }

  private resolveRemoteContactName(chat: WahaChatSummary): string {
    const fp = this.normalizePhone(this.providerRegistry.extractPhoneFromChatId(chat?.id || ''));
    for (const c of [
      chat?.name,
      (chat as any)?.contact?.pushName,
      (chat as any)?.contact?.name,
      (chat as any)?.pushName,
      (chat as any)?.notifyName,
      (chat as any)?.lastMessage?._data?.notifyName,
      (chat as any)?.lastMessage?._data?.verifiedBizName,
    ]) {
      const n = String(c || '').trim();
      if (n && !this.isPlaceholderContactName(n, fp)) return n;
    }
    return '';
  }

  private async resolveWorkspaceSelfPhone(
    ws: string,
    s?: Record<string, unknown> | null,
  ): Promise<string | null> {
    const cached = this.selfPhoneCache.get(ws);
    if (cached && cached.expiresAt > Date.now()) return cached.phone;
    const wS = s?.whatsappWebSession as Record<string, unknown> | undefined;
    const aS = s?.whatsappApiSession as Record<string, unknown> | undefined;
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
    const r = await this.providerRegistry.getSessionStatus(ws).catch(() => null);
    const rp = this.normalizePhone(String(r?.phoneNumber || '')) || null;
    this.selfPhoneCache.set(ws, { expiresAt: Date.now() + this.selfPhoneCacheTtlMs, phone: rp });
    return rp;
  }
}
