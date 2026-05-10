import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../logging/structured-logger';
import { OpsAlertService } from '../observability/ops-alert.service';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import {
  buildConversationOperationalState,
  type ConversationOperationalLike,
  type ConversationOperationalState,
} from './agent-conversation-state.util';
import * as chatHelpers from './whatsapp.service.chats';
import type { ChatHelperDeps } from './whatsapp.service.chats';
import { CiaRuntimeService } from './cia-runtime.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { isPlaceholderContactName as isPlaceholderName } from './whatsapp-normalization.util';
import {
  normalizeJsonObjExt,
  resolveTimestampExt,
  toIsoTimestamp,
} from './whatsapp-service.helpers';
import {
  normalizeContactsArray,
  normalizeChatsArray,
  normalizeMessagesArray,
  unwrapProviderArray,
} from './whatsapp.service.normalizers';
import { rankByPurchaseProbability } from './whatsapp.service.ranking';
import { collectCatalogContactEntriesExt } from './whatsapp-catalog-contact-collector';
import type {
  NormalizedContact,
  NormalizedChat,
} from './whatsapp-service.types';
import { WhatsappSessionService } from './whatsapp-session.service';
import { WhatsappMessageDispatcherService } from './whatsapp-message-dispatcher.service';
import { WhatsappReconcilerService } from './whatsapp-reconciler.service';

type ExternalProviderPayload = Record<string, unknown>;

const D_RE = /\D/g;

@Injectable()
export class WhatsappService {
  private readonly slog = new StructuredLogger('whatsapp-service');

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly ciaRuntime: CiaRuntimeService,
    private readonly sessionService: WhatsappSessionService,
    private readonly messageDispatcher: WhatsappMessageDispatcherService,
    private readonly reconciler: WhatsappReconcilerService,
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
  private normalizeJsonObject(v: unknown): ExternalProviderPayload {
    return normalizeJsonObjExt(v);
  }
  private resolveTimestamp(v: unknown): number {
    return resolveTimestampExt(v);
  }
  private toIsoTimestamp(ts: number): string | null {
    return toIsoTimestamp(ts);
  }
  normalizeChatId(chatId: string): string {
    return String(chatId || '').includes('@') ? chatId : `${this.normalizeNumber(chatId)}@c.us`;
  }
  private get providerExtract() {
    return this.providerRegistry.extractPhoneFromChatId.bind(this.providerRegistry);
  }

  // ═══ CHAT HELPER (thin wrapper) ═══
  private getChatHelperDeps(): ChatHelperDeps {
    return {
      prisma: this.prisma,
      providerRegistry: this.providerRegistry,
      normalizeChats: (r: unknown) => this.normalizeChats(r),
      normalizeMessages: (r: unknown, fc: string) => this.normalizeMessages(r, fc),
      normalizeNumber: (n: string) => this.normalizeNumber(n),
      normalizeChatId: (c: string) => this.normalizeChatId(c),
      isIndividualChatId: (c?: string | null) => this.isIndividualChatId(c),
      toIsoTimestamp: (ts: number) => this.toIsoTimestamp(ts),
      resolveTimestamp: (v: unknown) => this.resolveTimestamp(v),
      resolveTrustedContactName: (p: string, ...cs: unknown[]) =>
        this.resolveTrustedContactName(p, ...cs),
      listOperationalConversations: (ws: string, o?: unknown) =>
        this.listOperationalConversations(ws, o as { limit?: number; pendingOnly?: boolean }),
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
    const r = raw as ExternalProviderPayload | undefined;
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
          isPlaceholder: (v: unknown, p?: string | null) => this.isPlaceholderContactName(v, p),
          resolveName: (p: string, ...cs: unknown[]) => this.resolveTrustedContactName(p, ...cs),
          extractPhone: (id: string) => this.providerExtract(id),
        }),
      )
      .filter((c): c is NormalizedContact => c !== null);
  }
  private normalizeChats(raw: unknown): NormalizedChat[] {
    const r = raw as ExternalProviderPayload | undefined;
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
          resolveName: (p: string, ...cs: unknown[]) => this.resolveTrustedContactName(p, ...cs),
          extractPhone: (id: string) => this.providerExtract(id),
          isPlaceholder: (v: unknown, p?: string | null) => this.isPlaceholderContactName(v, p),
        }),
      )
      .filter((c): c is NormalizedChat => c !== null);
  }
  private normalizeMessages(raw: unknown, fallbackChatId: string) {
    const r = raw as ExternalProviderPayload | undefined;
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
          extractPhone: (id: string) => this.providerExtract(id),
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
      { prisma: this.prisma, resolveName: (p: string, ...cs: unknown[]) => this.resolveTrustedContactName(p, ...cs) },
      ws,
      o,
    );
  }

  // ═══ DELEGATION: Reconciler ═══
  async handleIncoming(workspaceId: string, from: string, message: string) {
    return this.reconciler.handleIncoming(workspaceId, from, message);
  }
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
    return this.reconciler.syncRemoteContactProfile(ws, phone, name);
  }
  async optInContact(ws: string, phone: string) {
    return this.reconciler.optInContact(ws, phone);
  }
  async optOutContact(ws: string, phone: string) {
    return this.reconciler.optOutContact(ws, phone);
  }
  async optInBulk(ws: string, phones: string[]) {
    return this.reconciler.optInBulk(ws, phones);
  }
  async optOutBulk(ws: string, phones: string[]) {
    return this.reconciler.optOutBulk(ws, phones);
  }
  async getOptInStatus(ws: string, phone: string) {
    return this.reconciler.getOptInStatus(ws, phone);
  }

  // ═══ DELEGATION: Session ═══
  async createSession(ws: string) {
    return this.sessionService.createSession(ws);
  }
  async recreateSessionIfInvalid(ws: string) {
    return this.sessionService.recreateSessionIfInvalid(ws);
  }
  getSession(ws: string) {
    return this.sessionService.getSession(ws);
  }
  async getConnectionStatus(ws: string) {
    return this.sessionService.getConnectionStatus(ws);
  }
  async getQrCode(ws: string) {
    return this.sessionService.getQrCode(ws);
  }
  async disconnect(ws: string) {
    return this.sessionService.disconnect(ws);
  }
  async setPresence(
    ws: string,
    chatId: string,
    presence: 'typing' | 'paused' | 'seen' | 'available' | 'offline',
  ) {
    return this.sessionService.setPresence(ws, chatId, presence);
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
  async triggerSync(ws: string, reason = 'manual_sync') {
    return this.catchupService.triggerCatchup(ws, reason);
  }

  // ═══ DELEGATION: Message Dispatcher ═══
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
    return this.messageDispatcher.sendMessage(ws, to, message, opts);
  }
  listTemplates(ws: string) {
    return this.messageDispatcher.listTemplates(ws);
  }
  async sendTemplate(
    ws: string,
    to: string,
    template: { name: string; language: string; components?: unknown[] },
  ) {
    return this.messageDispatcher.sendTemplate(ws, to, template);
  }
  async sendDirectMessage(ws: string, to: string, message: string) {
    return this.messageDispatcher.sendDirectMessage(ws, to, message);
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
    d: { jid: string; name?: string; inviteLink?: string; settings?: ExternalProviderPayload },
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
