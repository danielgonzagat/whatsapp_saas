import { randomInt, randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { forEachSequential } from '../common/async-sequence';
import { createRedisClient } from '../common/redis/redis.util';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { InboxService } from '../inbox/inbox.service';
import { StructuredLogger } from '../logging/structured-logger';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueDedupId, buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue, flowQueue } from '../queue/queue';
import { WorkspaceService } from '../workspaces/workspace.service';
import {
  buildConversationOperationalState,
  type ConversationOperationalLike,
  type ConversationOperationalState,
} from './agent-conversation-state.util';
import * as chatHelpers from './whatsapp.service.chats';
import type { ChatHelperDeps } from './whatsapp.service.chats';
import { CiaRuntimeService } from './cia-runtime.service';
import { WhatsAppProviderRegistry, type SessionStatus } from './providers/provider-registry';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { isPlaceholderContactName as isPlaceholderName } from './whatsapp-normalization.util';
import { WorkerRuntimeService } from './worker-runtime.service';
import {
  normalizeJsonObjExt,
  resolveTimestampExt,
  toIsoTimestamp,
  normalizeProbabilityScoreExt,
  isAutonomousEnabledExt,
  normalizeHashExt,
  normalizeContactEntry,
  normalizeChatEntry,
  normalizeMessageEntry,
  collectCatalogContactEntriesExt,
} from './__companions__/whatsapp.service.companion';
import type {
  NormalizedContact,
  NormalizedChat,
} from './__companions__/whatsapp.service.companion';

const D_RE = /\D/g;
const PATTERN_RE = /-/g;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly slog = new StructuredLogger('whatsapp-service');
  private readonly contactDebounceMs = Math.max(
    500,
    Number.parseInt(process.env.AUTOPILOT_CONTACT_DEBOUNCE_MS || '2000', 10) || 2000,
  );

  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly inbox: InboxService,
    private readonly planLimits: PlanLimitsService,
    @InjectRedis() private readonly redis: Redis,
    private readonly neuroCrm: NeuroCrmService,
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly ciaRuntime: CiaRuntimeService,
    private readonly workerRuntime: WorkerRuntimeService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  // ═══ UTILITY (thin) ═══
  private readText(v: unknown): string {
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
    return '';
  }
  private isPlaceholderContactName(v: unknown, p?: string | null): boolean {
    return isPlaceholderName(v, p);
  }
  private resolveTrustedContactName(phone: string, ...candidates: unknown[]): string {
    for (const c of candidates) {
      const n = this.readText(c);
      if (n && !this.isPlaceholderContactName(n, phone)) return n;
    }
    return '';
  }
  private normalizeNumber(num: string): string {
    return num.replace(D_RE, '');
  }
  private isIndividualChatId(c?: string | null): boolean {
    const v = String(c || '').trim();
    return v.endsWith('@c.us') || v.endsWith('@s.whatsapp.net');
  }
  private normalizeJsonObject(v: unknown): Record<string, unknown> {
    return normalizeJsonObjExt(v);
  }
  private normalizeDateValue(v: unknown): string | null {
    const ts = this.resolveTimestamp({ createdAt: v });
    return toIsoTimestamp(ts);
  }
  private normalizeProbabilityScore(s: unknown, b?: string | null): number {
    return normalizeProbabilityScoreExt(s, b);
  }
  private resolveTimestamp(v: unknown): number {
    return resolveTimestampExt(v);
  }
  private toIsoTimestamp(ts: number): string | null {
    return toIsoTimestamp(ts);
  }
  private normalizeChatId(chatId: string): string {
    return String(chatId || '').includes('@') ? chatId : `${this.normalizeNumber(chatId)}@c.us`;
  }
  private normalizeHash(t: string): string {
    return normalizeHashExt(t);
  }
  private isAutonomousEnabled(s: Record<string, unknown>): boolean {
    return isAutonomousEnabledExt(s);
  }
  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
  private get providerExtract() {
    return this.providerRegistry.extractPhoneFromChatId.bind(this.providerRegistry);
  }

  // ═══ CHAT HELPER (thin wrapper) ═══
  private getChatHelperDeps(): ChatHelperDeps {
    return {
      prisma: this.prisma,
      providerRegistry: this.providerRegistry,
      normalizeChats: (r) => this.normalizeChats(r),
      normalizeMessages: (r, fc) => this.normalizeMessages(r, fc),
      normalizeNumber: (n) => this.normalizeNumber(n),
      normalizeChatId: (c) => this.normalizeChatId(c),
      isIndividualChatId: (c) => this.isIndividualChatId(c),
      toIsoTimestamp: (ts) => this.toIsoTimestamp(ts),
      resolveTimestamp: (v) => this.resolveTimestamp(v),
      resolveTrustedContactName: (p, ...cs) => this.resolveTrustedContactName(p, ...cs),
      listOperationalConversations: (ws, o) => this.listOperationalConversations(ws, o),
    };
  }
  async listChats(ws: string) {
    return chatHelpers.listChats(this.getChatHelperDeps(), ws);
  }
  async getChatMessages(
    ws: string,
    cid: string,
    o?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ) {
    return chatHelpers.getChatMessages(this.getChatHelperDeps(), ws, cid, o);
  }
  async getBacklog(ws: string) {
    return chatHelpers.getBacklog(this.getChatHelperDeps(), ws);
  }
  async getOperationalBacklogReport(ws: string, o?: { limit?: number; includeResolved?: boolean }) {
    return chatHelpers.getOperationalBacklogReport(this.getChatHelperDeps(), ws, o);
  }

  // ═══ NORMALIZE (thin wrappers) ═══
  private normalizeContacts(raw: unknown): NormalizedContact[] {
    const r = raw as Record<string, unknown> | undefined;
    const candidates: unknown[] = Array.isArray(raw)
      ? raw
      : Array.isArray(r?.contacts)
        ? (r.contacts as unknown[])
        : Array.isArray(r?.items)
          ? (r.items as unknown[])
          : Array.isArray(r?.data)
            ? (r.data as unknown[])
            : [];
    return candidates
      .map((c) =>
        normalizeContactEntry(c, {
          isPlaceholder: (v, p) => this.isPlaceholderContactName(v, p),
          resolveName: (p, ...cs) => this.resolveTrustedContactName(p, ...cs),
          extractPhone: (id) => this.providerExtract(id),
        }),
      )
      .filter((c): c is NormalizedContact => c !== null);
  }
  private normalizeChats(raw: unknown): NormalizedChat[] {
    const r = raw as Record<string, unknown> | undefined;
    const cs: unknown[] = Array.isArray(raw)
      ? raw
      : Array.isArray(r?.chats)
        ? (r.chats as unknown[])
        : Array.isArray(r?.items)
          ? (r.items as unknown[])
          : Array.isArray(r?.data)
            ? (r.data as unknown[])
            : [];
    return cs
      .map((c) =>
        normalizeChatEntry(c, {
          resolveName: (p, ...cs) => this.resolveTrustedContactName(p, ...cs),
          extractPhone: (id) => this.providerExtract(id),
          isPlaceholder: (v, p) => this.isPlaceholderContactName(v, p),
        }),
      )
      .filter((c): c is NormalizedChat => c !== null);
  }
  private normalizeMessages(raw: unknown, fallbackChatId: string) {
    const r = raw as Record<string, unknown> | undefined;
    const cs = Array.isArray(raw)
      ? raw
      : Array.isArray(r?.messages)
        ? (r.messages as unknown[])
        : Array.isArray(r?.items)
          ? (r.items as unknown[])
          : Array.isArray(r?.data)
            ? (r.data as unknown[])
            : [];
    return cs
      .map((m) =>
        normalizeMessageEntry(m, fallbackChatId, {
          extractPhone: (id) => this.providerExtract(id),
        }),
      )
      .filter(Boolean);
  }

  // ═══ LIST CATALOG, PROBABILITY, REFRESH, RESCORE, BACKLOG ═══
  async listCatalogContacts(
    ws: string,
    o?: { days?: number; page?: number; limit?: number; onlyCataloged?: boolean },
  ) {
    const days = Math.max(1, Math.min(365, Number(o?.days || 30) || 30));
    const page = Math.max(1, Number(o?.page || 1) || 1);
    const limit = Math.max(1, Math.min(200, Number(o?.limit || 50) || 50));
    const oc = o?.onlyCataloged !== false;
    const entries = await this.collectCatalogContactEntries(ws, { days, onlyCataloged: oc });
    const total = entries.length;
    const offset = (page - 1) * limit;
    return {
      workspaceId: ws,
      generatedAt: new Date().toISOString(),
      days,
      page,
      limit,
      total,
      onlyCataloged: oc,
      items: entries.slice(offset, offset + limit),
    };
  }
  async listPurchaseProbabilityRanking(
    ws: string,
    o?: {
      days?: number;
      limit?: number;
      minLeadScore?: number;
      minProbabilityScore?: number;
      onlyCataloged?: boolean;
      excludeBuyers?: boolean;
    },
  ) {
    const days = Math.max(1, Math.min(365, Number(o?.days || 30) || 30));
    const limit = Math.max(1, Math.min(200, Number(o?.limit || 50) || 50));
    const mls = Math.max(0, Math.min(100, Number(o?.minLeadScore || 0) || 0));
    const mps = Math.max(0, Math.min(1, Number(o?.minProbabilityScore || 0) || 0));
    const oc = o?.onlyCataloged !== false;
    const eb = o?.excludeBuyers === true;
    const entries = await this.collectCatalogContactEntries(ws, { days, onlyCataloged: oc });
    const ranked = entries
      .filter(
        (e) =>
          (!eb || e.buyerStatus !== 'BOUGHT') &&
          e.leadScore >= mls &&
          e.purchaseProbabilityScore >= mps,
      )
      .sort((a, b) => {
        if (a.purchaseProbabilityScore !== b.purchaseProbabilityScore)
          return b.purchaseProbabilityScore - a.purchaseProbabilityScore;
        if (a.leadScore !== b.leadScore) return b.leadScore - a.leadScore;
        return (
          this.resolveTimestamp({ createdAt: b.lastConversationAt }) -
          this.resolveTimestamp({ createdAt: a.lastConversationAt })
        );
      })
      .slice(0, limit)
      .map((e, i) => ({ rank: i + 1, ...e }));
    return {
      workspaceId: ws,
      generatedAt: new Date().toISOString(),
      days,
      limit,
      minLeadScore: mls,
      minProbabilityScore: mps,
      onlyCataloged: oc,
      excludeBuyers: eb,
      total: ranked.length,
      items: ranked,
    };
  }
  async triggerCatalogRefresh(ws: string, o?: { days?: number; reason?: string }) {
    const days = Math.max(1, Math.min(365, Number(o?.days || 30) || 30));
    const reason = String(o?.reason || 'manual_catalog_refresh').trim();
    const jid = buildQueueJobId('catalog-contacts-30d', ws);
    await autopilotQueue.add(
      'catalog-contacts-30d',
      { workspaceId: ws, days, reason },
      { jobId: jid, removeOnComplete: true },
    );
    return {
      scheduled: true,
      workspaceId: ws,
      days,
      reason,
      jobName: 'catalog-contacts-30d',
      jobId: jid,
    };
  }
  async triggerCatalogRescore(
    ws: string,
    o?: { contactId?: string; days?: number; limit?: number; reason?: string },
  ) {
    const reason = String(o?.reason || 'manual_catalog_rescore').trim();
    const limit = Math.max(1, Math.min(500, Number(o?.limit || 100) || 100));
    let targets: { contactId: string; phone: string; contactName: string; chatId: string }[] = [];
    if (o?.contactId) {
      const c = await this.prisma.contact.findFirst({
        where: { id: o.contactId, workspaceId: ws },
        select: { id: true, phone: true, name: true, customFields: true },
      });
      if (!c) throw new BadRequestException('contactId inválido');
      const cf = this.normalizeJsonObject(c.customFields);
      targets = [
        {
          contactId: c.id,
          phone: c.phone,
          contactName: c.name || c.phone,
          chatId:
            this.readText(cf.lastRemoteChatId) ||
            this.readText(cf.lastResolvedChatId) ||
            `${c.phone}@c.us`,
        },
      ];
    } else {
      const entries = await this.collectCatalogContactEntries(ws, {
        days: o?.days || 30,
        onlyCataloged: false,
      });
      targets = entries.slice(0, limit).map((e) => ({
        contactId: e.id,
        phone: e.phone,
        contactName: e.name || e.phone,
        chatId: e.lastRemoteChatId || e.lastResolvedChatId || `${e.phone}@c.us`,
      }));
    }
    let sched = 0;
    await forEachSequential(targets, async (t) => {
      await autopilotQueue.add(
        'score-contact',
        {
          workspaceId: ws,
          contactId: t.contactId,
          phone: t.phone,
          contactName: t.contactName,
          chatId: t.chatId || `${t.phone}@c.us`,
          reason,
        },
        { jobId: buildQueueJobId('score-contact', ws, t.contactId), removeOnComplete: true },
      );
      sched += 1;
    });
    return {
      scheduled: true,
      workspaceId: ws,
      reason,
      count: sched,
      contactId: o?.contactId || null,
      days: o?.days || 30,
      limit,
    };
  }
  async triggerBacklogRebuild(ws: string, o?: { limit?: number; reason?: string }) {
    const reason = String(o?.reason || 'manual_backlog_rebuild').trim();
    const limit = Math.max(1, Math.min(2000, Number(o?.limit || 500) || 500));
    const catchup = await this.catchupService.runCatchupNow(ws, reason).catch((e: unknown) => ({
      scheduled: false,
      reason: String(e instanceof Error ? e.message : 'catchup_failed'),
    }));
    const run = await this.ciaRuntime.startBacklogRun(ws, 'reply_all_recent_first', limit, {
      autoStarted: true,
      runtimeState: 'EXECUTING_BACKLOG',
      triggeredBy: reason,
    });
    return { workspaceId: ws, reason, limit, catchup, run };
  }

  // ═══ CATALOG (thin wrapper to companion) ═══
  private async collectCatalogContactEntries(
    ws: string,
    o?: { days?: number; onlyCataloged?: boolean },
  ) {
    return collectCatalogContactEntriesExt(
      { prisma: this.prisma, resolveName: (p, ...cs) => this.resolveTrustedContactName(p, ...cs) },
      ws,
      o,
    );
  }

  // ═══ handleIncoming ═══
  async handleIncoming(workspaceId: string, from: string, message: string) {
    this.slog.info('incoming_webhook', { workspaceId, from, message });
    const ws = await this.workspaces.getWorkspace(workspaceId).catch(() => null);
    if (!ws) {
      this.slog.warn('incoming_invalid_workspace', { workspaceId });
      throw new Error('Workspace not found');
    }
    const dedupeKey = `incoming:dedupe:${workspaceId}:${from}:${this.normalizeHash(message)}`;
    if (await this.redis.get(dedupeKey)) return { skipped: true, reason: 'duplicate' };
    await this.redis.setex(dedupeKey, 60, '1');

    const lower = (message || '').toLowerCase();
    if (
      ['stop', 'sair', 'cancelar', 'cancel', 'parar', 'unsubscribe'].some((k) => lower.includes(k))
    )
      await this.optOutContact(workspaceId, from.replace(D_RE, '')).catch(() => {});

    const saved = await this.inbox.saveMessageByPhone({
      workspaceId,
      phone: from,
      content: message,
      direction: 'INBOUND',
    });
    const nPhone = this.normalizeNumber(from);
    const ctxKey = `reply:${nPhone}`;
    try {
      await this.redis.rpush(ctxKey, message);
      await this.redis.expire(ctxKey, 60 * 60 * 24);
    } catch (_e: unknown) {
      this.logger.warn(
        `Redis reply context write failed for ${workspaceId}, trying fallback: ${(_e instanceof Error ? _e : new Error(String(_e))).message}`,
      );
      const fc = createRedisClient();
      if (fc) {
        try {
          await fc.rpush(ctxKey, message);
          await fc.expire(ctxKey, 60 * 60 * 24);
        } finally {
          fc.disconnect();
        }
      }
    }
    await flowQueue.add(
      'resume-flow',
      { user: nPhone, message, workspaceId },
      { removeOnComplete: true },
    );

    try {
      const settings = this.normalizeJsonObject(ws.providerSettings);
      if (this.isAutonomousEnabled(settings) && saved?.contactId) {
        const sk = `autopilot:scan-contact:${workspaceId}:${saved.contactId}`;
        if ((await this.redis.set(sk, saved.id, 'PX', this.contactDebounceMs, 'NX')) === 'OK')
          await autopilotQueue.add(
            'scan-contact',
            {
              workspaceId,
              phone: from,
              contactId: saved.contactId,
              messageContent: message,
              messageId: saved.id,
            },
            {
              jobId: buildQueueJobId('scan-contact', workspaceId, saved.contactId, saved.id),
              delay: this.contactDebounceMs,
              deduplication: {
                id: buildQueueDedupId('scan-contact', workspaceId, saved.contactId),
                ttl: this.contactDebounceMs + 500,
              },
              removeOnComplete: true,
            },
          );
      }
      const apc = this.normalizeJsonObject(settings.autopilot);
      const hf = typeof apc.hotFlowId === 'string' ? apc.hotFlowId : null;
      if (
        hf &&
        [
          'preco',
          'preço',
          'price',
          'quanto',
          'pix',
          'boleto',
          'garantia',
          'comprar',
          'assinar',
        ].some((k) => lower.includes(k))
      )
        await flowQueue.add('run-flow', {
          workspaceId,
          flowId: hf,
          user: nPhone,
          initialVars: { source: 'hot_signal', lastMessage: message },
        });
      if (
        [
          'paguei',
          'pago',
          'pix',
          'pague',
          'comprei',
          'compre',
          'boleto',
          'assinatura',
          'transferi',
          'transferido',
        ].some((k) => lower.includes(k)) &&
        saved?.contactId
      ) {
        const le = await this.prisma.autopilotEvent.findFirst({
          where: { workspaceId, contactId: saved.contactId },
          orderBy: { createdAt: 'desc' },
        });
        if (le && Date.now() - new Date(le.createdAt).getTime() <= 72 * 60 * 60 * 1000) {
          await this.prisma.autopilotEvent.create({
            data: {
              workspaceId,
              contactId: saved.contactId,
              intent: 'BUYING',
              action: 'CONVERSION',
              status: 'executed',
              reason: 'payment_keyword_inbound',
              responseText: message,
              meta: { source: 'inbound', keywordHit: true },
            },
          });
          await this.prisma.contact.updateMany({
            where: { id: saved.contactId, workspaceId },
            data: { purchaseProbability: 'HIGH', sentiment: 'POSITIVE' },
          });
        }
      }
    } catch (e: unknown) {
      this.logger.warn(
        `Autopilot enqueue failed: ${(e instanceof Error ? e : new Error(String(e))).message}`,
      );
      void this.opsAlert?.alertOnCriticalError(e, 'WhatsappService.processInbound.autopilot', {
        workspaceId,
      });
    }
    if (saved?.contactId)
      this.neuroCrm.analyzeContact(workspaceId, saved.contactId).catch(() => {});
    try {
      await this.redis.publish(
        `ws:copilot:${workspaceId}`,
        JSON.stringify({
          type: 'new_message',
          workspaceId,
          contactId: saved?.contactId,
          phone: from,
          message,
        }),
      );
    } catch (e: unknown) {
      this.logger.warn(
        `Copilot pub/sub failed for ws=${workspaceId}: ${(e instanceof Error ? e : new Error(String(e))).message}`,
      );
    }
    return { ok: true };
  }

  // ═══ CONTACTS ═══
  async listContacts(ws: string) {
    const rContacts = this.normalizeContacts(
      await this.providerRegistry.getContacts(ws).catch((e: unknown) => {
        this.slog.error('list_contacts_provider_failed', {
          workspaceId: ws,
          error: String(e instanceof Error ? e.message : e),
        });
        void this.opsAlert?.alertOnCriticalError(e, 'WhatsappService.listContacts', {
          workspaceId: ws,
        });
        return [];
      }),
    );
    const lContacts =
      (await this.prisma.contact.findMany({
        take: 500,
        where: { workspaceId: ws },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      })) || [];
    const merged = new Map<string, NormalizedContact>();
    for (const c of rContacts) merged.set(c.phone, c);
    for (const l of lContacts) {
      const e = merged.get(l.phone);
      merged.set(l.phone, {
        id: e?.id || `${l.phone}@c.us`,
        phone: l.phone,
        name: this.resolveTrustedContactName(l.phone, e?.name, l.name) || null,
        pushName: this.isPlaceholderContactName(e?.pushName, l.phone)
          ? this.isPlaceholderContactName(l.name, l.phone)
            ? null
            : l.name
          : e?.pushName || null,
        shortName: e?.shortName || null,
        email: l.email || e?.email || null,
        localContactId: l.id,
        source: e ? 'waha+crm' : 'crm',
        registered: e?.registered ?? null,
        createdAt: e?.createdAt || l.createdAt?.toISOString?.() || null,
        updatedAt:
          l.updatedAt?.toISOString?.() || e?.updatedAt || l.createdAt?.toISOString?.() || null,
      });
    }
    return Array.from(merged.values()).sort((a, b) => {
      const bu = (b.updatedAt || '').localeCompare(a.updatedAt || '');
      if (bu !== 0) return bu;
      return String(a.name || a.phone).localeCompare(String(b.name || b.phone));
    });
  }
  async createContact(ws: string, input: { phone: string; name?: string; email?: string }) {
    const phone = this.normalizeNumber(input.phone || '');
    if (!phone) throw new BadRequestException('phone é obrigatório');
    const registered = await this.providerRegistry.isRegistered(ws, phone).catch(() => null);
    const contact = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId: ws, phone } },
      update: {
        name: this.resolveTrustedContactName(phone, input.name) || null,
        email: input.email?.trim() || undefined,
      },
      create: {
        workspaceId: ws,
        phone,
        name: this.resolveTrustedContactName(phone, input.name) || null,
        email: input.email?.trim() || undefined,
      },
      select: { id: true, phone: true, name: true, email: true, createdAt: true, updatedAt: true },
    });
    await this.syncRemoteContactProfile(
      ws,
      contact.phone,
      contact.name || input.name || undefined,
    ).catch(() => undefined);
    return {
      id: `${phone}@c.us`,
      phone: contact.phone,
      name: contact.name || null,
      email: contact.email || null,
      localContactId: contact.id,
      source: 'crm',
      registered,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }
  async syncRemoteContactProfile(
    ws: string,
    phone: string,
    name?: string | null,
  ): Promise<boolean> {
    const np = this.normalizeNumber(phone || '');
    const nn = this.resolveTrustedContactName(phone, name);
    if (!np || !nn) return false;
    try {
      return await this.providerRegistry.upsertContactProfile(ws, { phone: np, name: nn });
    } catch (e: unknown) {
      this.logger.warn(
        `Falha ao sincronizar contato ${np}: ${(e instanceof Error ? e : new Error(String(e))).message}`,
      );
      void this.opsAlert?.alertOnCriticalError(e, 'WhatsappService.syncRemoteContactProfile', {
        workspaceId: ws,
        metadata: { phone: np },
      });
      return false;
    }
  }

  // ═══ SESSION ═══
  async createSession(ws: string) {
    const result = await this.providerRegistry.startSession(ws);
    if (!result.success)
      return { error: true, message: result.message || 'failed_to_start_session' };
    const qr = await this.providerRegistry.getQrCode(ws);
    if (qr.success && qr.qr) return { status: 'qr_pending', code: qr.qr, qrCode: qr.qr };
    const status = await this.providerRegistry.getSessionStatus(ws);
    return {
      status: status.connected ? 'already_connected' : status.status,
      qrCode: status.qrCode,
    };
  }
  async recreateSessionIfInvalid(ws: string) {
    await this.providerRegistry.getProviderType(ws);
    const d = await this.providerRegistry.getSessionDiagnostics(ws);
    await this.providerRegistry.getSessionStatus(ws).catch(() => null);
    const invalid =
      !d?.available ||
      d?.configMismatch ||
      d?.webhookConfigured !== true ||
      d?.inboundEventsConfigured !== true ||
      d?.storeEnabled !== true;
    if (!invalid) return { recreated: false, reason: 'session_config_healthy', diagnostics: d };
    await this.providerRegistry.deleteSession(ws).catch(() => undefined);
    const start = await this.providerRegistry.startSession(ws);
    return { recreated: start.success === true, reason: start.message, diagnostics: d };
  }
  getSession(ws: string) {
    return { workspaceId: ws, provider: 'dynamic' };
  }
  async getConnectionStatus(ws: string) {
    const s = await this.providerRegistry.getSessionStatus(ws);
    return { status: s.status, phoneNumber: s.phoneNumber, qrCode: s.qrCode };
  }
  async getQrCode(ws: string) {
    const q = await this.providerRegistry.getQrCode(ws);
    return q.success ? q.qr || null : null;
  }
  async disconnect(ws: string) {
    await this.providerRegistry.disconnect(ws);
  }

  // ═══ OPERATIONAL ═══
  async listOperationalConversations(
    ws: string,
    o?: { limit?: number; pendingOnly?: boolean },
  ): Promise<ConversationOperationalState[]> {
    const convs =
      (await this.prisma.conversation.findMany({
        take: Math.max(1, Math.min(1000, Number(o?.limit || 500) || 500)),
        where: { workspaceId: ws, status: { not: 'CLOSED' } },
        select: {
          id: true,
          status: true,
          mode: true,
          assignedAgentId: true,
          unreadCount: true,
          lastMessageAt: true,
          contact: { select: { id: true, phone: true, name: true } },
          messages: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { id: true, direction: true, createdAt: true, content: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
      })) || [];
    return convs
      .map((c) => buildConversationOperationalState(c as ConversationOperationalLike))
      .filter((c) => !o?.pendingOnly || c.pending);
  }
  async setPresence(
    ws: string,
    chatId: string,
    presence: 'typing' | 'paused' | 'seen' | 'available' | 'offline',
  ) {
    const n = this.normalizeChatId(chatId);
    switch (presence) {
      case 'available':
        await this.providerRegistry.setPresence(ws, 'available', n);
        break;
      case 'offline':
        await this.providerRegistry.setPresence(ws, 'offline', n);
        break;
      case 'typing':
        await this.providerRegistry.sendTyping(ws, n);
        break;
      case 'paused':
        await this.providerRegistry.stopTyping(ws, n);
        break;
      case 'seen':
        await this.markChatAsReadBestEffort(ws, n);
        break;
      default:
        throw new BadRequestException('presence inválida');
    }
    return { ok: true, chatId: n, presence };
  }
  async triggerSync(ws: string, reason = 'manual_sync') {
    return this.catchupService.triggerCatchup(ws, reason);
  }

  // ═══ SEND MESSAGE ═══
  async sendMessage(
    ws: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      externalId?: string;
      complianceMode?: 'reactive' | 'proactive';
      forceDirect?: boolean;
      quotedMessageId?: string;
    },
  ) {
    this.slog.info('send_message', { workspaceId: ws, to });
    await this.planLimits.ensureSubscriptionActive(ws);
    const w = await this.workspaces.getWorkspace(ws);
    const ew = this.workspaces.toEngineWorkspace(w);
    await this.ensureOptInAllowed(ws, to, opts?.complianceMode || 'proactive');
    const missing = this.validateWorkspaceProvider(ew);
    if (missing.length)
      return { error: true, message: `Configuração do provedor incompleta: ${missing.join(', ')}` };
    const r = await this.collectMessagingRuntimeIssues(ws, ew, { requireInboundWebhook: false });
    if (r.issues.length)
      return {
        error: true,
        message: `Runtime do WhatsApp indisponível: ${r.issues.join(', ')}`,
        diagnostics: r.diagnostics,
      };
    if (opts?.forceDirect) {
      const dr = await this.sendDirectlyViaProvider(ws, to, message, opts);
      if (dr.ok) await this.planLimits.trackMessageSend(ws);
      return dr;
    }
    if (!(await this.workerRuntime.isAvailable())) {
      const dr = await this.sendDirectlyViaProvider(ws, to, message, opts);
      if (dr.ok) await this.planLimits.trackMessageSend(ws);
      return dr;
    }
    await flowQueue.add('send-message', {
      type: 'direct',
      workspaceId: ws,
      workspace: ew,
      to,
      message,
      user: to,
      mediaUrl: opts?.mediaUrl,
      mediaType: opts?.mediaType,
      caption: opts?.caption,
      externalId: opts?.externalId,
      quotedMessageId: opts?.quotedMessageId,
    });
    await this.planLimits.trackMessageSend(ws);
    return { ok: true, queued: true, delivery: 'queued' };
  }
  listTemplates(_ws: string) {
    return {
      error: true,
      message: 'Templates legados não são suportados no modo Meta Cloud.',
      data: [],
      total: 0,
    };
  }

  async sendTemplate(
    ws: string,
    to: string,
    template: { name: string; language: string; components?: unknown[] },
  ) {
    this.slog.info('send_template', { workspaceId: ws, to, template: template.name });
    await this.planLimits.ensureSubscriptionActive(ws);
    const w = await this.workspaces.getWorkspace(ws);
    const ew = this.workspaces.toEngineWorkspace(w);
    await this.ensureOptInAllowed(ws, to);
    const m = this.validateWorkspaceProvider(ew);
    if (m.length)
      return { error: true, message: `Configuração do provedor incompleta: ${m.join(', ')}` };
    const r = await this.collectMessagingRuntimeIssues(ws, ew, { requireInboundWebhook: false });
    if (r.issues.length)
      return {
        error: true,
        message: `Runtime do WhatsApp indisponível: ${r.issues.join(', ')}`,
        diagnostics: r.diagnostics,
      };
    await flowQueue.add('send-message', {
      type: 'template',
      workspaceId: ws,
      workspace: ew,
      to,
      template,
      user: to,
    });
    await this.planLimits.trackMessageSend(ws);
    return { ok: true, queued: true, delivery: 'queued' };
  }

  async sendDirectMessage(ws: string, to: string, message: string) {
    const r = await this.sendDirectlyViaProvider(ws, to, message);
    return r.ok === true
      ? { success: true, result: r }
      : { error: true, message: r.message || 'send_failed' };
  }

  private async sendDirectlyViaProvider(
    ws: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      externalId?: string;
      complianceMode?: 'reactive' | 'proactive';
      forceDirect?: boolean;
      quotedMessageId?: string;
    },
  ) {
    const lockKey = `whatsapp:action-lock:${ws}`;
    const token = `${Date.now()}:${randomUUID()}`;
    const ttlMs = Math.max(
      15_000,
      Number.parseInt(process.env.WHATSAPP_ACTION_LOCK_MS || '45000', 10) || 45_000,
    );
    const deadline = Date.now() + ttlMs;
    const tryAcquire = async (): ReturnType<typeof this._sendDirectCore> => {
      if (Date.now() >= deadline) return this._sendDirectCore(ws, to, message, opts);
      if ((await this.redis.set(lockKey, token, 'PX', ttlMs, 'NX')) !== 'OK') {
        await this.sleep(250 + randomInt(250));
        return tryAcquire();
      }
      try {
        return await this._sendDirectCore(ws, to, message, opts);
      } finally {
        const c = await this.redis.get(lockKey).catch(() => null);
        if (c === token) await this.redis.del(lockKey).catch(() => {});
      }
    };
    return tryAcquire();
  }
  private async _sendDirectCore(
    ws: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      quotedMessageId?: string;
      externalId?: string;
    },
  ) {
    const n = this.normalizeChatId(to);
    await this.markChatAsReadBestEffort(ws, n);
    const isTest = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
    if (!isTest) {
      await this.providerRegistry.setPresence(ws, 'available', n).catch(() => {});
      await this.sleep(300 + randomInt(500));
      await this.providerRegistry.sendTyping(ws, n).catch(() => {});
      await this.sleep(
        Math.max(
          500,
          Math.min(
            3500,
            450 + String(opts?.caption || message || '').trim().length * 35 + randomInt(450),
          ),
        ),
      );
      await this.providerRegistry.stopTyping(ws, n).catch(() => {});
    }
    const r = await this.providerRegistry
      .sendMessage(ws, to, message, {
        mediaUrl: opts?.mediaUrl,
        mediaType: opts?.mediaType,
        caption: opts?.caption,
        quotedMessageId: opts?.quotedMessageId,
      })
      .catch((e: unknown) => {
        this.slog.error('send_direct_provider_failed', {
          workspaceId: ws,
          to,
          error: String(e instanceof Error ? e.message : e),
        });
        void this.opsAlert?.alertOnCriticalError(e, 'WhatsappService._sendDirectCore', {
          workspaceId: ws,
          metadata: { to },
        });
        return { success: false, error: String(e instanceof Error ? e.message : e) };
      });
    if (!r.success) {
      await this.providerRegistry.setPresence(ws, 'offline', n).catch(() => {});
      return { error: true, message: r.error || 'send_failed' };
    }
    await this.markChatAsReadBestEffort(ws, to);
    await this.providerRegistry.setPresence(ws, 'offline', n).catch(() => {});
    await this.inbox.saveMessageByPhone({
      workspaceId: ws,
      phone: to,
      content: opts?.caption || message || opts?.mediaUrl || '',
      direction: 'OUTBOUND',
      externalId: 'messageId' in r ? r.messageId : (opts?.externalId ?? null),
      type: opts?.mediaType ? opts.mediaType.toUpperCase() : 'TEXT',
      mediaUrl: opts?.mediaUrl,
      status: 'SENT',
    });
    return {
      ok: true,
      direct: true,
      delivery: 'sent',
      messageId: 'messageId' in r ? r.messageId : null,
    };
  }

  // ═══ OPT-IN / OUT ═══
  async optInContact(ws: string, phone: string) {
    const c = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId: ws, phone } },
      update: {},
      create: { workspaceId: ws, phone, name: null },
    });
    await this.prisma.contact.updateMany({
      where: { id: c.id, workspaceId: ws },
      data: { optIn: true, optedOutAt: null },
    });
    const t = await this.prisma.tag.upsert({
      where: { workspaceId_name: { workspaceId: ws, name: 'optin_whatsapp' } },
      update: {},
      create: { workspaceId: ws, name: 'optin_whatsapp', color: '#16a34a' },
    });
    await this.prisma.contact.update({
      where: { workspaceId_phone: { workspaceId: ws, phone } },
      data: { tags: { connect: { id: t.id } } },
    });
    return { ok: true };
  }
  async optOutContact(ws: string, phone: string) {
    const c = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId: ws, phone } },
      select: { id: true },
    });
    if (!c) return { ok: true };
    await this.prisma.contact.updateMany({
      where: { id: c.id, workspaceId: ws },
      data: { optIn: false, optedOutAt: new Date() },
    });
    const t = await this.prisma.tag.findUnique({
      where: { workspaceId_name: { workspaceId: ws, name: 'optin_whatsapp' } },
      select: { id: true },
    });
    if (t)
      await this.prisma.contact.update({
        where: { workspaceId_phone: { workspaceId: ws, phone } },
        data: { tags: { disconnect: { id: t.id } } },
      });
    return { ok: true };
  }
  async optInBulk(ws: string, phones: string[]) {
    const u = Array.from(new Set((phones || []).map((p) => p?.trim()).filter(Boolean)));
    const r: { phone: string; ok: boolean }[] = [];
    await forEachSequential(u, async (p) => {
      try {
        await this.optInContact(ws, p);
        r.push({ phone: p, ok: true });
      } catch (e: unknown) {
        this.logger.warn(
          `optInContact failed for ${p} in ws=${ws}: ${(e instanceof Error ? e : new Error(String(e))).message}`,
        );
        r.push({ phone: p, ok: false });
      }
    });
    return { ok: true, processed: r.length, results: r };
  }
  async optOutBulk(ws: string, phones: string[]) {
    const u = Array.from(new Set((phones || []).map((p) => p?.trim()).filter(Boolean)));
    const r: { phone: string; ok: boolean }[] = [];
    await forEachSequential(u, async (p) => {
      try {
        await this.optOutContact(ws, p);
        r.push({ phone: p, ok: true });
      } catch (e: unknown) {
        this.logger.warn(
          `optOutContact failed for ${p} in ws=${ws}: ${(e instanceof Error ? e : new Error(String(e))).message}`,
        );
        r.push({ phone: p, ok: false });
      }
    });
    return { ok: true, processed: r.length, results: r };
  }
  async getOptInStatus(ws: string, phone: string) {
    const c = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId: ws, phone } },
      select: { id: true, tags: { select: { name: true } } },
    });
    if (!c) return { optIn: false, contactExists: false };
    return {
      optIn: c.tags.some((t: { name: string }) => t.name === 'optin_whatsapp'),
      contactExists: true,
    };
  }

  private async ensureOptInAllowed(
    ws: string,
    phone: string,
    complianceMode: 'reactive' | 'proactive' = 'proactive',
  ) {
    const eo = process.env.ENFORCE_OPTIN === 'true';
    const e24 = (process.env.AUTOPILOT_ENFORCE_24H ?? 'false').toLowerCase() !== 'false';
    const c = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId: ws, phone } },
      select: {
        id: true,
        optIn: true,
        optedOutAt: true,
        customFields: true,
        tags: { select: { name: true } },
      },
    });
    if (c && c.optIn === false)
      throw new ForbiddenException('Contato cancelou o recebimento de mensagens (opt-out)');
    if (complianceMode === 'reactive') return;
    if (eo) {
      if (!c) throw new ForbiddenException('Contato sem opt-in para WhatsApp');
      const cf = (c.customFields as Record<string, unknown>) || {};
      const has =
        c.optIn === true ||
        c.tags.some((t: { name: string }) => t.name === 'optin_whatsapp') ||
        cf.optin === true ||
        cf.optin_whatsapp === true;
      if (!has) throw new ForbiddenException('Contato sem opt-in para WhatsApp');
    }
    if (e24) {
      const li = await this.prisma.message.findFirst({
        where: { workspaceId: ws, contact: { phone }, direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (!li || li.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000)
        throw new ForbiddenException('Fora da janela de 24h para envio');
    }
  }

  // ═══ INFRA ═══
  private validateWorkspaceProvider(w: Record<string, unknown>): string[] {
    const p = w?.whatsappProvider || 'meta-cloud';
    return p !== 'meta-cloud' ? ['whatsapp_provider'] : [];
  }
  private async collectMessagingRuntimeIssues(
    ws: string,
    workspace: Record<string, unknown>,
    o?: { requireInboundWebhook?: boolean },
  ) {
    const issues = this.validateWorkspaceProvider(workspace);
    const pt = await this.providerRegistry.getProviderType(ws);
    const d: {
      webhook: ReturnType<typeof this.whatsappApi.getRuntimeConfigDiagnostics>;
      session: (SessionStatus & { error?: string }) | null;
    } = {
      webhook: this.whatsappApi.getRuntimeConfigDiagnostics(),
      session: null,
    };
    if (o?.requireInboundWebhook) {
      if (!d.webhook.webhookConfigured) issues.push('meta_webhook_missing');
      else if (!d.webhook.inboundEventsConfigured)
        issues.push('meta_webhook_events_missing_inbound');
    }
    try {
      d.session = await this.providerRegistry.getSessionStatus(ws);
      if (!d.session.connected)
        issues.push(
          `${pt.replace(PATTERN_RE, '_')}_session_${String(d.session.status || 'unknown').toLowerCase()}`,
        );
    } catch (e: unknown) {
      issues.push(`${pt.replace(PATTERN_RE, '_')}_session_status_unavailable`);
      d.session = {
        connected: false,
        status: 'UNKNOWN',
        error: e instanceof Error ? e.message : 'unknown_error',
      };
      void this.opsAlert?.alertOnCriticalError(e, 'WhatsappService.runDiagnostics.session', {
        workspaceId: ws,
      });
    }
    return { issues, diagnostics: d };
  }

  private async resolveReadChatCandidates(ws: string, chatIdOrPhone: string): Promise<string[]> {
    const nChat = this.normalizeChatId(chatIdOrPhone);
    const nPhone = this.normalizeNumber(this.providerExtract(nChat));
    const c = nPhone
      ? await this.prisma.contact
          .findUnique({
            where: { workspaceId_phone: { workspaceId: ws, phone: nPhone } },
            select: { customFields: true },
          })
          .catch(() => null)
      : null;
    const cf = this.normalizeJsonObject(c?.customFields);
    return Array.from(
      new Set(
        [
          nChat,
          this.readText(cf.lastRemoteChatId),
          this.readText(cf.lastCatalogChatId),
          this.readText(cf.lastResolvedChatId),
          nPhone ? `${nPhone}@c.us` : '',
          nPhone ? `${nPhone}@s.whatsapp.net` : '',
        ].filter(Boolean),
      ),
    );
  }
  private async markChatAsReadBestEffort(ws: string, chatIdOrPhone: string): Promise<void> {
    const cs = await this.resolveReadChatCandidates(ws, chatIdOrPhone);
    await forEachSequential(cs, async (c) => {
      await this.providerRegistry.readChatMessages(ws, c).catch(() => {});
    });
  }

  // ═══ GROUP MANAGEMENT ═══
  async listMonitoredGroups(ws: string) {
    return this.prisma.monitoredGroup.findMany({
      where: { workspaceId: ws },
      include: { members: { take: 500 }, keywords: { take: 200 } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async addMonitoredGroup(
    ws: string,
    d: { jid: string; name?: string; inviteLink?: string; settings?: Record<string, unknown> },
  ) {
    return this.prisma.monitoredGroup.create({
      data: {
        jid: d.jid,
        name: d.name,
        inviteLink: d.inviteLink,
        settings: JSON.parse(JSON.stringify(d.settings || {})) as Prisma.InputJsonObject,
        workspace: { connect: { id: ws } },
      },
    });
  }
  async listGroupMembers(gid: string) {
    return this.prisma.groupMember.findMany({
      take: 500,
      where: { groupId: gid },
      select: { id: true, groupId: true, phone: true, isAdmin: true, createdAt: true },
    });
  }
  async addGroupMember(gid: string, ws: string, phone: string, isAdmin = false) {
    const g = await this.prisma.monitoredGroup.findFirst({
      where: { id: gid, workspaceId: ws },
      select: { id: true },
    });
    if (!g) throw new NotFoundException('Group not found');
    return this.prisma.groupMember.create({ data: { groupId: gid, phone, isAdmin } });
  }
  async listBannedKeywords(gid: string) {
    return this.prisma.bannedKeyword.findMany({
      take: 200,
      where: { groupId: gid },
      select: { id: true, groupId: true, keyword: true, action: true, createdAt: true },
    });
  }
  async addBannedKeyword(gid: string, ws: string, keyword: string, action: string) {
    const g = await this.prisma.monitoredGroup.findFirst({
      where: { id: gid, workspaceId: ws },
      select: { id: true },
    });
    if (!g) throw new NotFoundException('Group not found');
    return this.prisma.bannedKeyword.create({ data: { groupId: gid, keyword, action } });
  }
}
